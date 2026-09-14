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
    const port = 28600 + Math.floor(Math.random() * 200);
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-student-e2e-'));
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

test('Student classroom flow restores after refresh and resends after offline', async ({ page, context }) => {
    await page.goto(`${baseUrl}/student/index.html?mode=classroom&session=class:authenticated-demo`);
    await page.getByRole('textbox', { name: '课堂地址' }).fill('class:authenticated-demo');
    await page.getByRole('textbox', { name: '课堂码' }).fill('A17');
    await page.getByRole('button', { name: '加入课堂' }).click();
    await expect(page.getByRole('heading', { name: '图案的还原' })).toBeVisible();
    await expect(page.getByText('学生 S17')).toBeVisible();

    await page.getByRole('button', { name: '对象 A' }).click();
    await page.getByRole('button', { name: '→ 1格' }).click();
    await page.getByRole('button', { name: '↻ 90°' }).click();
    await page.getByRole('button', { name: '平移' }).click();
    await page.getByRole('button', { name: '提交答案' }).click();
    await expect(page.getByText(/课堂服务已确认|提交已被课堂服务确认/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: '图案的还原' })).toBeVisible();
    await expect(page.getByText('学生 S17')).toBeVisible();
    await expect(page.getByRole('button', { name: '对象 A' })).toBeVisible();

    await page.getByRole('button', { name: '对象 A' }).click();
    await expect(page.getByRole('button', { name: '→ 1格' })).toBeVisible();
    await context.setOffline(true);
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: '→ 1格' }).click();
    await expect(page.getByText(/待发送/)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/课堂服务已确认/)).toBeVisible({ timeout: 10_000 });
});
