import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
function waitForExit(child) {
    if (child.exitCode !== null)
        return Promise.resolve(child.exitCode);
    return new Promise((resolve) => child.once('exit', resolve));
}
test('server rejects overlapping classroom/local-tools listeners before listen', async () => {
    const port = 29500 + Math.floor(Math.random() * 200);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-config-'));
    const child = spawn(process.execPath, ['apps/server/runtime/server.mjs'], {
        env: {
            ...process.env,
            HOST: '0.0.0.0',
            PORT: String(port),
            LOCAL_TOOLS_HOST: '127.0.0.1',
            LOCAL_TOOLS_PORT: String(port),
            CLASSROOM_DATA_DIR: dataDir,
        },
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    const code = await waitForExit(child);
    try {
        assert.notEqual(code, 0);
        assert.match(stderr, /endpoints overlap/);
    }
    finally {
        if (child.exitCode === null)
            child.kill('SIGTERM');
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});


test('reference server defaults to loopback so unauthenticated vertical slice is not LAN-exposed accidentally', async () => {
    const port = 29750 + Math.floor(Math.random() * 150);
    const localToolsPort = port + 1000;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-default-bind-'));
    const env = { ...process.env, PORT: String(port), LOCAL_TOOLS_PORT: String(localToolsPort), CLASSROOM_DATA_DIR: dataDir };
    delete env.HOST;
    delete env.LOCAL_TOOLS_HOST;
    const child = spawn(process.execPath, ['apps/server/runtime/server.mjs'], { env, stdio: ['ignore','pipe','pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    try {
        const deadline = Date.now() + 5000;
        while (!stdout.includes('CLASSROOM_SERVER_READY') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
        assert.match(stdout, new RegExp(`CLASSROOM_SERVER_READY http://127\\.0\\.0\\.1:${port}`));
    } finally {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await waitForExit(child);
        }
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
