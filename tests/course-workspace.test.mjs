import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { waitForHttpReady } from '../scripts/lib/ws-reference-client.mjs';

function waitForChild(child) {
    if (child.exitCode !== null) return Promise.resolve(child.exitCode);
    return new Promise(resolve => child.once('exit', resolve));
}

test('course workspace creates, stores resources and starts a session with four join URLs', async () => {
    const port = 29700 + Math.floor(Math.random() * 200);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-course-workspace-'));
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['apps/server/runtime/authenticated-server.mjs'], {
        env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), LOCAL_TOOLS_HOST: '127.0.0.1', LOCAL_TOOLS_PORT: String(port + 1), CLASSROOM_DATA_DIR: dataDir, CLASSROOM_LESSON: 'pattern-restoration', CLASSROOM_DEMO_MODE: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
        await waitForHttpReady(`${baseUrl}/readyz`, 300, 50);
        const catalog = await (await fetch(`${baseUrl}/api/courses`)).json();
        const lesson = catalog.courses.find(item => item.courseId === 'lesson-package:pattern-restoration');
        assert.equal(lesson.title, '图案的还原');

        const created = await (await fetch(`${baseUrl}/api/courses`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '课堂运行试课' }),
        })).json();
        assert.equal(created.course.kind, 'workspace');
        assert.equal(created.course.baseLessonSlug, 'pattern-restoration');

        const resource = await fetch(`${baseUrl}/api/courses/${encodeURIComponent(created.course.courseId)}/resources`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-classcore-resource-name': 'teacher-notes.json' }, body: Buffer.from('{"topic":"transform"}'),
        });
        assert.equal(resource.status, 201);
        const withResource = await resource.json();
        assert.equal(withResource.course.resourceCount, 2);
        assert.equal(withResource.resource.name, 'teacher-notes.json');

        const published = await fetch(`${baseUrl}/api/courses/${encodeURIComponent(created.course.courseId)}/publish`, { method: 'POST' });
        assert.equal(published.status, 200);
        assert.equal((await published.json()).course.status, 'published');

        const started = await fetch(`${baseUrl}/api/courses/${encodeURIComponent(created.course.courseId)}/start`, { method: 'POST' });
        assert.equal(started.status, 201);
        const launch = await started.json();
        assert.equal(launch.course.title, '课堂运行试课');
        assert.match(launch.session.sessionId, /^session:/);
        assert.match(launch.sessionLocator, /^class:/);
        assert.equal(Object.keys(launch.joinUrls).sort().join(','), 'display,observer,student,teacher');

        const teacherJoin = await (await fetch(`${baseUrl}/api/classroom/join`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ joinRequestId: 'course-test-teacher', runtimeApiVersion: 1, sessionLocator: launch.sessionLocator, requestedRole: 'teacher', credential: { type: 'teacher-issued', value: launch.credentials.teacher } }),
        })).json();
        const studentJoin = await (await fetch(`${baseUrl}/api/classroom/join`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ joinRequestId: 'course-test-student', runtimeApiVersion: 1, sessionLocator: launch.sessionLocator, requestedRole: 'student', credential: { type: 'class-code', value: launch.credentials.student } }),
        })).json();
        assert.equal(teacherJoin.grant.sessionId, launch.session.sessionId);
        assert.equal(studentJoin.grant.sessionId, launch.session.sessionId);
        assert.equal(studentJoin.currentActivity.lessonTitle, '课堂运行试课');
        assert.equal((await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(launch.session.sessionId)}/presentation-runtime`)).status, 200);
    } finally {
        child.kill('SIGTERM');
        await waitForChild(child);
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
