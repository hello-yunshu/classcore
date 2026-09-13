import test from 'node:test';
import assert from 'node:assert/strict';
import { AppletEventRuntime, AuthorizationService, InMemoryClassroomAuthority, LearningResourceRuntime } from '../dist/packages/runtime/src/index.js';
import { AppletHostRuntime, AppletRegistry, GENERIC_COUNTER_MANIFEST, createGenericCounterApplet } from '../dist/packages/applet-sdk/src/index.js';
import { InMemoryClassroomStorage } from '../dist/packages/storage/src/index.js';
import { LiveStateBroker } from '../dist/packages/realtime/src/index.js';
import { WidgetRegistry } from '../dist/packages/projections/src/index.js';
import { TeacherRecommendationGate, runAnalytics } from '../dist/packages/intelligence/src/index.js';

const session = {
    sessionId: 'session:synthetic',
    lesson: { packageId: 'synthetic', lessonId: 'synthetic', lessonVersion: '1.0.0', packageFingerprint: 'sha256:synthetic' },
    status: 'created', currentActivityId: 'activity:one', revision: 0,
    featurePolicy: { revision: 1, features: { liveMirroring: true, artifactExchange: true, intelligence: true, observer: true } },
};

test('authenticated classroom spine resolves credential to membership, token and presence', () => {
  let grantId = 0;
  const authority = new InMemoryClassroomAuthority(() => `fixed-${++grantId}`);
    authority.createSession({ session, sessionLocator: 'class:demo', credentials: [{ sessionLocator: 'class:demo', role: 'student', credentialType: 'class-code', credentialValue: 'S17', participantId: 'student:S17' }] });
    assert.equal(authority.transitionSession(session.sessionId, 'system.session.ready').status, 'ready');
    const grant = authority.join({ joinRequestId: 'join:1', runtimeApiVersion: 1, sessionLocator: 'class:demo', requestedRole: 'student', participantHint: 'S17', credential: { type: 'class-code', value: 'S17' } });
    assert.equal(grant.participantId, 'student:S17');
    const context = authority.connect(grant.accessToken, 'connection:1', 'device:1');
    assert.equal(context.role, 'student');
    assert.equal(authority.listPresence(session.sessionId)[0].status, 'online');
    authority.disconnect(context.connectionId);
    assert.equal(authority.listPresence(session.sessionId)[0].status, 'offline');
    assert.throws(() => authority.join({ joinRequestId: 'bad', runtimeApiVersion: 1, sessionLocator: 'class:demo', requestedRole: 'student', credential: { type: 'class-code', value: 'bad' } }), /credential-invalid/);
});

test('registry and host own generic applet lifecycle and restore snapshot', async () => {
    const registry = new AppletRegistry();
    registry.register(GENERIC_COUNTER_MANIFEST, createGenericCounterApplet);
    assert.throws(() => registry.register(GENERIC_COUNTER_MANIFEST, createGenericCounterApplet), /duplicate-applet-type/);
    const events = [];
    const host = new AppletHostRuntime({
        registry,
        instance: { appletInstanceId: 'instance:counter', appletTypeId: 'generic-counter', configRef: 'config:counter', requiredCapabilities: [] },
        config: { label: 'synthetic' },
        context: { viewer: { participantId: 'student:S17', role: 'student', connectionId: 'connection:1' }, subject: { type: 'participant', id: 'student:S17' }, accessMode: 'interactive', sessionId: 'session:synthetic', lessonId: 'synthetic', activityId: 'activity:one', appletInstanceId: 'instance:counter', appletTypeId: 'generic-counter' },
        host: { emitEvent: async intent => { events.push(intent); return { clientEventId: 'event:1', accepted: true, eventId: 'event:1', serverSeq: 1, duplicate: false }; }, publishLiveState() {}, requestAction: async () => null, saveSnapshot: async () => {}, getAsset: async () => '' },
        availableCapabilities: new Set(),
        snapshot: { stateSchemaVersion: 1, state: { count: 4, label: 'restored' } },
    });
    await host.start();
    await host.applet.handleCommand({ type: 'increment', payload: {} });
    assert.deepEqual(await host.pauseAndSnapshot(), { count: 5, label: 'restored' });
    assert.equal(events.length, 1);
    await host.destroy();
    assert.equal(host.status, 'destroyed');
});

