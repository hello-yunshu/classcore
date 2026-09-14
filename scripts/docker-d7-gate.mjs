import { spawnSync } from 'node:child_process';
import { waitForHttpReady } from './lib/ws-reference-client.mjs';
const root = process.cwd();
const project = `classroom-runtime-d7-${process.pid}-${Date.now()}`;
const compose = ['compose', '-p', project, '-f', 'deploy/docker/docker-compose.d7.yml'];
function run(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`docker ${args.join(' ')} failed`);
}
function dockerAvailable() { return spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0; }
async function assertUnauthenticatedTeacherRejected() {
  await new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:9602/ws');
    let accepted = false;
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('unauthenticated-teacher-probe-timeout')); }, 3000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'teacher', clientId: 'd7-unauth-probe', sessionId: 'session:d7-probe' }));
    ws.onerror = () => { clearTimeout(timer); resolve(); };
    ws.onclose = () => { clearTimeout(timer); if (!accepted) resolve(); };
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'hello.ack' && message.ok === true) {
        accepted = true; clearTimeout(timer); try { ws.close(); } catch {} reject(new Error('SECURITY_ASSERTION_FAILED: unauthenticated client self-declared teacher and was accepted'));
      } else if (message.type === 'hello.ack' && message.ok === false) {
        clearTimeout(timer); try { ws.close(); } catch {} resolve();
      }
    };
  });
}
if (!dockerAvailable()) { console.error('D7 authenticated Docker gate FAILED: Docker unavailable'); process.exit(2); }
try {
  run([...compose, 'config', '--quiet']);
  run([...compose, 'up', '-d', '--build']);
  try {
    await Promise.all([waitForHttpReady('http://127.0.0.1:9602/healthz', 120, 100), waitForHttpReady('http://127.0.0.1:9688/healthz', 120, 100)]);
  } catch (error) {
    const logs = spawnSync('docker', [...compose, 'logs', '--no-color'], { cwd: root, encoding: 'utf8' });
    const detail = (logs.stdout || logs.stderr || '').trim().slice(-2000);
    throw new Error(`D7 runtime did not become healthy: ${error instanceof Error ? error.message : String(error)}${detail ? `; container logs: ${detail}` : ''}`);
  }
  const response = await fetch('http://127.0.0.1:9602/readyz');
  const ready = await response.json();
  if (ready.runtimeMode !== 'authenticated-classroom-server' || ready.authentication !== true || ready.productReady !== true) {
    throw new Error(`D7 runtime identity FAILED: expected authenticated-classroom-server/authentication=true/productReady=true; got ${JSON.stringify(ready)}`);
  }
  await assertUnauthenticatedTeacherRejected();
  console.log('D7 authenticated Docker gate PASSED: product runtime identity verified and unauthenticated Teacher probe rejected');
} finally {
  spawnSync('docker', [...compose, 'down', '-v', '--remove-orphans'], { cwd: root, stdio: 'ignore' });
}
