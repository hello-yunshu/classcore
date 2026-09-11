import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectReferenceClient, waitForHttpReady, } from '../scripts/lib/ws-reference-client.mjs';
function waitForChild(child) {
    if (child.exitCode !== null)
        return Promise.resolve(child.exitCode);
    return new Promise((resolve) => child.once('exit', resolve));
}
test('transport vertical slice keeps ids, sequence and stage broadcasts session-scoped', async () => {
    const port = 22000 + Math.floor(Math.random() * 1000);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-session-isolation-'));
    const baseUrl = `http://127.0.0.1:${port}`;
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const child = spawn(process.execPath, ['apps/server/runtime/server.mjs'], {
        env: {
            ...process.env,
            HOST: '127.0.0.1',
            PORT: String(port),
            CLASSROOM_DATA_DIR: dataDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const clients = [];
    try {
        await waitForHttpReady(`${baseUrl}/readyz`);
        const studentA = await connectReferenceClient(wsUrl, {
            role: 'student',
            clientId: 'student:A',
            sessionId: 'session:A',
        });
        const studentB = await connectReferenceClient(wsUrl, {
            role: 'student',
            clientId: 'student:B',
            sessionId: 'session:B',
        });
        const teacherA = await connectReferenceClient(wsUrl, {
            role: 'teacher',
            clientId: 'teacher:A',
            sessionId: 'session:A',
        });
        const teacherB = await connectReferenceClient(wsUrl, {
            role: 'teacher',
            clientId: 'teacher:B',
            sessionId: 'session:B',
        });
        const observerA = await connectReferenceClient(wsUrl, {
            role: 'observer',
            clientId: 'observer:A',
            sessionId: 'session:A',
        });
        const observerB = await connectReferenceClient(wsUrl, {
            role: 'observer',
            clientId: 'observer:B',
            sessionId: 'session:B',
        });
        clients.push(studentA, studentB, teacherA, teacherB, observerA, observerB);
        observerA.ws.send(JSON.stringify({ type: 'observer.subscribe', subscriptionId: 'sub:A' }));
        observerB.ws.send(JSON.stringify({ type: 'observer.subscribe', subscriptionId: 'sub:B' }));
        // The same event id is valid in different sessions.
        const eventA = await studentA.request({ type: 'student.event', eventId: 'evt:same', payload: { value: 'A' } }, 'evt:same');
        const eventB = await studentB.request({ type: 'student.event', eventId: 'evt:same', payload: { value: 'B' } }, 'evt:same');
        assert.equal(eventA.message.duplicate, false);
        assert.equal(eventB.message.duplicate, false);
        assert.equal(eventA.message.serverSeq, 1);
        assert.equal(eventB.message.serverSeq, 1);
        // A duplicate control is ACKed but does not advance/rebroadcast.
        const firstA = await teacherA.request({ type: 'teacher.control', controlId: 'ctl:same', action: 'next' }, 'ctl:same');
        const duplicateA = await teacherA.request({ type: 'teacher.control', controlId: 'ctl:same', action: 'next' }, 'ctl:same');
        assert.equal(firstA.message.duplicate, false);
        assert.equal(duplicateA.message.duplicate, true);
        assert.equal(duplicateA.message.serverSeq, firstA.message.serverSeq);
        // The same control id in another session remains independent.
        const firstB = await teacherB.request({ type: 'teacher.control', controlId: 'ctl:same', action: 'next' }, 'ctl:same');
        assert.equal(firstB.message.duplicate, false);
        assert.equal(firstB.message.serverSeq, 2);
        await new Promise((resolve) => setTimeout(resolve, 80));
        const stageA = observerA.messages.filter((message) => message.type === 'stage.sync');
        const stageB = observerB.messages.filter((message) => message.type === 'stage.sync');
        assert.equal(stageA.length, 1);
        assert.equal(stageB.length, 1);
        const metrics = await (await fetch(`${baseUrl}/metrics`)).json();
        assert.equal(metrics.persisted.events, 2);
        assert.equal(metrics.persisted.controls, 2);
        assert.equal(metrics.stageBroadcasts, 2);
    }
    finally {
        for (const client of clients) {
            try {
                client.ws.close();
            }
            catch {
                // Best-effort teardown.
            }
        }
        child.kill('SIGTERM');
        await waitForChild(child);
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

