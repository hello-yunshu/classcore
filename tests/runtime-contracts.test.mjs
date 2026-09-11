import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthorizationService, validateClientCommand, nextSessionState, nextActivityState, resolveNextActivity, claimControllerLease, renewControllerLease, takeoverExpiredControllerLease, prepareClientAppletEvent, clientEventIdempotencyKey, StageStore } from '../dist/packages/runtime/src/index.js';
import { InMemorySessionPseudonymDirectory } from '../dist/packages/projections/src/index.js';
const enabledPolicy = { revision: 1, features: { liveMirroring: true, intelligence: true, observer: true, artifactExchange: true, sceneRuntime: true, presentationRuntime: true } };
const teacher = { connectionId: 'connection:mac', sessionId: 'session:A', membershipId: 'membership:T', participantId: 'teacher:T01', role: 'teacher' };
const student = { connectionId: 'connection:s17', sessionId: 'session:A', membershipId: 'membership:S17', participantId: 'student:S17', role: 'student' };
const observer = { connectionId: 'connection:o', sessionId: 'session:A', membershipId: 'membership:O', participantId: 'observer:O1', role: 'observer' };
const display = { connectionId: 'connection:d', sessionId: 'session:A', membershipId: 'membership:D', participantId: 'display:D1', role: 'display' };
function lease() { return { leaseId: 'lease:1', sessionId: 'session:A', revision: 0, holderConnectionId: null, holderParticipantId: null, expiresAt: null }; }
class Authority {
    constructor() { this.policy = enabledPolicy; this.lease = lease(); this.projections = new Set(); this.pairs = new Set(['student:S17|student:S23']); }
    getFeaturePolicy() { return this.policy; }
    getControllerLease() { return this.lease; }
    isPublicSubjectValid(_session, id) { return this.projections.has(id); }
    isParticipantInScope(_session, _activity, participant, scope) {
        if (scope.type === 'participant')
            return scope.id === participant;
        if (scope.type === 'pair')
            return scope.id === 'pair:1' && ['student:S17', 'student:S23'].includes(participant);
        return false;
    }
    areParticipantsPaired(_session, _activity, left, right) { return this.pairs.has(`${left}|${right}`) || this.pairs.has(`${right}|${left}`); }
    canTransferArtifact(_session, _activity, sender, owner, recipient) {
        const owns = owner.type === 'participant' && owner.id === sender;
        const paired = recipient.type === 'participant' && this.areParticipantsPaired('session:A', 'activity:A', sender, recipient.id);
        return owns && paired;
    }
}
test('client command payloads require a registered command schema before dispatch', () => {
    const registry = { has: (t) => t === 'session.start', validatePayload: (_t, p) => ({ valid: Object.keys(p).length === 0 }) };
    validateClientCommand(registry, { commandId: 'c1', runtimeApiVersion: 1, type: 'session.start', payload: {} });
    assert.throws(() => validateClientCommand(registry, { commandId: 'c2', runtimeApiVersion: 1, type: 'unknown.command', payload: {} }));
    assert.throws(() => validateClientCommand(registry, { commandId: 'c3', runtimeApiVersion: 1, type: 'session.start', payload: { unexpected: true } }));
});
test('session readiness is a system transition and activity.advance is orchestration', () => {
    assert.equal(nextSessionState('created', 'system.session.ready'), 'ready');
    assert.throws(() => nextSessionState('created', 'session.start'));
    assert.equal(resolveNextActivity(['a', 'b', 'c'], 'b'), 'c');
    assert.throws(() => nextActivityState('active', 'activity.advance'));
});
test('teacher control lease supports renew and expired takeover', () => {
    const authority = new Authority();
    let l = claimControllerLease(lease(), teacher, 1000, 0, 100);
    authority.lease = l;
    const auth = new AuthorizationService(authority);
    assert.equal(auth.authorize(teacher, 'stage.set', { stageContentType: 'core:scene' }, 200).allowed, true);
    assert.equal(auth.authorize(teacher, 'presentation.control', {}, 200).allowed, true);
    l = renewControllerLease(l, teacher, 1000, l.revision, 500);
    authority.lease = l;
    assert.equal(l.expiresAt, 1500);
    const pad = { ...teacher, connectionId: 'connection:pad' };
    assert.throws(() => takeoverExpiredControllerLease(l, pad, 1000, l.revision, 1499));
    l = takeoverExpiredControllerLease(l, pad, 1000, l.revision, 1501);
    assert.equal(l.holderConnectionId, 'connection:pad');
});
test('feature-gated actions fail closed and stage content uses content-aware gates', () => {
    const authority = new Authority();
    const auth = new AuthorizationService(authority);
    authority.policy = { revision: 2, features: { ...enabledPolicy.features, liveMirroring: false } };
    assert.equal(auth.authorize(student, 'live.publish').allowed, false);
    authority.policy = { revision: 3, features: { ...enabledPolicy.features, sceneRuntime: false } };
    authority.lease = claimControllerLease(lease(), teacher, 1000, 0, 100);
    assert.equal(auth.authorize(teacher, 'stage.set', { stageContentType: 'core:scene' }, 200).allowed, false);
    assert.equal(auth.authorize(teacher, 'stage.set', {}, 200).allowed, false);
    assert.equal(auth.authorize(teacher, 'stage.set', { stageContentType: 'core:class-summary' }, 200).allowed, true);
    authority.policy = { revision: 4, features: { ...enabledPolicy.features, presentationRuntime: false } };
    assert.equal(auth.authorize(teacher, 'stage.set', { stageContentType: 'presentation:deck' }, 200).allowed, false);
    assert.equal(auth.authorize(teacher, 'presentation.control', {}, 200).allowed, false);
});
test('student live subscription and transfer are resolved against authoritative scope facts', () => {
    const authority = new Authority();
    const auth = new AuthorizationService(authority);
    assert.equal(auth.authorize(student, 'live.subscribe', { activityId: 'activity:A', subject: { type: 'participant', id: 'student:S17' } }).allowed, true);
    assert.equal(auth.authorize(student, 'live.subscribe', { activityId: 'activity:A', subject: { type: 'participant', id: 'student:S23' } }).allowed, true);
    assert.equal(auth.authorize(student, 'live.subscribe', { activityId: 'activity:A', subject: { type: 'participant', id: 'student:S99' } }).allowed, false);
    assert.equal(auth.authorize(student, 'artifact.transfer', { activityId: 'activity:A' }).allowed, false);
    assert.equal(auth.authorize(student, 'artifact.transfer', { activityId: 'activity:A', artifactOwnerScope: { type: 'participant', id: 'student:S17' }, recipientScope: { type: 'participant', id: 'student:S23' } }).allowed, true);
    assert.equal(auth.authorize(student, 'artifact.transfer', { activityId: 'activity:A', artifactOwnerScope: { type: 'participant', id: 'student:S17' }, recipientScope: { type: 'participant', id: 'student:S99' } }).allowed, false);
});
test('observer subscription cannot be authorized by caller-supplied booleans', () => {
    const authority = new Authority();
    const auth = new AuthorizationService(authority);
    authority.projections.add('anon:01');
    assert.equal(auth.authorize(observer, 'live.subscribe', { publicSubjectId: 'anon:01' }).allowed, true);
    assert.equal(auth.authorize(observer, 'live.subscribe', { publicSubjectId: 'anon:999' }).allowed, false);
    assert.equal(auth.authorize(observer, 'stage.set', { stageContentType: 'core:scene' }).allowed, false);
});
test('client applet event requires allow-list, exact schema version and payload validation', () => {
    const registry = {
        getInstancePolicy(id) { return id === 'applet-instance:X' ? { appletTypeId: 'applet:transform-board', eventSchemaVersion: 1, emittedEventTypes: new Set(['object.rotated']) } : null; },
        validatePayload(_type, _version, event, payload) { return { valid: event === 'object.rotated' && payload.angle === 90 && payload.centerId === 'P' }; }
    };
    const accessAuthority = { getAccessMode(_session, _activity, participant) {
            if (participant.startsWith('student:'))
                return 'interactive';
            return participant.startsWith('teacher:') ? 'monitor' : participant.startsWith('observer:') ? 'mirror-readonly' : 'display-readonly';
        } };
    const ctx = { connection: student, lessonId: 'lesson:L', activityId: 'activity:A', registry, accessAuthority };
    const input = { clientEventId: 'client-event:1', eventEnvelopeVersion: 1, appletEventSchemaVersion: 1, appletInstanceId: 'applet-instance:X', streamId: 'stream:S17:X', streamSeq: 1, type: 'object.rotated', payload: { angle: 90, centerId: 'P' } };
    const draft = prepareClientAppletEvent(ctx, input);
    assert.equal(draft.actor.participantId, 'student:S17');
    assert.equal(draft.sessionId, 'session:A');
    assert.throws(() => prepareClientAppletEvent(ctx, { ...input, appletEventSchemaVersion: 999 }));
    assert.throws(() => prepareClientAppletEvent(ctx, { ...input, payload: { garbage: true } }));
    assert.throws(() => prepareClientAppletEvent(ctx, { ...input, type: 'submission.submitted' }));
    assert.throws(() => prepareClientAppletEvent({ ...ctx, connection: observer }, input));
    assert.throws(() => prepareClientAppletEvent({ ...ctx, connection: display }, input));
});
test('idempotency key is scoped beyond raw clientEventId', () => {
    const input = { clientEventId: 'same-id', eventEnvelopeVersion: 1, appletEventSchemaVersion: 1, appletInstanceId: 'applet-instance:X', streamId: 's', streamSeq: 1, type: 'object.rotated', payload: {} };
    const s23 = { ...student, participantId: 'student:S23', membershipId: 'membership:S23', connectionId: 'connection:s23' };
    assert.notEqual(clientEventIdempotencyKey(student, input), clientEventIdempotencyKey(s23, input));
});
test('public pseudonym projection is shared by Observer/Display and survives restore', () => {
    const p = new InMemorySessionPseudonymDirectory();
    const a = p.getSubjectId('session:A', 'student:S17');
    const b = p.getSubjectId('session:A', 'student:S23');
    const snapshot = p.snapshot('session:A');
    const restored = new InMemorySessionPseudonymDirectory();
    restored.restore(snapshot);
    assert.equal(restored.getSubjectId('session:A', 'student:S17'), a);
    assert.equal(restored.getSubjectId('session:A', 'student:S23'), b);
    assert.equal(restored.resolveParticipantId('session:A', a), 'student:S17');
});
test('stage content type is extensible namespaced data and revisioned', () => {
    const s = new StageStore('session:A');
    assert.equal(s.set('core:scene', { id: 'x' }, 0).revision, 1);
    assert.equal(s.set('presentation:deck', { deckId: 'd' }, 1).revision, 2);
    assert.throws(() => s.set('bad', {}, 2));
});
test('observer/display applet events are hard rejected even if access authority is misconfigured interactive', () => {
    const registry = {
        getInstancePolicy(id) { return id === 'applet-instance:X' ? { appletTypeId: 'applet:transform-board', eventSchemaVersion: 1, emittedEventTypes: new Set(['object.rotated']) } : null; },
        validatePayload() { return { valid: true }; }
    };
    const maliciousAccess = { getAccessMode() { return 'interactive'; } };
    const input = { clientEventId: 'evt:readonly', eventEnvelopeVersion: 1, appletEventSchemaVersion: 1, appletInstanceId: 'applet-instance:X', streamId: 'stream:readonly', streamSeq: 1, type: 'object.rotated', payload: { angle: 90, centerId: 'P' } };
    const base = { lessonId: 'lesson:x', activityId: 'activity:A', registry, accessAuthority: maliciousAccess };
    assert.throws(() => prepareClientAppletEvent({ ...base, connection: observer }, input), /applet-event-read-only/);
    assert.throws(() => prepareClientAppletEvent({ ...base, connection: display }, input), /applet-event-read-only/);
});


