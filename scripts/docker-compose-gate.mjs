import { spawnSync } from 'node:child_process';
import { waitForHttpReady } from './lib/ws-reference-client.mjs';
const root = process.cwd();
const project = `classroom-runtime-reference-${process.pid}-${Date.now()}`;
const compose = ['compose', '-p', project, '-f', 'deploy/docker/docker-compose.example.yml'];
function run(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`docker ${args.join(' ')} failed`);
}
function dockerAvailable() { return spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0; }
if (!dockerAvailable()) { console.error('Reference compose gate FAILED: Docker unavailable'); process.exit(2); }
try {
  run([...compose, 'config', '--quiet']);
  run([...compose, 'up', '-d', '--build']);
  await Promise.all([waitForHttpReady('http://127.0.0.1:9602/healthz', 120, 100), waitForHttpReady('http://127.0.0.1:9688/healthz', 120, 100)]);
  const ready = await (await fetch('http://127.0.0.1:9602/readyz')).json();
  if (ready.runtimeMode !== 'reference-transport' || ready.authentication !== false || ready.productReady !== false) throw new Error(`unexpected reference runtime identity: ${JSON.stringify(ready)}`);
  console.log('Reference Docker Compose gate PASSED: both endpoints are loopback-only and runtime identifies as reference transport');
} finally {
  spawnSync('docker', [...compose, 'down', '-v', '--remove-orphans'], { cwd: root, stdio: 'ignore' });
}
