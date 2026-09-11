import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectReferenceClient, waitForHttpReady } from '../scripts/lib/ws-reference-client.mjs';
function waitForChild(child) {
    if (child.exitCode !== null)
        return Promise.resolve(child.exitCode);
    return new Promise((resolve) => child.once('exit', resolve));
}
function startServer(port, dataDir) {
    return spawn(process.execPath, ['apps/server/runtime/server.mjs'], {
        env: {
            ...process.env,
            HOST: '127.0.0.1',
            PORT: String(port),
            CLASSROOM_DATA_DIR: dataDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}
async function stopServer(child) {
    child.kill('SIGTERM');
    await waitForChild(child);
}
test('transport serverSeq persists across restart and duplicate ids recover original sequence', async () => {
    const port = 23000 + Math.floor(Math.random() * 1000);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-seq-restart-'));
    const baseUrl = `http://127.0.0.1:${port}`;
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const sessionId = 'session:restart';
    let child = startServer(port, dataDir);
    let student;
    let teacher;
    try {
        await waitForHttpReady(`${baseUrl}/readyz`);
        student = await connectReferenceClient(wsUrl, { role: 'student', clientId: 'student:1', sessionId });
        teacher = await connectReferenceClient(wsUrl, { role: 'teacher', clientId: 'teacher:1', sessionId });
        const firstEvent = await student.request({ type: 'student.event', eventId: 'evt:before-restart', payload: { value: 1 } }, 'evt:before-restart');
        const firstControl = await teacher.request({ type: 'teacher.control', controlId: 'ctl:before-restart', action: 'next' }, 'ctl:before-restart');
        assert.equal(firstEvent.message.serverSeq, 1);
        assert.equal(firstControl.message.serverSeq, 2);
        student.ws.close();
        teacher.ws.close();
        await stopServer(child);
        child = startServer(port, dataDir);
        await waitForHttpReady(`${baseUrl}/readyz`);
        student = await connectReferenceClient(wsUrl, { role: 'student', clientId: 'student:1b', sessionId });
        teacher = await connectReferenceClient(wsUrl, { role: 'teacher', clientId: 'teacher:1b', sessionId });
        const duplicateEvent = await student.request({ type: 'student.event', eventId: 'evt:before-restart', payload: { value: 1 } }, 'evt:before-restart');
        assert.equal(duplicateEvent.message.duplicate, true);
        assert.equal(duplicateEvent.message.serverSeq, 1);
        const conflictingEvent = await student.request({ type: 'student.event', eventId: 'evt:before-restart', payload: { value: 999 } }, 'evt:before-restart');
        assert.equal(conflictingEvent.message.ok, false);
        assert.equal(conflictingEvent.message.reason, 'event-id-reused-with-different-payload');
        const duplicateControl = await teacher.request({ type: 'teacher.control', controlId: 'ctl:before-restart', action: 'next' }, 'ctl:before-restart');
        assert.equal(duplicateControl.message.duplicate, true);
        assert.equal(duplicateControl.message.serverSeq, 2);
        const newEvent = await student.request({ type: 'student.event', eventId: 'evt:after-restart', payload: { value: 2 } }, 'evt:after-restart');
        assert.equal(newEvent.message.duplicate, false);
        assert.equal(newEvent.message.serverSeq, 3);
    }
    finally {
        try {
            student?.ws.close();
        }
        catch { }
        try {
            teacher?.ws.close();
        }
        catch { }
        if (child.exitCode === null)
            await stopServer(child);
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
test('serverSeq remains independent per session after restart', async () => {
    const port = 24000 + Math.floor(Math.random() * 1000);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-seq-session-'));
    const baseUrl = `http://127.0.0.1:${port}`;
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    let child = startServer(port, dataDir);
    let a;
    let b;
    try {
        await waitForHttpReady(`${baseUrl}/readyz`);
        a = await connectReferenceClient(wsUrl, { role: 'student', clientId: 'a', sessionId: 'session:A' });
        b = await connectReferenceClient(wsUrl, { role: 'student', clientId: 'b', sessionId: 'session:B' });
        const a1 = await a.request({ type: 'student.event', eventId: 'a1' }, 'a1');
        const b1 = await b.request({ type: 'student.event', eventId: 'b1' }, 'b1');
        assert.equal(a1.message.serverSeq, 1);
        assert.equal(b1.message.serverSeq, 1);
        a.ws.close();
        b.ws.close();
        await stopServer(child);
        child = startServer(port, dataDir);
        await waitForHttpReady(`${baseUrl}/readyz`);
        a = await connectReferenceClient(wsUrl, { role: 'student', clientId: 'a2', sessionId: 'session:A' });
        b = await connectReferenceClient(wsUrl, { role: 'student', clientId: 'b2', sessionId: 'session:B' });
        const a2 = await a.request({ type: 'student.event', eventId: 'a2' }, 'a2');
        const b2 = await b.request({ type: 'student.event', eventId: 'b2' }, 'b2');
        assert.equal(a2.message.serverSeq, 2);
        assert.equal(b2.message.serverSeq, 2);
    }
    finally {
        try {
            a?.ws.close();
        }
        catch { }
        try {
            b?.ws.close();
        }
        catch { }
        if (child.exitCode === null)
            await stopServer(child);
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

