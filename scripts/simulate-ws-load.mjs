import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { connectReferenceClient, percentile, waitForHttpReady, } from './lib/ws-reference-client.mjs';
const students = Number(process.env.STUDENTS ?? 50);
const observers = Number(process.env.OBSERVERS ?? 40);
const eventsPerStudent = Number(process.env.EVENTS_PER_STUDENT ?? 4);
const teacherControls = Number(process.env.TEACHER_CONTROLS ?? 20);
const port = 20000 + Math.floor(Math.random() * 1500);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-ws-load-'));
const baseUrl = `http://127.0.0.1:${port}`;
const wsUrl = `ws://127.0.0.1:${port}/ws`;
const sessionId = 'session:load';
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
        CLASSROOM_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});
const clients = [];
const started = performance.now();
try {
    await waitForHttpReady(`${baseUrl}/readyz`);
    const studentClients = await Promise.all(Array.from({ length: students }, (_, index) => connectReferenceClient(wsUrl, {
        role: 'student',
        clientId: `student:${index + 1}`,
        sessionId,
    })));
    const observerClients = await Promise.all(Array.from({ length: observers }, (_, index) => connectReferenceClient(wsUrl, {
        role: 'observer',
        clientId: `observer:${index + 1}`,
        sessionId,
    })));
    const teacher = await connectReferenceClient(wsUrl, {
        role: 'teacher',
        clientId: 'teacher:1',
        sessionId,
    });
    clients.push(...studentClients, ...observerClients, teacher);
    observerClients.forEach((client, index) => {
        client.ws.send(JSON.stringify({
            type: 'observer.subscribe',
            subscriptionId: `obs:${index}`,
        }));
    });
    const eventPromises = [];
    for (let studentIndex = 0; studentIndex < studentClients.length; studentIndex++) {
        for (let eventIndex = 0; eventIndex < eventsPerStudent; eventIndex++) {
            const eventId = `evt:${studentIndex + 1}:${eventIndex + 1}`;
            eventPromises.push(studentClients[studentIndex].request({
                type: 'student.event',
                eventId,
                payload: { x: eventIndex },
            }, eventId));
        }
    }
    const controlPromises = [];
    for (let index = 0; index < teacherControls; index++) {
        const controlId = `ctl:${index + 1}`;
        controlPromises.push(teacher.request({
            type: 'teacher.control',
            controlId,
            action: 'next',
        }, controlId));
    }
    const eventAcks = await Promise.all(eventPromises);
    const controlAcks = await Promise.all(controlPromises);
    if (eventAcks.some(({ message }) => !message.ok))
        throw new Error('negative-event-ack');
    if (controlAcks.some(({ message }) => !message.ok))
        throw new Error('negative-control-ack');
    await new Promise((resolve) => setTimeout(resolve, 120));
    const metrics = await (await fetch(`${baseUrl}/metrics`)).json();
    const expectedEvents = students * eventsPerStudent;
    const expectedBroadcasts = observers * teacherControls;
    if (metrics.persisted.events !== expectedEvents) {
        throw new Error(`persisted-event-count:${metrics.persisted.events}/${expectedEvents}`);
    }
    if (metrics.persisted.controls !== teacherControls) {
        throw new Error(`persisted-control-count:${metrics.persisted.controls}/${teacherControls}`);
    }
    const receivedBroadcasts = observerClients.reduce((count, client) => count + client.messages.filter((message) => message.type === 'stage.sync').length, 0);
    if (receivedBroadcasts !== expectedBroadcasts) {
        throw new Error(`observer-broadcast-count:${receivedBroadcasts}/${expectedBroadcasts}`);
    }
    const eventLatencies = eventAcks.map(({ latencyMs }) => latencyMs);
    const controlLatencies = controlAcks.map(({ latencyMs }) => latencyMs);
    const elapsedMs = Math.round(performance.now() - started);
    console.log(JSON.stringify({
        students,
        observers,
        expectedEvents,
        teacherControls,
        stageBroadcasts: metrics.stageBroadcasts,
        observerBroadcastsReceived: receivedBroadcasts,
        eventAckMs: {
            p50: percentile(eventLatencies, 50),
            p95: percentile(eventLatencies, 95),
        },
        teacherControlAckMs: {
            p50: percentile(controlLatencies, 50),
            p95: percentile(controlLatencies, 95),
        },
        elapsedMs,
    }, null, 2));
    console.log('Real WebSocket + SQLite reference load PASSED');
}
finally {
    for (const client of clients) {
        try {
            client.ws.close();
        }
        catch {
            // Best-effort teardown for the reference load test.
        }
    }
    child.kill('SIGTERM');
    await waitForChild(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
}

