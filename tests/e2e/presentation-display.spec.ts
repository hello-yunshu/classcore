import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { waitForHttpReady } from '../../scripts/lib/ws-reference-client.mjs';

test.describe.configure({ mode: 'serial' });

let server: ChildProcess;
let dataDir: string;
let baseUrl: string;

test.beforeAll(async () => {
    const port = 29600 + Math.floor(Math.random() * 100);
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-display-playback-e2e-'));
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['apps/server/runtime/authenticated-server.mjs'], {
        env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), LOCAL_TOOLS_HOST: '127.0.0.1', LOCAL_TOOLS_PORT: String(port + 1), CLASSROOM_DATA_DIR: dataDir, CLASSROOM_LESSON: 'pattern-restoration', CLASSROOM_DEMO_MODE: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForHttpReady(`${baseUrl}/readyz`);
});

test.afterAll(async () => {
    server.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
});

test('authenticated Display mounts the exact pinned deck and bundled fonts', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(`${baseUrl}/display/index.html?sessionId=session:authenticated-demo&locator=class:authenticated-demo&code=D17`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.display-stage svg')).toBeVisible();
    await expect(page.locator('.display-state')).toContainText(/精确课堂版本|权威播放位置/);
    await expect.poll(() => page.locator('.display-stage svg image').count()).toBeGreaterThan(0);
    await page.evaluate(async () => {
        await document.fonts.load('16px "LXGW WenKai GB Lite"');
        await document.fonts.load('16px "Noto Serif"');
    });
    const result = await page.evaluate(() => ({
        box: (() => { const rect = document.querySelector('.display-stage svg')?.getBoundingClientRect(); return rect ? { width: rect.width, height: rect.height } : null; })(),
        fonts: {
            lxgw: document.fonts.check('16px "LXGW WenKai GB Lite"'),
            notoSerif: document.fonts.check('16px "Noto Serif"'),
        },
        fontRequests: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => name.includes('/assets/fonts/')),
    }));
    expect(result.box?.width ?? 0).toBeGreaterThan(1000);
    expect(result.box?.height ?? 0).toBeGreaterThan(500);
    expect(result.fonts.lxgw).toBe(true);
    expect(result.fonts.notoSerif).toBe(true);
    expect(result.fontRequests).toEqual(expect.arrayContaining([
        expect.stringContaining('/assets/fonts/LXGWWenKaiGBLite-Regular.ttf'),
        expect.stringContaining('/assets/fonts/NotoSerif-Variable.ttf'),
    ]));
    expect(pageErrors).toEqual([]);
});
