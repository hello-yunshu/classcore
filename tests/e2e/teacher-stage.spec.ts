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
    const port = 28900 + Math.floor(Math.random() * 100);
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-teacher-e2e-'));
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

test('Teacher controls authoritative Stage and Display receives public projection', async ({ browser }) => {
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await teacher.goto(`${baseUrl}/teacher/index.html?mode=classroom`);
    await teacher.getByLabel('课堂定位').fill('class:authenticated-demo');
    await teacher.getByLabel('教师凭证').fill('T17');
    await teacher.getByRole('button', { name: '加入课堂' }).click();
    await expect(teacher.getByTestId('teacher-status')).toContainText('已连接');
    await expect(teacher.getByRole('heading', { name: '课堂控制台' })).toBeVisible();

    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await student.goto(`${baseUrl}/student/index.html?mode=classroom&session=class:authenticated-demo&code=A17`);
    await student.getByRole('textbox', { name: '学号' }).fill('17');
    await student.getByRole('button', { name: '加入课堂' }).click();
    await expect(student.getByRole('heading', { name: '方格图案还原' })).toBeVisible();

    await expect(teacher.getByText('学生 S17')).toBeVisible();
    await teacher.getByRole('button', { name: /学生 S17/ }).click();
    await expect(teacher.getByTestId('teacher-stage')).toContainText('学生实时视图');
    await expect(teacher.getByTestId('teacher-stage')).toContainText('学生 S17');

    const display = await teacherContext.newPage();
    await display.goto(`${baseUrl}/display/index.html?mode=classroom&sessionId=session:authenticated-demo&locator=class:authenticated-demo&code=D17`);
    await expect(display.getByText('已连接 · 只读投影')).toBeVisible();
    await expect(display.getByTestId('display-stage')).toContainText('学生实时视图');
    await expect(display.locator('[data-field="join-panel"]')).toBeHidden();
    await teacher.getByRole('button', { name: /入口/ }).click();
    await expect(display.getByText('扫码加入课堂')).toBeVisible();
    await expect(display.locator('canvas[data-qr="student"]')).toBeVisible();
    await expect(display.locator('canvas[data-qr="observer"]')).toBeVisible();
    await expect(display.locator('[data-field="student-url"]')).toContainText(`${baseUrl}/student/index.html`);
    await expect(display.locator('[data-field="observer-url"]')).toContainText(`${baseUrl}/observer/index.html`);
    await teacher.getByRole('button', { name: /学生操作/ }).click();
    await expect(display.locator('[data-field="join-panel"]')).toBeHidden();
    await expect(display.getByTestId('display-stage')).toContainText('学生实时视图');
    await teacher.getByRole('button', { name: '当前活动' }).click();
    await expect(teacher.getByTestId('teacher-stage')).toContainText('当前活动摘要');
    await expect(teacher.getByTestId('teacher-stage')).toContainText('individual-work');
    await expect(display.getByTestId('display-stage')).toContainText('当前活动摘要');
    await teacher.getByRole('button', { name: 'Presentation' }).click();
    await expect(display.locator('[data-field="join-panel"]')).toBeHidden();
    await expect(display.getByTestId('display-stage')).toContainText('Presentation 权威源');

    await studentContext.close();
    await teacherContext.close();
});
