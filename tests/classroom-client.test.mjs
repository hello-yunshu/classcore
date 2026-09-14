import test from 'node:test';
import assert from 'node:assert/strict';
import { ClassroomClient, MemoryOutboxStore } from '../packages/classroom-client/src/index.ts';

class FakeSocket {
  readyState = 0;
  sent = [];
  listeners = new Map();

  constructor() {
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit('open', {});
    });
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(data) {
    const message = JSON.parse(data);
    this.sent.push(message);
    if (message.type === 'client.hello') {
      this.emit('message', { data: JSON.stringify({
        type: 'server.hello',
        protocolVersion: 1,
        runtimeApiVersion: 1,
        serverBuild: 'test',
        connectionId: 'connection:test',
        sessionId: 'session:test',
        membershipId: 'membership:test',
        participantId: 'student:server-owned',
        role: 'student',
        heartbeatIntervalMs: 1000,
        deploymentProfile: 'lan-http',
        featurePolicyRevision: 1,
      }) });
    }
    if (message.type === 'applet.event') {
      this.emit('message', { data: JSON.stringify({ type: 'event.ack', ok: true, clientEventId: message.event.clientEventId, eventId: 'event:accepted', serverSeq: 1, duplicate: false }) });
    }
    if (message.type === 'submission.submit') {
      this.emit('message', { data: JSON.stringify({ type: 'submission.ack', ok: true, clientEventId: message.clientEventId, eventId: 'submission:accepted', serverSeq: 2, duplicate: false }) });
    }
    if (message.type === 'applet.snapshot') {
      this.emit('message', { data: JSON.stringify({ type: 'snapshot.ack', ok: true, clientEventId: message.clientEventId, eventId: 'snapshot:accepted', serverSeq: 3, duplicate: false }) });
    }
  }

  close() {
    this.readyState = 3;
    this.emit('close', {});
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function response(value, ok = true) {
  return { ok, async json() { return structuredClone(value); } };
}

test('ClassroomClient joins with a server grant and never self-declares participant identity', async () => {
  const outbox = new MemoryOutboxStore();
  let socket;
  const client = new ClassroomClient({
    baseUrl: 'http://classroom.test',
    outbox,
    idFactory: () => 'fixed',
    fetchFn: async (_url, init) => {
      const request = JSON.parse(init.body);
      assert.equal(request.requestedRole, 'student');
      assert.equal(request.credential.value, 'join-code');
      return response({ grant: { membershipId: 'membership:test', sessionId: 'session:test', participantId: 'student:server-owned', role: 'student', accessToken: 'access:test', expiresAt: '2099-01-01T00:00:00.000Z' }, self: { participantId: 'student:server-owned', displayName: '小明', seatNo: '17' } });
    },
    socketFactory: () => { socket = new FakeSocket(); return socket; },
  });

  await client.join({ joinRequestId: 'join:test', runtimeApiVersion: 1, sessionLocator: 'class:test', requestedRole: 'student', credential: { type: 'class-code', value: 'join-code' } });
  await client.connect();
  const hello = socket.sent.find(message => message.type === 'client.hello');
  assert.equal(hello.accessToken, 'access:test');
  assert.equal('participantId' in hello, false);
  assert.deepEqual(client.state.self, { participantId: 'student:server-owned', displayName: '小明', seatNo: '17' });
  assert.equal(client.state.connection, 'online');
});

test('ClassroomClient persists offline events and removes them only after ACK', async () => {
  const outbox = new MemoryOutboxStore();
  const client = new ClassroomClient({
    baseUrl: 'http://classroom.test',
    outbox,
    idFactory: () => 'fixed',
    fetchFn: async () => response({ grant: { membershipId: 'membership:test', sessionId: 'session:test', participantId: 'student:server-owned', role: 'student', accessToken: 'access:test', expiresAt: '2099-01-01T00:00:00.000Z' } }),
    socketFactory: () => new FakeSocket(),
  });
  await client.join({ joinRequestId: 'join:test', runtimeApiVersion: 1, sessionLocator: 'class:test', requestedRole: 'student', credential: { type: 'class-code', value: 'join-code' } });
  const clientEventId = await client.queueEvent({ appletInstanceId: 'applet-instance:board', appletEventSchemaVersion: 1, streamId: 'stream:test', type: 'object.moved', payload: { objectId: 'piece:a' } });
  assert.equal(clientEventId, 'client-event:fixed');
  assert.equal(client.state.pendingCount, 1);
  await client.connect();
  assert.equal(client.state.pendingCount, 0);
  assert.deepEqual(await outbox.list(), []);
});

test('ClassroomClient consumes server-owned Activity and Snapshot state', async () => {
  const outbox = new MemoryOutboxStore();
  let socket;
  const client = new ClassroomClient({
    baseUrl: 'http://classroom.test',
    outbox,
    idFactory: () => 'activity-fixed',
    fetchFn: async () => response({ grant: { membershipId: 'membership:test', sessionId: 'session:test', participantId: 'student:server-owned', role: 'student', accessToken: 'access:test', expiresAt: '2099-01-01T00:00:00.000Z' } }),
    socketFactory: () => { socket = new FakeSocket(); return socket; },
  });
  await client.join({ joinRequestId: 'join:activity', runtimeApiVersion: 1, sessionLocator: 'class:test', requestedRole: 'student', credential: { type: 'class-code', value: 'join-code' } });
  await client.connect();
  socket.emit('message', { data: JSON.stringify({
    type: 'activity.current',
    activity: {
      sessionId: 'session:test', lessonId: 'lesson:test',
      activity: { activitySchemaVersion: 1, activityId: 'activity:one', type: 'individual-work', participantMode: 'individual', applets: [], adviceMode: 'off', submissionPolicy: 'required' },
      applets: [{ instance: { appletInstanceId: 'instance:board', appletTypeId: 'applet:transform-board', requiredCapabilities: [] }, config: { board: { columns: 1, rows: 1 }, objects: [] } }],
    },
  }) });
  assert.equal(client.state.currentActivity.activity.activityId, 'activity:one');
  const snapshot = { sessionId: 'session:test', activityId: 'activity:one', appletInstanceId: 'instance:board', scope: { type: 'participant', id: 'student:server-owned' }, stateSchemaVersion: 1, revision: 2, state: { objects: {} }, capturedAt: '2099-01-01T00:00:00.000Z' };
  socket.emit('message', { data: JSON.stringify({ type: 'snapshot.state', snapshot }) });
  assert.equal(client.state.snapshots['instance:board'].revision, 2);
});

test('ClassroomClient reconnects after a transport close and resends pending durable work', async () => {
  const outbox = new MemoryOutboxStore();
  const sockets = [];
  const client = new ClassroomClient({
    baseUrl: 'http://classroom.test',
    outbox,
    idFactory: () => `reconnect-${sockets.length}`,
    reconnectDelayMs: 0,
    fetchFn: async () => response({ grant: { membershipId: 'membership:test', sessionId: 'session:test', participantId: 'student:server-owned', role: 'student', accessToken: 'access:test', expiresAt: '2099-01-01T00:00:00.000Z' } }),
    socketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
  });
  await client.join({ joinRequestId: 'join:reconnect', runtimeApiVersion: 1, sessionLocator: 'class:test', requestedRole: 'student', credential: { type: 'class-code', value: 'join-code' } });
  await client.connect();
  sockets[0].emit('close', {});
  await client.queueEvent({ appletInstanceId: 'applet-instance:board', appletEventSchemaVersion: 1, streamId: 'stream:test', type: 'object.moved', payload: { objectId: 'piece:a' } });
  for (let attempt = 0; attempt < 20 && client.state.pendingCount !== 0; attempt += 1)
    await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(sockets.length, 2);
  assert.equal(client.state.connection, 'online');
  assert.equal(client.state.pendingCount, 0);
  assert.equal(sockets[1].sent.some(message => message.type === 'applet.event'), true);
  client.disconnect();
});

test('ClassroomClient notifies richer surfaces after initial connect and automatic reconnect', async () => {
  const sockets = [];
  const client = new ClassroomClient({
    baseUrl: 'http://classroom.test',
    outbox: new MemoryOutboxStore(),
    reconnectDelayMs: 0,
    fetchFn: async () => response({ grant: { membershipId: 'membership:test', sessionId: 'session:test', participantId: 'student:server-owned', role: 'student', accessToken: 'access:test', expiresAt: '2099-01-01T00:00:00.000Z' } }),
    socketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
  });
  let connected = 0;
  client.onConnected(() => {
    connected += 1;
    client.sendControl({ type: 'observer.subscribe', subscriptionId: `observer-sub:${connected}` });
  });
  await client.join({ joinRequestId: 'join:observer-reconnect', runtimeApiVersion: 1, sessionLocator: 'class:test', requestedRole: 'student', credential: { type: 'class-code', value: 'join-code' } });
  await client.connect();
  sockets[0].emit('close', {});
  for (let attempt = 0; attempt < 20 && connected < 2; attempt += 1)
    await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(connected, 2);
  assert.equal(sockets[0].sent.filter(message => message.type === 'observer.subscribe').length, 1);
  assert.equal(sockets[1].sent.filter(message => message.type === 'observer.subscribe').length, 1);
  client.disconnect();
});