test('applet instance capabilities are part of mount compatibility', () => {
    const registry = new AppletRegistry();
    registry.register(GENERIC_COUNTER_MANIFEST, createGenericCounterApplet);
    assert.throws(() => new AppletHostRuntime({
        registry,
        instance: { appletInstanceId: 'instance:camera', appletTypeId: 'generic-counter', requiredCapabilities: ['camera'] },
        config: {},
        context: { viewer: { participantId: 'student:S17', role: 'student', connectionId: 'connection:1' }, subject: { type: 'participant', id: 'student:S17' }, accessMode: 'interactive', sessionId: 'session:synthetic', lessonId: 'synthetic', activityId: 'activity:one', appletInstanceId: 'instance:camera', appletTypeId: 'generic-counter' },
        host: { emitEvent: async () => ({ clientEventId: 'event:1', accepted: true, eventId: 'event:1', serverSeq: 1, duplicate: false }), publishLiveState() {}, requestAction: async () => null, saveSnapshot: async () => {}, getAsset: async () => '' },
        availableCapabilities: new Set(),
    }), /platform-capability-missing:camera/);
});

test('rejoin keeps membership identity but mints a fresh grant after expiry', () => {
    let grantId = 0;
    const authority = new InMemoryClassroomAuthority(() => `fixed-${++grantId}`);
    authority.createSession({ session, sessionLocator: 'class:expiry', credentials: [{ sessionLocator: 'class:expiry', role: 'student', credentialType: 'class-code', credentialValue: 'S17', participantId: 'student:S17' }] });
    const first = authority.join({ joinRequestId: 'join:first', runtimeApiVersion: 1, sessionLocator: 'class:expiry', requestedRole: 'student', credential: { type: 'class-code', value: 'S17' } }, 0);
    const second = authority.join({ joinRequestId: 'join:second', runtimeApiVersion: 1, sessionLocator: 'class:expiry', requestedRole: 'student', credential: { type: 'class-code', value: 'S17' } }, 8 * 60 * 60 * 1000 + 1);
    assert.equal(second.membershipId, first.membershipId);
    assert.notEqual(second.accessToken, first.accessToken);
    assert.ok(Date.parse(second.expiresAt) > 8 * 60 * 60 * 1000 + 1);
    assert.equal(authority.authenticate(second.accessToken, 8 * 60 * 60 * 1000 + 1).membershipId, first.membershipId);
});

