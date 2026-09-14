import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthenticatedClassroomRuntime } from '../dist/apps/server/src/classroom-runtime.js';
import { InMemoryClassroomAuthority } from '../dist/packages/runtime/src/index.js';
import { InMemoryClassroomStorage } from '../dist/packages/storage/src/index.js';

const session = {
  sessionId: 'session:auth',
  lesson: { packageId: 'lesson-package:test', lessonId: 'lesson:test', lessonVersion: '1.0.0', packageFingerprint: 'sha256:test' },
  status: 'running',
  currentActivityId: 'activity:board',
  revision: 1,
  featurePolicy: { revision: 1, features: { liveMirroring: true, artifactExchange: true, intelligence: false, observer: true } },
};

function makeRuntime() {
  const authority = new InMemoryClassroomAuthority(() => 'fixed');
  const storage = new InMemoryClassroomStorage(() => 'event-fixed', () => '2026-09-13T00:00:00.000Z');
  const runtime = new AuthenticatedClassroomRuntime({
    authority,
    storage,
    resolveCurrentActivity: current => ({
      sessionId: current.sessionId,
      lessonId: current.lesson.lessonId,
      activity: { activitySchemaVersion: 1, activityId: current.currentActivityId, type: 'individual-work', participantMode: 'individual', applets: [{ appletInstanceId: 'instance:board', appletTypeId: 'applet:transform-board', configRef: 'config:board', requiredCapabilities: [] }], adviceMode: 'off', submissionPolicy: 'required' },
      applets: [{ instance: { appletInstanceId: 'instance:board', appletTypeId: 'applet:transform-board', configRef: 'config:board', requiredCapabilities: [] }, config: { board: { columns: 16, rows: 8 }, objects: [] } }],
    }),
    lessonEventRegistry: {
      getInstancePolicy: () => ({ appletTypeId: 'applet:transform-board', eventSchemaVersion: 1, emittedEventTypes: new Set(['object.moved']) }),
      validatePayload: () => ({ valid: true }),
    },
    appletAccess: { getAccessMode: () => 'interactive' },
    resolveStudentSelf: (_session, participantId) => ({ participantId, displayName: '小明', seatNo: '17' }),
  });
  runtime.createSession({ session, sessionLocator: 'class:auth', credentials: [{ sessionLocator: 'class:auth', role: 'student', credentialType: 'class-code', credentialValue: 'A17', participantId: 'student:S17' }] });
  return { runtime, storage };
}

test('authenticated classroom runtime owns join, Activity, durable Event, Snapshot and Submission identity', async () => {
  const { runtime, storage } = makeRuntime();
  const joined = await runtime.join({ joinRequestId: 'join:1', runtimeApiVersion: 1, sessionLocator: 'class:auth', requestedRole: 'student', credential: { type: 'class-code', value: 'A17' } });
  assert.equal(joined.grant.participantId, 'student:S17');
  assert.deepEqual(joined.self, { participantId: 'student:S17', displayName: '小明', seatNo: '17' });
  assert.equal(joined.currentActivity.activity.activityId, 'activity:board');

  const connected = runtime.connect(joined.grant.accessToken, 'connection:student');
  assert.equal(connected.hello.participantId, 'student:S17');
  const input = { clientEventId: 'client:event:1', eventEnvelopeVersion: 1, appletEventSchemaVersion: 1, appletInstanceId: 'instance:board', streamId: 'stream:S17', streamSeq: 1, type: 'object.moved', payload: { objectId: 'piece:a' } };
  const first = await runtime.acceptAppletEvent(connected.context, input);
  const duplicate = await runtime.acceptAppletEvent(connected.context, input);
  assert.equal(first.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal((await storage.listEvents(session.sessionId)).length, 1);

  await runtime.saveSnapshot(connected.context, { sessionId: session.sessionId, activityId: 'activity:board', appletInstanceId: 'instance:board', scope: { type: 'participant', id: 'student:S17' }, stateSchemaVersion: 1, revision: 1, state: { objects: {} }, capturedAt: '2026-09-13T00:00:00.000Z' });
  assert.equal((await storage.getLatestSnapshot(session.sessionId, 'activity:board', 'instance:board', 'participant:student:S17')).revision, 1);

  const submission = await runtime.submit(connected.context, {
    submissionId: 'submission:1', sessionId: 'forged-session', activityId: 'forged-activity',
    submitterScope: { type: 'participant', id: 'student:forged' }, submittedBy: 'student:forged',
    artifacts: [], status: 'submitted', submittedAt: null,
  }, {
    appletInstanceId: 'instance:board', recordText: '向右平移',
    recordTokens: [{ kind: 'word', value: '平移', display: '平移' }],
    snapshot: { objects: {} }, solved: false,
  });
  assert.equal(submission.sessionId, session.sessionId);
  assert.equal(submission.activityId, 'activity:board');
  assert.equal(submission.submittedBy, 'student:S17');
  assert.deepEqual(submission.submitterScope, { type: 'participant', id: 'student:S17' });
  assert.deepEqual(submission.artifacts, [{ artifactId: 'artifact:submission:1:evidence', revision: 1 }]);
  assert.equal((await storage.getArtifact('artifact:submission:1:evidence')).payload.recordText, '向右平移');

  const refreshed = await runtime.join({ joinRequestId: 'join:refresh', runtimeApiVersion: 1, sessionLocator: 'class:auth', requestedRole: 'student', credential: { type: 'class-code', value: 'A17' } });
  assert.equal(refreshed.snapshots[0].revision, 1);
});

test('authenticated classroom runtime rejects a Snapshot outside the authenticated participant scope', async () => {
  const { runtime } = makeRuntime();
  const joined = await runtime.join({ joinRequestId: 'join:2', runtimeApiVersion: 1, sessionLocator: 'class:auth', requestedRole: 'student', credential: { type: 'class-code', value: 'A17' } });
  const connected = runtime.connect(joined.grant.accessToken, 'connection:student');
  await assert.rejects(() => runtime.saveSnapshot(connected.context, { sessionId: session.sessionId, activityId: 'activity:board', appletInstanceId: 'instance:board', scope: { type: 'participant', id: 'student:other' }, stateSchemaVersion: 1, revision: 1, state: { objects: {} }, capturedAt: '2026-09-13T00:00:00.000Z' }), /snapshot-scope-forbidden/);
});
