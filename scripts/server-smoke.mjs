import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { waitForHttpReady } from './lib/ws-reference-client.mjs';
const port = 19000 + Math.floor(Math.random() * 800);
const backstagePort = port + 1000;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-server-smoke-'));
const baseUrl = `http://127.0.0.1:${port}`;
const backstageUrl = `http://127.0.0.1:${backstagePort}`;
function waitForChild(child) {
    if (child.exitCode !== null)
        return Promise.resolve(child.exitCode);
    return new Promise((resolve) => child.once('exit', resolve));
}
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
        waitForHttpReady(`${baseUrl}/readyz`, 60, 50),
        waitForHttpReady(`${backstageUrl}/healthz`, 60, 50),
    ]);
    const health = await (await fetch(`${baseUrl}/healthz`)).json();
    if (!health.ok || health.revision !== 'R3.10')
        throw new Error('health-failed');
    const studentResponse = await fetch(`${baseUrl}/student`);
    const studentHtml = await studentResponse.text();
    if (!studentResponse.ok || !studentHtml.includes('视觉与交互设计尚未冻结')) {
        throw new Error('student-web-shell-failed');
    }
    const backstageOnClassroom = await fetch(`${baseUrl}/backstage`);
    if (backstageOnClassroom.status !== 404)
        throw new Error('backstage-must-not-share-classroom-port');
    const authoringOnClassroom = await fetch(`${baseUrl}/authoring`);
    if (authoringOnClassroom.status !== 404)
        throw new Error('authoring-must-not-share-classroom-port');
    const simulationOnClassroom = await fetch(`${baseUrl}/simulation`);
    if (simulationOnClassroom.status !== 404)
        throw new Error('simulation-must-not-be-served-in-production');
    const backstageResponse = await fetch(`${backstageUrl}/backstage`);
    const backstageHtml = await backstageResponse.text();
    if (!backstageResponse.ok || !backstageHtml.includes('后台运维端')) {
        throw new Error('backstage-separate-port-failed');
    }
    const publicAsset = await fetch(`${baseUrl}/assets/apps/student-web/src/entry.js`);
    if (!publicAsset.ok)
        throw new Error('public-browser-asset-failed');
    const authoringResponse = await fetch(`${backstageUrl}/authoring`);
    const authoringHtml = await authoringResponse.text();
    if (!authoringResponse.ok || !authoringHtml.includes('备课创作端')) {
        throw new Error('authoring-local-tools-port-failed');
    }
    const authoringAssetOnClassroom = await fetch(`${baseUrl}/assets/apps/presentation-studio/src/entry.js`);
    if (authoringAssetOnClassroom.status !== 404)
        throw new Error('authoring-asset-exposed-on-classroom-port');
    const backstageAssetOnClassroom = await fetch(`${baseUrl}/assets/apps/backstage/src/entry.js`);
    if (backstageAssetOnClassroom.status !== 404)
        throw new Error('backstage-asset-exposed-on-classroom-port');
    const simulationAssetOnClassroom = await fetch(`${baseUrl}/assets/apps/simulation-rehearsal/src/entry.js`);
    if (simulationAssetOnClassroom.status !== 404)
        throw new Error('simulation-asset-exposed-on-classroom-port');
    const simulationAssetOnLocalTools = await fetch(`${backstageUrl}/assets/apps/simulation-rehearsal/src/entry.js`);
    if (simulationAssetOnLocalTools.status !== 404)
        throw new Error('simulation-asset-exposed-on-local-tools-port');
    const serverAssetLeak = await fetch(`${baseUrl}/assets/apps/server/src/entry.js`);
    if (serverAssetLeak.status !== 404)
        throw new Error('server-only-asset-exposed');
    const legacyDistLeak = await fetch(`${baseUrl}/dist/apps/server/src/entry.js`);
    if (legacyDistLeak.status !== 404)
        throw new Error('legacy-dist-route-exposed');
    console.log('Server + host-only local tools endpoint smoke PASSED');
}
finally {
    child.kill('SIGTERM');
    await waitForChild(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
}