test('artifact transfer fails closed when its authoritative artifact is missing', async () => {
    const authorization = { isActivityInSession: () => true, authorize: () => ({ allowed: true }) };
    const runtime = new LearningResourceRuntime({ saveArtifact: async () => {}, saveSubmission: async () => {}, saveTransfer: async () => { throw new Error('transfer-should-not-persist'); }, getArtifact: async () => null }, authorization);
    const connection = { connectionId: 'connection:1', sessionId: session.sessionId, membershipId: 'membership:1', participantId: 'student:S17', role: 'student' };
    const transfer = { transferId: 'transfer:missing', sessionId: session.sessionId, activityId: 'activity:one', senderId: 'student:S17', recipientScope: { type: 'participant', id: 'student:S23' }, artifact: { artifactId: 'artifact:missing', revision: 1 }, status: 'queued', createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z' };
    await assert.rejects(() => runtime.transfer(connection, transfer, { type: 'participant', id: 'student:S17' }), /artifact-not-found/);
});

test('event, snapshot, artifact, submission and transfer remain durable and idempotent', async () => {
    const storage = new InMemoryClassroomStorage(() => 'id-1', () => '2026-09-12T00:00:00.000Z');
    const context = {
        connection: { connectionId: 'connection:1', sessionId: session.sessionId, membershipId: 'membership:1', participantId: 'student:S17', role: 'student' },
        lessonId: 'synthetic', activityId: 'activity:one',
        registry: { getInstancePolicy: () => ({ appletTypeId: 'generic-counter', eventSchemaVersion: 1, emittedEventTypes: new Set(['increment']) }), validatePayload: () => ({ valid: true }) },
        accessAuthority: { getAccessMode: () => 'interactive' },
    };
    const runtime = new AppletEventRuntime(storage);
    const input = { clientEventId: 'client:1', eventEnvelopeVersion: 1, appletEventSchemaVersion: 1, appletInstanceId: 'instance:counter', streamId: 'stream:1', streamSeq: 1, type: 'increment', payload: {} };
    const first = await runtime.accept(context, input);
    const duplicate = await runtime.accept(context, input);
    assert.equal(first.inserted, true);
    assert.equal(duplicate.inserted, false);
    assert.equal((await storage.listEvents(session.sessionId)).length, 1);
    await storage.saveSnapshot({ sessionId: session.sessionId, activityId: 'activity:one', appletInstanceId: 'instance:counter', scope: { type: 'participant', id: 'student:S17' }, stateSchemaVersion: 1, revision: 2, state: { count: 1 }, capturedAt: '2026-09-12T00:00:00.000Z' });
    await storage.saveArtifact({ artifactId: 'artifact:1', sessionId: session.sessionId, activityId: 'activity:one', ownerScope: { type: 'participant', id: 'student:S17' }, artifactType: 'state', revision: 1, payload: { count: 1 }, createdAt: '2026-09-12T00:00:00.000Z' });
    await storage.saveSubmission({ submissionId: 'submission:1', sessionId: session.sessionId, activityId: 'activity:one', submitterScope: { type: 'participant', id: 'student:S17' }, submittedBy: 'student:S17', artifacts: [{ artifactId: 'artifact:1', revision: 1 }], status: 'submitted', submittedAt: '2026-09-12T00:00:00.000Z' });
    await storage.saveTransfer({ transferId: 'transfer:1', sessionId: session.sessionId, activityId: 'activity:one', senderId: 'student:S17', recipientScope: { type: 'participant', id: 'student:S23' }, artifact: { artifactId: 'artifact:1', revision: 1 }, status: 'queued', createdAt: '2026-09-12T00:00:00.000Z' });
    assert.equal((await storage.getArtifact('artifact:1')).payload.count, 1);
    await assert.rejects(() => storage.saveArtifact({ artifactId: 'artifact:1', sessionId: session.sessionId, activityId: 'activity:one', ownerScope: { type: 'participant', id: 'student:S17' }, artifactType: 'state', revision: 1, payload: { count: 2 }, createdAt: '2026-09-12T00:00:00.000Z' }), /artifact-revision-immutable/);
});

test('live quality tiers and widget projection are explicit', () => {
    const broker = new LiveStateBroker();
    const received = [];
    assert.equal(broker.subscribe({ subscriptionId: 'sub:teacher', appletInstanceId: 'instance:counter', quality: 'background' }, { role: 'teacher', onFrame: frame => received.push(frame) }).effectiveHz, 2);
    assert.equal(broker.subscribe({ subscriptionId: 'sub:observer', appletInstanceId: 'instance:counter', quality: 'focus' }, { role: 'observer', onFrame: frame => received.push(frame) }).effectiveHz, 4);
    const result = broker.publish({ sessionId: session.sessionId, activityId: 'activity:one', appletInstanceId: 'instance:counter', scope: { type: 'participant', id: 'anon:01' }, streamId: 'live:1', seq: 1, payload: { count: 2 } });
    assert.equal(result.delivered, 2);
    assert.equal(received.length, 2);
    const widgets = new WidgetRegistry();
    widgets.register({ widgetType: 'widget:summary', render: context => ({ selector: context.selector, value: context.data.value }) });
    assert.deepEqual(widgets.render({ widgetId: 'widget:1', widgetType: 'widget:summary', selector: 'current-activity-summary', audience: ['display'] }, { sessionId: session.sessionId, activityId: 'activity:one', audience: 'display', data: { value: 2 } }), { selector: 'current-activity-summary', value: 2 });
});

test('analytics times out safely and recommendations require teacher confirmation', async () => {
    const input = { sessionId: session.sessionId, activityId: 'activity:one', subject: { type: 'participant', id: 'student:S17' }, events: [], snapshots: [], artifacts: [] };
    const fallback = {
        provenance: { mode: 'rule', name: 'synthetic-rule', version: '1' },
        analyze: async () => ({
            classifications: [{ code: 'needs-review', confidence: 0.8, evidence: [{ kind: 'event', id: 'event:1' }] }],
            metrics: [], recommendations: [{ recommendationId: 'recommendation:1', kind: 'resource', label: 'Review', evidence: [{ kind: 'event', id: 'event:1' }], status: 'candidate' }],
        }),
    };
    const result = await runAnalytics(input, { provenance: { mode: 'llm', name: 'unavailable', version: '1' }, analyze: async () => new Promise(() => {}) }, { timeoutMs: 5, fallback });
    assert.equal(result.classifications[0].code, 'needs-review');
    const gate = new TeacherRecommendationGate();
    gate.propose(result.recommendations[0]);
    assert.equal(gate.confirm('recommendation:1').status, 'confirmed');
});
