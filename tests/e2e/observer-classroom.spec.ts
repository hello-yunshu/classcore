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
    const port = 29200 + Math.floor(Math.random() * 100);
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-observer-e2e-'));
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

test('Observer joins and renders only the anonymous public classroom projection', async ({ browser }) => {
    const observer = await browser.newPage();
    await observer.goto(`${baseUrl}/observer/index.html?session=class:authenticated-demo&code=O17`);
    await expect(observer.getByRole('heading', { name: '课堂观察' })).toBeVisible();
    await expect(observer.getByText('已连接 · 匿名观察')).toBeVisible();
    await expect(observer.getByText('只读观察 · 服务器仅提供匿名公共投影')).toBeVisible();
    await expect(observer.getByText('anon:01')).toBeVisible();
    await expect(observer.getByText('在线', { exact: true })).toBeVisible();
    await expect(observer.getByText('等待教师发布课堂内容')).toBeVisible();
});
