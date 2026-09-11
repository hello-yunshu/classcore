import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { waitForHttpReady } from '../scripts/lib/ws-reference-client.mjs';

function connect(url, { clientId, participantId, sessionId }) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        const messages = [];
        const timer = setTimeout(() => reject(new Error('lease-connect-timeout')), 3000);
        socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'hello', role: 'teacher', clientId, participantId, sessionId })));
        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('lease-websocket-error')); });
        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data));
            messages.push(message);
            if (message.type === 'hello.ack') {
                clearTimeout(timer);
                resolve({ socket, messages });
            }
        });
    });
}

function nextMessage(client, type, timeoutMs = 2000) {
    const existing = client.messages.find(message => message.type === type);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`lease-message-timeout:${type}`)), timeoutMs);
        const listener = event => {
            const message = JSON.parse(String(event.data));
            if (message.type !== type) return;
            clearTimeout(timer);
            client.socket.removeEventListener('message', listener);
            resolve(message);
        };
        client.socket.addEventListener('message', listener);
    });
}

test('teacher controller lease survives refresh and rejects stale replacement', async () => {
    const port = 32000 + Math.floor(Math.random() * 100);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-lease-'));
    const env = { ...process.env, PORT: String(port), LOCAL_TOOLS_PORT: String(port + 1000), CLASSROOM_DATA_DIR: dataDir };
    let child;
    const clients = [];
    try {
        child = spawn(process.execPath, ['apps/server/runtime/server.mjs'], { env, stdio: ['ignore', 'ignore', 'ignore'] });
        await waitForHttpReady(`http://127.0.0.1:${port}/readyz`);
        const sessionId = 'session:lease';
        const first = await connect(`ws://127.0.0.1:${port}/ws`, { clientId: 'connection:a', participantId: 'teacher:one', sessionId });
        clients.push(first);
        const other = await connect(`ws://127.0.0.1:${port}/ws`, { clientId: 'connection:other', participantId: 'teacher:two', sessionId });
        clients.push(other);
        other.socket.send(JSON.stringify({ type: 'teacher.heartbeat' }));
        assert.equal((await nextMessage(other, 'teacher.heartbeat.ack')).reason, 'controller-lease-held-by-other');

        first.socket.close();
        await new Promise(resolve => setTimeout(resolve, 80));
        const refreshed = await connect(`ws://127.0.0.1:${port}/ws`, { clientId: 'connection:refresh', participantId: 'teacher:one', sessionId });
        clients.push(refreshed);
        refreshed.socket.send(JSON.stringify({ type: 'teacher.heartbeat' }));
        assert.equal((await nextMessage(refreshed, 'teacher.heartbeat.ack')).ok, true);

        const stale = await connect(`ws://127.0.0.1:${port}/ws`, { clientId: 'connection:stale', participantId: 'teacher:one', sessionId });
        clients.push(stale);
        stale.socket.send(JSON.stringify({ type: 'teacher.heartbeat' }));
        assert.equal((await nextMessage(stale, 'teacher.heartbeat.ack')).reason, 'controller-lease-held-by-other');
    }
    finally {
        clients.forEach(client => client.socket.close());
        if (child?.exitCode === null) {
            child.kill('SIGTERM');
            await new Promise(resolve => child.once('exit', resolve));
        }
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