test('teacher submission/artifact actions fail closed without explicit resource scope', () => {
    const authority = new Authority();
    const auth = new AuthorizationService(authority);
    assert.deepEqual(auth.authorize(teacher, 'submission.submit'), { allowed: false, reason: 'submission-scope-required' });
    assert.deepEqual(auth.authorize(teacher, 'artifact.transfer'), { allowed: false, reason: 'artifact-transfer-context-required' });
    assert.equal(auth.authorize(teacher, 'submission.submit', { activityId: 'activity:A', submitterScope: { type: 'participant', id: 'student:S17' } }).allowed, true);
    assert.equal(auth.authorize(teacher, 'artifact.transfer', { activityId: 'activity:A', artifactOwnerScope: { type: 'participant', id: 'student:S17' }, recipientScope: { type: 'participant', id: 'student:S23' } }).allowed, true);
});
test('controller lease mutation helpers fail closed for non-teacher roles', () => {
    assert.throws(() => claimControllerLease(lease(), student, 1000, 0, 100), /teacher-required/);
    const claimed = claimControllerLease(lease(), teacher, 1000, 0, 100);
    assert.throws(() => renewControllerLease(claimed, { ...student, connectionId: teacher.connectionId, participantId: teacher.participantId }, 1000, claimed.revision, 200), /teacher-required/);
    assert.throws(() => takeoverExpiredControllerLease({ ...claimed, expiresAt: 50 }, student, 1000, claimed.revision, 100), /teacher-required/);
});
test('idempotency key encodes an unambiguous tuple even when identifiers contain separators', () => {
    const input = { clientEventId: 'e', eventEnvelopeVersion: 1, appletEventSchemaVersion: 1, appletInstanceId: 'd', streamId: 's', streamSeq: 1, type: 'x', payload: {} };
    const a = { ...student, sessionId: 'a', participantId: 'b|c' };
    const b = { ...student, sessionId: 'a|b', participantId: 'c' };
    assert.notEqual(clientEventIdempotencyKey(a, input), clientEventIdempotencyKey(b, input));
    assert.deepEqual(JSON.parse(clientEventIdempotencyKey(a, input)), ['a','b|c','d','e']);
});
