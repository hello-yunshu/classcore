import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { waitForHttpReady } from '../scripts/lib/ws-reference-client.mjs';

test('raw asset API supports owner-scoped draft autosave and server-owned publish fingerprint', async () => {
    const port = 30500 + Math.floor(Math.random() * 150);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-presentation-api-'));
    const env = { ...process.env, PORT: String(port), LOCAL_TOOLS_PORT: String(port + 1000), CLASSROOM_DATA_DIR: dataDir };
    const headers = { 'x-classcore-user-id': 'teacher:api' };
    const runtimeIndex = { deckId: 'deck:api', documentFormatVersion: 'web-ppt-ooxml-v1', generatedAt: '2026-09-11T00:00:00.000Z', scenes: [{ sceneId: 'scene:1', index: 0, maxStep: 0 }] };
    let child;
    try {
        child = spawn(process.execPath, ['apps/server/runtime/server.mjs'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
        await waitForHttpReady(`http://127.0.0.1:${port}/readyz`);
        const upload = await fetch(`http://127.0.0.1:${port}/api/presentation-assets`, { method: 'POST', headers: { ...headers, 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }, body: Buffer.from('raw-pptx') });
        assert.equal(upload.status, 201);
        const asset = (await upload.json()).asset;
        assert.equal(asset.size, 8);
        const created = await fetch(`http://127.0.0.1:${port}/api/presentations`, {
            method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'API 课件', assetId: asset.assetId, document: { format: 'web-ppt-ooxml-v1', idPrefix: 'api', deckId: 'deck:api', pageCount: 1 } }),
        });
        assert.equal(created.status, 201);
        const project = (await created.json()).presentation;
        const forbidden = await fetch(`http://127.0.0.1:${port}/api/presentations`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-classcore-user-id': 'teacher:other' },
            body: JSON.stringify({ title: '越权', assetId: asset.assetId, document: { format: 'web-ppt-ooxml-v1', idPrefix: 'other' } }),
        });
        assert.equal(forbidden.status, 404);
        const draft = await fetch(`http://127.0.0.1:${port}/api/presentations/${project.presentationId}/draft`, {
            method: 'PUT',
            headers: { ...headers, 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'if-match': '1', 'x-presentation-document': JSON.stringify({ format: 'web-ppt-ooxml-v1', idPrefix: 'api', deckId: 'deck:api', pageCount: 1 }) },
            body: Buffer.from('next-pptx'),
        });
        assert.equal(draft.status, 200);
        const published = await fetch(`http://127.0.0.1:${port}/api/presentations/${project.presentationId}/published`, {
            method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify({ runtimeIndex, fingerprint: 'client-forged' }),
        });
        assert.equal(published.status, 201);
        const revision = (await published.json()).revision;
        assert.equal(revision.fingerprint, crypto.createHash('sha256').update('next-pptx').digest('hex'));
        assert.notEqual(revision.fingerprint, 'client-forged');
    } finally {
        if (child?.exitCode === null) {
            child.kill('SIGTERM');
            await new Promise(resolve => child.once('exit', resolve));
        }
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
