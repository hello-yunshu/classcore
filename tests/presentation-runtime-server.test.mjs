import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectReferenceClient, waitForHttpReady } from '../scripts/lib/ws-reference-client.mjs';

function waitForExit(child) {
    if (child.exitCode !== null) return Promise.resolve(child.exitCode);
    return new Promise(resolve => child.once('exit', resolve));
}
function waitForMessage(client, predicate, timeoutMs = 3000) {
    const found = client.messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('presentation-sync-timeout')), timeoutMs);
        const onMessage = event => {
            const message = JSON.parse(String(event.data));
            if (!predicate(message)) return;
            clearTimeout(timer);
            client.ws.removeEventListener('message', onMessage);
            resolve(message);
        };
        client.ws.addEventListener('message', onMessage);
    });
}

test('reference Presentation API pins exact revision and recovers authoritative playback after restart', async () => {
    const port = 30100 + Math.floor(Math.random() * 200);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-presentation-server-'));
    const env = { ...process.env, PORT: String(port), LOCAL_TOOLS_PORT: String(port + 1000), CLASSROOM_DATA_DIR: dataDir };
    const runtimeIndex = { deckId: 'deck:server', documentFormatVersion: 'test', generatedAt: '2026-09-11T00:00:00.000Z', scenes: [{ sceneId: 'scene:1', index: 0, maxStep: 2 }] };
    let child;
    let teacher;
    let display;
    try {
        child = spawn(process.execPath, ['apps/server/runtime/server.mjs'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
        await waitForHttpReady(`http://127.0.0.1:${port}/readyz`);
        const headers = { 'content-type': 'application/json', 'x-classcore-user-id': 'teacher:1' };
        const createResponse = await fetch(`http://127.0.0.1:${port}/api/presentations`, { method: 'POST', headers, body: JSON.stringify({ title: '课堂 deck', bytesBase64: Buffer.from('server-pptx').toString('base64'), mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', document: { format: 'test', pageCount: 1 } }) });
        assert.equal(createResponse.status, 201);
        const project = (await createResponse.json()).presentation;
        const publishResponse = await fetch(`http://127.0.0.1:${port}/api/presentations/${project.presentationId}/published`, { method: 'POST', headers, body: JSON.stringify({ engine: { engineId: 'web-ppt', engineVersion: 'test', documentFormatVersion: 'test' }, runtimeIndex }) });
        assert.equal(publishResponse.status, 201);
        const published = (await publishResponse.json()).revision;
        const pinResponse = await fetch(`http://127.0.0.1:${port}/api/sessions/session:server/presentation-pin`, { method: 'PUT', headers, body: JSON.stringify({ presentationId: project.presentationId, revisionId: published.revisionId }) });
        assert.equal(pinResponse.status, 200);

        display = await connectReferenceClient(`ws://127.0.0.1:${port}/ws`, { role: 'display', clientId: 'display:1', sessionId: 'session:server' });
        teacher = await connectReferenceClient(`ws://127.0.0.1:${port}/ws`, { role: 'teacher', clientId: 'teacher:1', sessionId: 'session:server' });
        const control = await teacher.request({ type: 'presentation.control', controlId: 'presentation-control:1', action: 'goto', sceneId: 'scene:1', step: 2, expectedRevision: 0 }, 'presentation-control:1');
        assert.equal(control.message.ok, true);
        assert.equal(control.message.state.step, 2);
        const synced = await waitForMessage(display, message => message.type === 'presentation.sync' && message.state?.revision === 1);
        assert.equal(synced.state.presentationRevisionId, published.revisionId);

        display.ws.close();
        teacher.ws.close();
        child.kill('SIGTERM');
        await waitForExit(child);
        child = spawn(process.execPath, ['apps/server/runtime/server.mjs'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
        await waitForHttpReady(`http://127.0.0.1:${port}/readyz`);
        const reconnected = await connectReferenceClient(`ws://127.0.0.1:${port}/ws`, { role: 'display', clientId: 'display:2', sessionId: 'session:server' });
        const restored = await waitForMessage(reconnected, message => message.type === 'presentation.sync' && message.reason === 'reconnect');
        assert.equal(restored.state.sceneId, 'scene:1');
        assert.equal(restored.state.step, 2);
        reconnected.ws.close();
    } finally {
        display?.ws.close();
        teacher?.ws.close();
        if (child?.exitCode === null) {
            child.kill('SIGTERM');
            await waitForExit(child);
        }
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
