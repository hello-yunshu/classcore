import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteClassroomStateStore } from '../apps/server/runtime/sqlite-store.mjs';
import { InMemoryIdentityDirectory, InMemoryStudentClaimDirectory } from '../dist/packages/identity/src/index.js';
import { InMemorySessionPseudonymDirectory } from '../dist/packages/projections/src/index.js';
import { RecoveryCoordinator } from '../dist/apps/server/src/recovery.js';
const lesson = { packageId: 'pkg:sqlite', lessonId: 'lesson:sqlite', lessonVersion: '1', packageFingerprint: 'sha256:sqlite' };
test('SQLite recovery state survives real close/reopen and keeps feature policy single-sourced in session', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-sqlite-')), file = path.join(dir, 'state.sqlite');
    try {
        let store = new SqliteClassroomStateStore(file);
        const session = { sessionId: 'session:A', lesson, status: 'running', currentActivityId: 'activity:1', revision: 3, featurePolicy: { revision: 4, features: { liveMirroring: true, presentationRuntime: true } } };
        await store.saveSession(session);
        await store.saveMembership({ membershipId: 'm:S17', sessionId: 'session:A', participantId: 'student:S17', role: 'student', status: 'active', joinedAt: '2026-09-10T00:00:00Z' });
        await store.saveStudentIdentity({ sessionId: 'session:A', participantId: 'student:S17', displayName: '学生甲', seatNo: '17', updatedAt: '2026-09-10T00:00:00Z' });
        await store.saveStudentClaims({ sessionId: 'session:A', claims: [{ sessionId: 'session:A', participantId: 'student:S17', participantHint: '17', clientInstanceId: 'client:old', reconnectToken: 'token:17', claimedAt: '2026-09-10T00:00:00Z' }] });
        await store.savePublicSubjectProjection({ sessionId: 'session:A', participantToSubject: { 'student:S17': 'anon:07' }, updatedAt: '2026-09-10T00:00:00Z' });
        await store.savePresentationPlayback({ sessionId: 'session:A', deckId: 'deck:1', sceneId: 'scene:2', step: 1, playState: 'paused', revision: 8 });
        store.close();
        store = new SqliteClassroomStateStore(file);
        assert.deepEqual(await store.loadSession('session:A'), session);
        assert.equal((await store.loadStudentClaims('session:A')).claims[0].reconnectToken, 'token:17');
        assert.equal((await store.loadPublicSubjectProjection('session:A')).participantToSubject['student:S17'], 'anon:07');
        assert.equal((await store.loadPresentationPlayback('session:A')).sceneId, 'scene:2');
        store.close();
    }
    finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
test('RecoveryCoordinator restores identity, pseudonym and claim in deterministic order', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-coordinator-')), file = path.join(dir, 'state.sqlite');
    try {
        const store = new SqliteClassroomStateStore(file), session = { sessionId: 'session:R', lesson, status: 'paused', currentActivityId: 'activity:2', revision: 9, featurePolicy: { revision: 5, features: { observer: true, presentationRuntime: true } } };
        await store.saveSession(session);
        await store.saveStudentIdentity({ sessionId: 'session:R', participantId: 'student:S17', displayName: '学生甲', seatNo: '17', updatedAt: '2026-09-10T00:00:00Z' });
        await store.saveStudentClaims({ sessionId: 'session:R', claims: [{ sessionId: 'session:R', participantId: 'student:S17', participantHint: '17', clientInstanceId: 'client:old', reconnectToken: 'token:17', claimedAt: '2026-09-10T00:00:00Z' }] });
        await store.savePublicSubjectProjection({ sessionId: 'session:R', participantToSubject: { 'student:S17': 'anon:03' }, updatedAt: '2026-09-10T00:00:00Z' });
        await store.savePresentationPlayback({ sessionId: 'session:R', deckId: 'deck:1', sceneId: 'scene:1', step: 0, playState: 'idle', revision: 1 });
        const identities = new InMemoryIdentityDirectory(), claims = new InMemoryStudentClaimDirectory(identities, () => 'new'), pseudonyms = new InMemorySessionPseudonymDirectory();
        const coordinator = new RecoveryCoordinator({ runtime: store, identities: store, claims: store, pseudonyms: store, presentation: store }, { identities, claims, pseudonyms });
        const recovered = await coordinator.restore('session:R');
        assert.equal(recovered.session.featurePolicy.revision, 5);
        assert.equal(identities.getStudent('session:R', 'student:S17').displayName, '学生甲');
        assert.equal(pseudonyms.getSubjectId('session:R', 'student:S17'), 'anon:03');
        const reconnect = claims.claim('session:R', '17', 'client:new', 'token:17');
        assert.equal(reconnect.ok, true);
        assert.equal(reconnect.reconnected, true);
        store.close();
    }
    finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

