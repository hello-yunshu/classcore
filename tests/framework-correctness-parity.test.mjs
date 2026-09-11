import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InMemoryClassroomStorage } from '../dist/packages/storage/src/index.js';
import { LiveStateBroker } from '../dist/packages/realtime/src/index.js';
import { SqliteClassroomStateStore } from '../apps/server/runtime/sqlite-store.mjs';

const sessionId = 'session:parity';
const activityId = 'activity:one';
const ownerScope = { type: 'participant', id: 'student:one' };
const eventDraft = {
    eventEnvelopeVersion: 1,
    appletEventSchemaVersion: 1,
    sessionId,
    lessonId: 'lesson:one',
    activityId,
    actor: { role: 'student', participantId: 'student:one' },
    appletInstanceId: 'applet:one',
    type: 'set-value',
    payload: { value: 1 },
    origin: 'client',
    clientStream: { streamId: 'stream:one', streamSeq: 1, clientMonotonicTime: 10 },
};

async function withStores(run) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-parity-'));
    const memory = new InMemoryClassroomStorage(() => 'memory-id', () => '2026-09-12T00:00:00.000Z');
    const sqlite = new SqliteClassroomStateStore(path.join(dir, 'classroom.sqlite'));
    try { return await run(memory, sqlite); }
    finally { sqlite.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}

