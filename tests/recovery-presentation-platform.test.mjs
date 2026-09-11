import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRuntimeRecoveryStorage, } from '../dist/packages/storage/src/index.js';
import { InMemoryStudentClaimDirectory, InMemoryIdentityDirectory, } from '../dist/packages/identity/src/index.js';
import { InMemorySessionPseudonymDirectory, } from '../dist/packages/projections/src/index.js';
import { applyValidatedPresentationControl, InMemoryPresentationPlaybackStore, } from '../dist/packages/presentation/src/index.js';
import { AuthorizationService, requiredFeatureForAction, } from '../dist/packages/runtime/src/index.js';
import { SERVER_PLATFORM_POLICY } from '../dist/packages/platform/src/index.js';
const lesson = { packageId: 'pkg:1', lessonId: 'lesson:1', lessonVersion: '1', packageFingerprint: 'sha256:abc' };
test('runtime recovery storage preserves D7 minimum authoritative state', async () => {
    const store = new InMemoryRuntimeRecoveryStorage();
    const featurePolicy = { revision: 2, features: { presentationRuntime: true, liveMirroring: true } };
    const session = { sessionId: 'session:A', lesson, status: 'running', currentActivityId: 'activity:2', revision: 4, featurePolicy };
    const membership = { membershipId: 'membership:S17', sessionId: 'session:A', participantId: 'student:S17', role: 'student', status: 'active', joinedAt: '2026-09-10T00:00:00Z' };
    const lease = { leaseId: 'lease:1', sessionId: 'session:A', revision: 3, holderConnectionId: 'connection:teacher', holderParticipantId: 'teacher:T1', expiresAt: 123456 };
    const stage = { sessionId: 'session:A', revision: 8, contentType: 'presentation:deck', payload: { deckId: 'deck:1' } };
    await store.saveSession(session);
    await store.saveMembership(membership);
    await store.saveControllerLease(lease);
    await store.saveStageState(stage);
    assert.deepEqual(await store.loadSession('session:A'), session);
    assert.deepEqual(await store.loadMemberships('session:A'), [membership]);
    assert.deepEqual((await store.loadSession('session:A')).featurePolicy, featurePolicy);
    assert.equal(typeof store.saveFeaturePolicy, 'undefined');
    assert.deepEqual(await store.loadControllerLease('session:A'), lease);
    assert.deepEqual(await store.loadStageState('session:A'), stage);
});
test('student claim snapshot survives process-style restore', () => {
    const identities = new InMemoryIdentityDirectory();
    identities.upsertStudent({ sessionId: 'session:A', participantId: 'student:S17', displayName: '学生甲', seatNo: '17', updatedAt: '2026-09-10T00:00:00Z' });
    const first = new InMemoryStudentClaimDirectory(identities, () => 'reconnect:17');
    const claimed = first.claim('session:A', '17', 'client:A');
    assert.equal(claimed.ok, true);
    const snap = first.snapshot('session:A');
    const second = new InMemoryStudentClaimDirectory(identities, () => 'new-token');
    second.restore(snap);
    const reconnected = second.claim('session:A', '17', 'client:B', 'reconnect:17');
    assert.equal(reconnected.ok, true);
    assert.equal(reconnected.reconnected, true);
});
test('pseudonym allocator remains collision-free after restoring a mapping with holes', () => {
    const p = new InMemorySessionPseudonymDirectory();
    p.restore({ sessionId: 'session:A', participantToSubject: { 'student:S1': 'anon:01', 'student:S3': 'anon:03' } });
    const next = p.getSubjectId('session:A', 'student:S2');
    assert.equal(next, 'anon:02');
    assert.equal(p.resolveParticipantId('session:A', 'anon:03'), 'student:S3');
});
test('stage feature resolver extends core mapping instead of disabling fallback', () => {
    const custom = (contentType) => contentType === 'custom:heavy' ? 'customFeature' : null;
    assert.equal(requiredFeatureForAction('stage.set', { stageContentType: 'custom:heavy' }, custom), 'customFeature');
    assert.equal(requiredFeatureForAction('stage.set', { stageContentType: 'presentation:deck' }, custom), 'presentationRuntime');
    assert.equal(requiredFeatureForAction('stage.set', { stageContentType: 'core:scene' }, custom), 'sceneRuntime');
});
test('student live publish requires current activity and authoritative own/in-scope subject', () => {
    class Authority {
        getFeaturePolicy() { return { revision: 1, features: { liveMirroring: true } }; }
        getControllerLease() { return null; }
        isPublicSubjectValid() { return false; }
        areParticipantsPaired() { return false; }
        canTransferArtifact() { return false; }
        isParticipantInScope(_s, activity, participant, scope) { return activity === 'activity:A' && scope.type === 'participant' && scope.id === participant; }
    }
    const auth = new AuthorizationService(new Authority());
    const student = { connectionId: 'connection:s17', sessionId: 'session:A', membershipId: 'membership:S17', participantId: 'student:S17', role: 'student' };
    assert.equal(auth.authorize(student, 'live.publish').allowed, false);
    assert.equal(auth.authorize(student, 'live.publish', { activityId: 'activity:A', subject: { type: 'participant', id: 'student:S17' } }).allowed, true);
    assert.equal(auth.authorize(student, 'live.publish', { activityId: 'activity:B', subject: { type: 'participant', id: 'student:S17' } }).allowed, false);
    assert.equal(auth.authorize(student, 'live.publish', { activityId: 'activity:A', subject: { type: 'participant', id: 'student:S23' } }).allowed, false);
});
test('presentation runtime index rejects invalid scene and step before authoritative state changes', () => {
    const index = { deckId: 'deck:1', documentFormatVersion: '1', generatedAt: '2026-09-10T00:00:00Z', scenes: [{ sceneId: 'scene:1', index: 0, maxStep: 3 }, { sceneId: 'scene:2', index: 1, maxStep: 1 }] };
    const current = { sessionId: 'session:A', deckId: 'deck:1', sceneId: 'scene:1', step: 0, playState: 'idle', revision: 0 };
    const valid = applyValidatedPresentationControl(current, { action: 'goto', sceneId: 'scene:2', step: 1, expectedRevision: 0 }, index);
    assert.equal(valid.sceneId, 'scene:2');
    assert.throws(() => applyValidatedPresentationControl(current, { action: 'goto', sceneId: 'missing', expectedRevision: 0 }, index), /presentation-scene-not-found/);
    assert.throws(() => applyValidatedPresentationControl(current, { action: 'set-step', step: 99, expectedRevision: 0 }, index), /presentation-step-out-of-range/);
});
test('presentation playback store restores authoritative playback position', async () => {
    const store = new InMemoryPresentationPlaybackStore();
    const state = { sessionId: 'session:A', deckId: 'deck:1', sceneId: 'scene:2', step: 1, playState: 'paused', revision: 7 };
    await store.save(state);
    assert.deepEqual(await store.load('session:A'), state);
});
test('server platform remains cross-architecture while linux/arm64 is current hard target', () => {
    assert.equal(SERVER_PLATFORM_POLICY.portability, 'cross-architecture');
    assert.equal(SERVER_PLATFORM_POLICY.requiredCurrentTarget, 'linux/arm64');
    assert.deepEqual([...SERVER_PLATFORM_POLICY.supportedTargets], ['linux/arm64', 'linux/amd64']);
});

