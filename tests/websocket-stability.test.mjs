import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { waitForHttpReady } from '../scripts/lib/ws-reference-client.mjs';
function waitForChild(child) {
    if (child.exitCode !== null)
        return Promise.resolve(child.exitCode);
    return new Promise((resolve) => child.once('exit', resolve));
}
test('reference server closes an oversized WebSocket message without crashing', async () => {
    const port = 25000 + Math.floor(Math.random() * 1000);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-ws-limit-'));
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['apps/server/runtime/server.mjs'], {
        env: {
            ...process.env,
            HOST: '127.0.0.1',
            PORT: String(port),
            CLASSROOM_DATA_DIR: dataDir,
            MAX_WS_MESSAGE_BYTES: '512',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
        await waitForHttpReady(`${baseUrl}/readyz`);
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const closed = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('websocket-close-timeout')), 3000);
            ws.onclose = (event) => {
                clearTimeout(timer);
                resolve(event.code);
            };
            ws.onerror = () => {
                // Some runtimes report the protocol close as an error before onclose.
            };
        });
        await new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = () => reject(new Error('websocket-open-failed'));
        });
        ws.send(JSON.stringify({ type: 'hello', role: 'student', clientId: 'student:1', sessionId: 'session:1' }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        ws.send(JSON.stringify({ type: 'student.event', eventId: 'large', payload: { text: 'x'.repeat(2000) } }));
        const closeCode = await closed;
        assert.equal(closeCode, 1009);
        const health = await (await fetch(`${baseUrl}/healthz`)).json();
        assert.equal(health.ok, true);
    }
    finally {
        child.kill('SIGTERM');
        await waitForChild(child);
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

