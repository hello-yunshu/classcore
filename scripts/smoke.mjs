import assert from 'node:assert/strict';
import {
    AuthorizationService,
    nextSessionState,
    resolveNextActivity,
    claimControllerLease,
    renewControllerLease,
    prepareClientAppletEvent,
    clientEventIdempotencyKey,
    StageStore,
} from '../dist/packages/runtime/src/index.js';
import { InMemorySessionPseudonymDirectory } from '../dist/packages/projections/src/index.js';
let session = {
    sessionId: 'session:demo',
    lesson: {
        packageId: 'lesson-package:pattern-restoration',
        lessonId: 'lesson:pattern-restoration',
        lessonVersion: '0.1.2',
        packageFingerprint: 'sha256:resolved-demo-fingerprint-0123456789abcdef',
    },
    status: 'created',
    revision: 0,
    currentActivityId: null,
    featurePolicy: {
        revision: 1,
        features: {
            liveMirroring: true,
            intelligence: true,
            observer: true,
            artifactExchange: true,
            sceneRuntime: true,
            presentationRuntime: true,
        },
    },
};
const teacher = { connectionId: 'connection:mac', sessionId: session.sessionId, membershipId: 'membership:T01', participantId: 'teacher:T01', role: 'teacher' };
const student = { connectionId: 'connection:s17', sessionId: session.sessionId, membershipId: 'membership:S17', participantId: 'student:S17', role: 'student' };
let lease = { leaseId: 'lease:demo', sessionId: session.sessionId, revision: 0, holderConnectionId: null, holderParticipantId: null, expiresAt: null };
const projections = new InMemorySessionPseudonymDirectory();
const authority = {
    getFeaturePolicy: () => session.featurePolicy,
    getControllerLease: () => lease,
    isPublicSubjectValid: (sid, id) => projections.isValidSubjectId(sid, id),
    isParticipantInScope: (_sid, _aid, p, scope) => scope.type === 'participant' && scope.id === p,
    areParticipantsPaired: () => false,
    canTransferArtifact: () => false,
};
const auth = new AuthorizationService(authority);
session.status = nextSessionState(session.status, 'system.session.ready');
session.revision++;
lease = claimControllerLease(lease, teacher, 60000, 0, 1000);
assert.equal(auth.authorize(teacher, 'session.start', {}, 1001).allowed, true);
session.status = nextSessionState(session.status, 'session.start');
session.revision++;
lease = renewControllerLease(lease, teacher, 60000, lease.revision, 1500);
const ids = ['activity:observe', 'activity:restore-independent'];
session.currentActivityId = resolveNextActivity(ids, 'activity:observe');
const input = { clientEventId: 'event:client-1', eventEnvelopeVersion: 1, appletEventSchemaVersion: 1, appletInstanceId: 'applet-instance:restore-independent-board', streamId: 'stream:S17:board', streamSeq: 1, type: 'object.rotated', payload: { objectId: 'fragment:B', centerId: 'P', angle: 90, direction: 'clockwise' } };
const registry = {
    getInstancePolicy: (id) => id === input.appletInstanceId ? { appletTypeId: 'applet:transform-board', eventSchemaVersion: 1, emittedEventTypes: new Set(['object.rotated']) } : null,
    validatePayload: (_t, _v, event, payload) => ({ valid: event === 'object.rotated' && payload.objectId === 'fragment:B' && payload.centerId === 'P' && payload.angle === 90 })
};
const accessAuthority = { getAccessMode: (_sid, _aid, participant) => participant.startsWith('student:') ? 'interactive' : 'mirror-readonly' };
const draft = prepareClientAppletEvent({ connection: student, lessonId: session.lesson.lessonId, activityId: session.currentActivityId, registry, accessAuthority }, input);
assert.equal(draft.actor.participantId, 'student:S17');
let nextServerSeq = 0;
const byKey = new Map();
const key = clientEventIdempotencyKey(student, input);
function accept(k, d) { if (byKey.has(k))
    return { inserted: false, event: byKey.get(k) }; const e = { ...d, eventId: 'event:server-1', serverSeq: ++nextServerSeq, serverReceivedAt: '2026-09-10T05:00:00Z' }; byKey.set(k, e); return { inserted: true, event: e }; }
const first = accept(key, draft);
const retry = accept(key, draft);
assert.equal(first.inserted, true);
assert.equal(retry.inserted, false);
assert.equal(first.event.serverSeq, retry.event.serverSeq);
const anon = projections.getSubjectId(session.sessionId, 'student:S17');
assert.equal(projections.resolveParticipantId(session.sessionId, anon), 'student:S17');
const observer = { connectionId: 'connection:o1', sessionId: session.sessionId, membershipId: 'membership:O1', participantId: 'observer:O1', role: 'observer' };
assert.equal(auth.authorize(observer, 'live.subscribe', { publicSubjectId: anon }).allowed, true);
const stage = new StageStore(session.sessionId);
const stage1 = stage.set('core:student-live-view', { publicSubjectId: anon }, 0);
assert.equal(stage1.revision, 1);
console.log('Smoke test PASSED');
console.log(JSON.stringify({ session, lease, event: first.event, stage: stage1 }, null, 2));