async function errorCode(operation) {
    try { await operation(); return null; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
}

function artifact(revision, payload = { value: revision }, context = {}) {
    return { artifactId: 'artifact:one', sessionId, activityId, ownerScope: context.ownerScope ?? ownerScope, artifactType: 'state', revision, payload, createdAt: '2026-09-12T00:00:00.000Z' };
}

function submission(status, patch = {}) {
    return { submissionId: 'submission:one', sessionId, activityId, submitterScope: ownerScope, submittedBy: 'student:one', artifacts: [{ artifactId: 'artifact:one', revision: 1 }], status, submittedAt: status === 'draft' ? null : '2026-09-12T00:00:00.000Z', ...patch };
}

function transfer(status) {
    return { transferId: 'transfer:one', sessionId, activityId, senderId: 'student:one', recipientScope: { type: 'participant', id: 'student:two' }, artifact: { artifactId: 'artifact:one', revision: 1 }, status, createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z' };
}

test('in-memory and SQLite classroom stores share idempotency and revision semantics', async () => {
    await withStores(async (memory, sqlite) => {
        const firstMemory = await memory.acceptClientEventAtomically('client:one', eventDraft);
        const firstSqlite = sqlite.acceptClientEventAtomically('client:one', eventDraft);
        assert.equal(firstMemory.inserted, true);
        assert.equal(firstSqlite.inserted, true);
        assert.equal((await memory.listEvents(sessionId)).length, sqlite.listEvents(sessionId).length);
        assert.equal((await memory.acceptClientEventAtomically('client:one', eventDraft)).inserted, false);
        assert.equal(sqlite.acceptClientEventAtomically('client:one', eventDraft).inserted, false);
        const changedEvent = { ...eventDraft, payload: { value: 2 } };
        assert.equal(await errorCode(() => memory.acceptClientEventAtomically('client:one', changedEvent)), 'event-idempotency-payload-mismatch');
        assert.equal(await errorCode(() => sqlite.acceptClientEventAtomically('client:one', changedEvent)), 'event-idempotency-payload-mismatch');
        assert.equal((await memory.listEvents(sessionId)).length, sqlite.listEvents(sessionId).length);

        const snapshot = { sessionId, activityId, appletInstanceId: 'applet:one', scope: ownerScope, stateSchemaVersion: 1, revision: 2, state: { value: 1 }, capturedAt: '2026-09-12T00:00:00.000Z' };
        await memory.saveSnapshot(snapshot); sqlite.saveSnapshot(snapshot);
        const equalWithNewCapture = { ...snapshot, capturedAt: '2026-09-12T00:00:01.000Z' };
        await memory.saveSnapshot(equalWithNewCapture); sqlite.saveSnapshot(equalWithNewCapture);
        const changedSnapshot = { ...snapshot, state: { value: 9 } };
        assert.equal(await errorCode(() => memory.saveSnapshot(changedSnapshot)), 'snapshot-revision-payload-mismatch');
        assert.equal(await errorCode(() => sqlite.saveSnapshot(changedSnapshot)), 'snapshot-revision-payload-mismatch');
        assert.equal(await errorCode(() => memory.saveSnapshot({ ...snapshot, revision: 1 })), 'snapshot-revision-regression');
        assert.equal(await errorCode(() => sqlite.saveSnapshot({ ...snapshot, revision: 1 })), 'snapshot-revision-regression');

        await memory.saveArtifact(artifact(1)); sqlite.saveArtifact(artifact(1));
        await memory.saveArtifact(artifact(2)); sqlite.saveArtifact(artifact(2));
        assert.equal(await errorCode(() => memory.saveArtifact(artifact(1, { value: 8 }))), 'artifact-revision-immutable');
        assert.equal(await errorCode(() => sqlite.saveArtifact(artifact(1, { value: 8 }))), 'artifact-revision-immutable');
        assert.equal(await errorCode(() => memory.saveArtifact(artifact(3, { value: 3 }, { ownerScope: { type: 'participant', id: 'student:two' } }))), 'artifact-revision-context-mismatch');
        assert.equal(await errorCode(() => sqlite.saveArtifact(artifact(3, { value: 3 }, { ownerScope: { type: 'participant', id: 'student:two' } }))), 'artifact-revision-context-mismatch');
    });
});

test('submission and transfer state machines are identical and terminal-safe', async () => {
    await withStores(async (memory, sqlite) => {
        await memory.saveSubmission(submission('draft')); sqlite.saveSubmission(submission('draft'));
        await memory.saveSubmission(submission('draft', { artifacts: [{ artifactId: 'artifact:one', revision: 2 }] }));
        sqlite.saveSubmission(submission('draft', { artifacts: [{ artifactId: 'artifact:one', revision: 2 }] }));
        await memory.saveSubmission(submission('submitted')); sqlite.saveSubmission(submission('submitted'));
        await memory.saveSubmission(submission('accepted')); sqlite.saveSubmission(submission('accepted'));
        for (const candidate of [submission('draft'), submission('accepted', { submittedBy: 'student:two' })]) {
            assert.equal(await errorCode(() => memory.saveSubmission(candidate)), candidate.status === 'draft' ? 'submission-state-regression' : 'submission-authority-immutable');
            assert.equal(await errorCode(() => sqlite.saveSubmission(candidate)), candidate.status === 'draft' ? 'submission-state-regression' : 'submission-authority-immutable');
        }

        for (const status of ['queued', 'sent', 'received', 'opened', 'completed']) {
            await memory.saveTransfer(transfer(status)); sqlite.saveTransfer(transfer(status));
        }
        assert.equal(await errorCode(() => memory.saveTransfer(transfer('received'))), 'transfer-state-regression');
        assert.equal(await errorCode(() => sqlite.saveTransfer(transfer('received'))), 'transfer-state-regression');
        await memory.saveTransfer(transfer('failed')); sqlite.saveTransfer(transfer('failed'));
        assert.equal(await errorCode(() => memory.saveTransfer(transfer('completed'))), 'transfer-state-regression');
        assert.equal(await errorCode(() => sqlite.saveTransfer(transfer('completed'))), 'transfer-state-regression');
    });
});

test('live broker isolates session/activity and coalesces to the advertised effective rate', () => {
    let now = 1000;
    const received = [];
    const broker = new LiveStateBroker(() => now);
    const request = { subscriptionId: 'sub:observer', sessionId: 'session:one', activityId, appletInstanceId: 'applet:one', quality: 'focus' };
    assert.equal(broker.subscribe(request, { role: 'observer', onFrame: frame => received.push(frame) }).effectiveHz, 4);
    broker.publish({ sessionId: 'session:other', activityId, appletInstanceId: 'applet:one', scope: { type: 'session', id: 'session:other' }, streamId: 'stream', seq: 1, payload: {} });
    assert.equal(received.length, 0);
    broker.publish({ sessionId: 'session:one', activityId, appletInstanceId: 'applet:one', scope: { type: 'session', id: 'session:one' }, streamId: 'stream', seq: 2, payload: { value: 2 } });
    now += 10;
    broker.publish({ sessionId: 'session:one', activityId: activityId + ':other', appletInstanceId: 'applet:one', scope: { type: 'session', id: 'session:one' }, streamId: 'stream', seq: 3, payload: {} });
    broker.publish({ sessionId: 'session:one', activityId, appletInstanceId: 'applet:one', scope: { type: 'session', id: 'session:one' }, streamId: 'stream', seq: 4, payload: { value: 4 } });
    assert.equal(received.length, 1);
    assert.equal(broker.stats().coalesced, 1);
    assert.equal(broker.stats().dropped.observer, 0);
});
