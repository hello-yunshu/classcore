import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { connectReferenceClient, waitForHttpReady } from './lib/ws-reference-client.mjs';

const root = process.cwd();
const suffix = `${process.pid}-${Date.now()}`;
const image = `classroom-runtime:gate-${suffix}`;
const container = `classroom-runtime-gate-${suffix}`;
const volume = `classroom-runtime-gate-${suffix}`;
const basePort = 31000 + (process.pid % 1000) * 2;
const classroomPort = basePort;
const localToolsPort = basePort + 1;
const loopbackClassroomUrl = `http://127.0.0.1:${classroomPort}`;
const localToolsUrl = `http://127.0.0.1:${localToolsPort}`;
const wsUrl = `ws://127.0.0.1:${classroomPort}/ws`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : '';
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `\n${detail}` : ''}`);
  }
  return options.capture ? String(result.stdout ?? '').trim() : '';
}

function dockerAvailable() {
  return spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0;
}

function startContainer() {
  run('docker', [
    'run', '-d', '--name', container,
    '-p', `127.0.0.1:${classroomPort}:9602`,
    '-p', `127.0.0.1:${localToolsPort}:9688`,
    '-v', `${volume}:/data`,
    image,
  ], { capture: true });
}

function stopContainer() {
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
}

async function assertHttp() {
  await Promise.all([
    waitForHttpReady(`${loopbackClassroomUrl}/healthz`, 120, 100),
    waitForHttpReady(`${localToolsUrl}/healthz`, 120, 100),
  ]);
  const backstage = await fetch(`${localToolsUrl}/backstage`);
  if (!backstage.ok) throw new Error(`Backstage local-tools endpoint failed: ${backstage.status}`);
  const authoring = await fetch(`${localToolsUrl}/authoring`);
  if (!authoring.ok) throw new Error(`Authoring local-tools endpoint failed: ${authoring.status}`);
  if ((await fetch(`${loopbackClassroomUrl}/authoring`)).status !== 404) throw new Error('Authoring must not be exposed on classroom endpoint');
  if ((await fetch(`${loopbackClassroomUrl}/simulation`)).status !== 404) throw new Error('Simulation must not be exposed by production server');
}

async function teacherControl(controlId) {
  const client = await connectReferenceClient(wsUrl, {
    role: 'teacher',
    clientId: `docker-gate:${controlId}`,
    sessionId: 'session:docker-gate',
  });
  try {
    const { message } = await client.request({ type: 'teacher.control', controlId }, controlId);
    return message;
  } finally {
    client.ws.close();
  }
}

if (!dockerAvailable()) {
  console.error('Docker release gate SKIPPED/FAILED: Docker daemon unavailable. 在教师 Apple Silicon Mac 上必须补跑 npm run docker:gate。');
  process.exit(2);
}
try {
  run('docker', ['compose', '-f', 'deploy/docker/docker-compose.example.yml', 'config', '--quiet']);
  run('docker', ['volume', 'create', volume], { capture: true });
  run('bash', ['deploy/docker/build-current.sh', image]);
  const imageArch = run('docker', ['image', 'inspect', image, '--format', '{{.Architecture}}'], { capture: true });
  const imageUser = run('docker', ['image', 'inspect', image, '--format', '{{.Config.User}}'], { capture: true });
  const expectedArch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : null;
  if (expectedArch && imageArch !== expectedArch) throw new Error(`Docker image architecture mismatch: ${imageArch} != ${expectedArch}`);
  if (imageUser !== 'node') throw new Error(`Docker runtime must be non-root node user, got ${imageUser || '<root>'}`);

  startContainer();
  await assertHttp();
  const first = await teacherControl('control:docker-gate:1');
  if (!first.ok || first.duplicate || first.serverSeq !== 1) throw new Error(`Unexpected first control ack: ${JSON.stringify(first)}`);

  stopContainer();
  startContainer();
  await assertHttp();
  const duplicate = await teacherControl('control:docker-gate:1');
  if (!duplicate.ok || !duplicate.duplicate || duplicate.serverSeq !== 1) {
    throw new Error(`Restart idempotency/recovery failed: ${JSON.stringify(duplicate)}`);
  }
  const second = await teacherControl('control:docker-gate:2');
  if (!second.ok || second.duplicate || second.serverSeq !== 2) {
    throw new Error(`Restart sequence continuation failed: ${JSON.stringify(second)}`);
  }
  console.log(`Docker release gate PASSED: imageArch=${imageArch}; user=${imageUser}; classroom(loopback probe)=${loopbackClassroomUrl}; localTools=${localToolsUrl}; restart serverSeq 1 -> 2`);
  console.log('Reference Docker gate is loopback-only by design; LAN publication is reserved for authenticated D7 gate.');
} finally {
  stopContainer();
  spawnSync('docker', ['volume', 'rm', '-f', volume], { stdio: 'ignore' });
  spawnSync('docker', ['image', 'rm', '-f', image], { stdio: 'ignore' });
}
