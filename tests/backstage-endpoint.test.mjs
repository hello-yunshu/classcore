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
test('Backstage and Authoring use a separate local-tools endpoint; classroom port does not serve them', async () => {
    const port = 27000 + Math.floor(Math.random() * 400);
    const backstagePort = port + 500;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-backstage-'));
    const child = spawn(process.execPath, ['apps/server/runtime/server.mjs'], {
        env: {
            ...process.env,
            HOST: '127.0.0.1',
            PORT: String(port),
            LOCAL_TOOLS_HOST: '127.0.0.1',
            LOCAL_TOOLS_PORT: String(backstagePort),
            CLASSROOM_DATA_DIR: dataDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
        await Promise.all([
            waitForHttpReady(`http://127.0.0.1:${port}/healthz`),
            waitForHttpReady(`http://127.0.0.1:${backstagePort}/healthz`),
        ]);
        assert.equal((await fetch(`http://127.0.0.1:${port}/backstage`)).status, 404);
        const backstage = await fetch(`http://127.0.0.1:${backstagePort}/backstage`);
        assert.equal(backstage.status, 200);
        const authoringOnClassroom = await fetch(`http://127.0.0.1:${port}/authoring`);
        assert.equal(authoringOnClassroom.status, 404);
        const authoring = await fetch(`http://127.0.0.1:${backstagePort}/authoring`);
        assert.equal(authoring.status, 200);
        const simulationOnClassroom = await fetch(`http://127.0.0.1:${port}/simulation`);
        assert.equal(simulationOnClassroom.status, 404);
        const simulationOnLocalTools = await fetch(`http://127.0.0.1:${backstagePort}/simulation`);
        assert.equal(simulationOnLocalTools.status, 404);
    }
    finally {
        child.kill('SIGTERM');
        await waitForChild(child);
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

