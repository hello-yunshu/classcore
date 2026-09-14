import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { waitForHttpReady } from '../scripts/lib/ws-reference-client.mjs';

function waitForChild(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise(resolve => child.once('exit', resolve));
}

test('authenticated server fails closed without explicit credentials', async () => {
  const port = 28300 + Math.floor(Math.random() * 100);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-authenticated-config-'));
  const env = { ...process.env, HOST: '127.0.0.1', PORT: String(port), LOCAL_TOOLS_HOST: '127.0.0.1', LOCAL_TOOLS_PORT: String(port + 1), CLASSROOM_DATA_DIR: dataDir, CLASSROOM_LESSON: 'pattern-restoration' };
  delete env.CLASSROOM_DEMO_MODE;
  delete env.CLASSROOM_CREDENTIALS_JSON;
  const child = spawn(process.execPath, ['apps/server/runtime/authenticated-server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  try {
    const exitCode = await waitForChild(child);
    assert.equal(exitCode, 1);
    assert.match(stderr, /authenticated-runtime-credentials-required/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

async function openAuthenticated(baseUrl, token) {
  const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws`);
  const messages = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('authenticated-open-timeout')), 4000);
    ws.onerror = () => reject(new Error('authenticated-open-error'));
    ws.onopen = () => ws.send(JSON.stringify({ type: 'client.hello', protocolVersion: 1, runtimeApiVersion: 1, clientBuild: 'test', accessToken: token, capabilityReport: { capabilityReportVersion: 1, secureContext: false, indexedDb: false, pointerEvents: true, webWorkers: false, webSocket: true } }));
    ws.onmessage = event => {
      const message = JSON.parse(String(event.data));
      messages.push(message);
      if (message.type === 'server.hello') { clearTimeout(timer); resolve(message); }
    };
  });
  return { ws, messages };
}

async function waitForMessage(messages, predicate, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const match = messages.find(predicate);
    if (match) return match;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('authenticated-message-timeout');
}

test('authenticated server protocol owns Join, Activity, Event, Snapshot and Submission ACKs', async () => {
  const port = 28500 + Math.floor(Math.random() * 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-authenticated-'));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['apps/server/runtime/authenticated-server.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), LOCAL_TOOLS_HOST: '127.0.0.1', LOCAL_TOOLS_PORT: String(port + 1), CLASSROOM_DATA_DIR: dataDir, CLASSROOM_LESSON: 'pattern-restoration', CLASSROOM_DEMO_MODE: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitForHttpReady(`${baseUrl}/readyz`);
    const health = await (await fetch(`${baseUrl}/healthz`)).json();
    assert.deepEqual({ runtime: health.runtime, arch: health.arch, platform: health.platform }, { runtime: 'authenticated-classroom-server', arch: process.arch, platform: process.platform });
    const localToolsUrl = `http://127.0.0.1:${port + 1}`;
    const localToolsHealth = await (await fetch(`${localToolsUrl}/healthz`)).json();
    assert.equal(localToolsHealth.service, 'authenticated-local-tools');
    assert.deepEqual({ runtime: localToolsHealth.runtime, arch: localToolsHealth.arch, platform: localToolsHealth.platform }, { runtime: 'authenticated-local-tools', arch: process.arch, platform: process.platform });
    const backstage = await fetch(`${localToolsUrl}/backstage`);
    assert.equal(backstage.status, 200);
    assert.match(await backstage.text(), /课程准备台/);
    const authoring = await fetch(`${localToolsUrl}/authoring`);
    assert.equal(authoring.status, 200);
    assert.match(await authoring.text(), /studio-root/);
    const ready = await (await fetch(`${baseUrl}/readyz`)).json();
    assert.deepEqual({ runtimeMode: ready.runtimeMode, authentication: ready.authentication, productReady: ready.productReady }, { runtimeMode: 'authenticated-classroom-server', authentication: true, productReady: true });
    const join = await (await fetch(`${baseUrl}/api/classroom/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ joinRequestId: 'join:test', runtimeApiVersion: 1, sessionLocator: 'class:authenticated-demo', requestedRole: 'student', credential: { type: 'class-code', value: 'A17' } }),
    })).json();
    assert.equal(join.grant.participantId, 'student:S17');
    assert.deepEqual(join.self, { participantId: 'student:S17', displayName: '学生 S17', seatNo: 'S17' });
    assert.equal(join.currentActivity.activity.activityId, 'activity:restore-independent');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('authenticated-protocol-timeout')), 4000);
      let liveSeen = false;
      const snapshot = { sessionId: join.grant.sessionId, activityId: 'activity:restore-independent', appletInstanceId: 'applet-instance:restore-independent-board', scope: { type: 'participant', id: 'student:S17' }, stateSchemaVersion: 1, revision: 1, state: { objects: {} }, capturedAt: '2026-09-13T00:00:00.000Z' };
      ws.onerror = () => reject(new Error('authenticated-protocol-websocket-error'));
      ws.onopen = () => ws.send(JSON.stringify({ type: 'client.hello', protocolVersion: 1, runtimeApiVersion: 1, clientBuild: 'test', accessToken: join.grant.accessToken, capabilityReport: { capabilityReportVersion: 1, secureContext: false, indexedDb: false, pointerEvents: true, webWorkers: false, webSocket: true } }));
      ws.onmessage = event => {
        const message = JSON.parse(String(event.data));
        if (message.type === 'server.hello') {
          ws.send(JSON.stringify({ type: 'live.state', frame: { sessionId: join.grant.sessionId, activityId: 'activity:restore-independent', appletInstanceId: snapshot.appletInstanceId, scope: { type: 'participant', id: 'student:S17' }, streamId: 'live:test', seq: 1, payload: { preview: true } } }));
        } else if (message.type === 'live.state') {
          liveSeen = true;
          assert.deepEqual(message.frame.payload, { preview: true });
          ws.send(JSON.stringify({ type: 'applet.event', event: { clientEventId: 'client:event:test', eventEnvelopeVersion: 1, appletEventSchemaVersion: 1, appletInstanceId: snapshot.appletInstanceId, streamId: 'stream:test', streamSeq: 1, type: 'object.moved', payload: { objectId: 'piece:a' } } }));
        } else if (message.type === 'event.ack') {
          assert.equal(message.ok, true);
          ws.send(JSON.stringify({ type: 'applet.snapshot', clientEventId: 'client:snapshot:test', snapshot }));
        } else if (message.type === 'snapshot.ack') {
          assert.equal(message.ok, true);
          ws.send(JSON.stringify({ type: 'submission.submit', clientEventId: 'client:submission:test', payload: { appletInstanceId: snapshot.appletInstanceId, recordTokens: [{ kind: 'word', value: '平移', display: '平移' }], recordText: '平移', snapshot: { objects: {} }, solved: false } }));
        } else if (message.type === 'submission.ack') {
          clearTimeout(timer);
          resolve(message);
          ws.close();
        }
      };
    });
    assert.equal(result.ok, true);
  } finally {
    child.kill('SIGTERM');
    await waitForChild(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('display receives only public projections, never raw presence, submissions or live frames', async () => {
  const port = 28800 + Math.floor(Math.random() * 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-display-boundary-'));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['apps/server/runtime/authenticated-server.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), LOCAL_TOOLS_HOST: '127.0.0.1', LOCAL_TOOLS_PORT: String(port + 1), CLASSROOM_DATA_DIR: dataDir, CLASSROOM_LESSON: 'pattern-restoration', CLASSROOM_DEMO_MODE: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitForHttpReady(`${baseUrl}/readyz`);
    const runtimeResponse = await fetch(`${baseUrl}/api/sessions/session%3Aauthenticated-demo/presentation-runtime`);
    assert.equal(runtimeResponse.status, 200);
    const runtimePayload = await runtimeResponse.json();
    assert.equal(runtimePayload.runtime.pin.revisionId, runtimePayload.runtime.revision.revisionId);
    assert.equal(runtimePayload.runtime.state.assetId, runtimePayload.runtime.pin.assetId);
    assert.ok(runtimePayload.runtime.revision.runtimeIndex.scenes.length >= 1);
    const assetResponse = await fetch(`${baseUrl}/api/sessions/session%3Aauthenticated-demo/presentation-runtime/asset`);
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get('x-content-sha256'), runtimePayload.runtime.revision.fingerprint);
    assert.equal((await assetResponse.arrayBuffer()).byteLength, Number(assetResponse.headers.get('content-length')));
    assert.equal((await fetch(`${baseUrl}/api/sessions/session%3Aother/presentation-runtime`)).status, 404);
    const join = async (requestedRole, credential) => (await fetch(`${baseUrl}/api/classroom/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ joinRequestId: `join:${requestedRole}:boundary`, runtimeApiVersion: 1, sessionLocator: 'class:authenticated-demo', requestedRole, credential }),
    })).json();
    const display = await openAuthenticated(baseUrl, (await join('display', { type: 'display-token', value: 'D17' })).grant.accessToken);
    const observer = await openAuthenticated(baseUrl, (await join('observer', { type: 'observer-token', value: 'O17' })).grant.accessToken);
    observer.ws.send(JSON.stringify({ type: 'observer.subscribe', subscriptionId: 'observer-sub:boundary' }));
    let student = await openAuthenticated(baseUrl, (await join('student', { type: 'class-code', value: 'A17' })).grant.accessToken);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(display.messages.some(message => message.type === 'classroom.presence.public'));
    assert.equal(display.messages.some(message => message.type === 'classroom.presence'), false);
    assert.equal(display.messages.some(message => message.type === 'classroom.submissions'), false);
    assert.ok(observer.messages.some(message => message.type === 'observer.subscribe.ack' && message.ok === true));
    assert.ok(observer.messages.some(message => message.type === 'classroom.presence.public'));
    assert.ok(observer.messages.some(message => message.type === 'presentation.sync'));
    assert.equal(observer.messages.some(message => message.type === 'classroom.presence'), false);
    assert.equal(observer.messages.some(message => message.type === 'classroom.submissions'), false);
    student.ws.close();
    await new Promise(resolve => setTimeout(resolve, 100));
    student = await openAuthenticated(baseUrl, (await join('student', { type: 'class-code', value: 'A17' })).grant.accessToken);
    await new Promise(resolve => setTimeout(resolve, 100));
    const latestPublicPresence = display.messages.filter(message => message.type === 'classroom.presence.public').at(-1);
    assert.equal(new Set(latestPublicPresence.presence.map(item => item.subjectId)).size, latestPublicPresence.presence.length);
    const teacher = await openAuthenticated(baseUrl, (await join('teacher', { type: 'teacher-issued', value: 'T17' })).grant.accessToken);
    teacher.ws.send(JSON.stringify({ type: 'teacher.lease.claim', expectedRevision: 0 }));
    await waitForMessage(teacher.messages, message => message.type === 'teacher.lease.ack' && message.ok === true);
    teacher.ws.send(JSON.stringify({ type: 'teacher.selection.set', participantIds: ['student:S17'], expectedRevision: 0 }));
    await waitForMessage(teacher.messages, message => message.type === 'teacher.selection.ack' && message.ok === true);
    const observerLiveStage = await waitForMessage(observer.messages, message => message.type === 'stage.state' && message.audience === 'observer' && message.stage?.payload?.widget?.selector === 'selected-live-view');
    assert.deepEqual(observerLiveStage.stage.payload.widget, { selector: 'selected-live-view', selectedCount: 1, activeCount: 0, objectCount: 0, latestSeq: 0 });
    assert.equal('selectedParticipantIds' in observerLiveStage.stage.payload, false);
    teacher.ws.send(JSON.stringify({ type: 'teacher.stage.source', source: 'student-live', expectedRevision: 1 }));
    const observerStage = await waitForMessage(observer.messages, message => message.type === 'stage.state' && message.audience === 'observer' && message.stage?.revision === 2);
    assert.equal(observerStage.stage.payload.widget.selector, 'selected-live-view');
    teacher.ws.send(JSON.stringify({ type: 'teacher.stage.source', source: 'activity', expectedRevision: 2 }));
    const observerActivityStage = await waitForMessage(observer.messages, message => message.type === 'stage.state' && message.audience === 'observer' && message.stage?.revision === 3 && message.stage?.payload?.widget?.selector === 'current-activity-summary');
    assert.deepEqual(observerActivityStage.stage.payload.widget, {
      selector: 'current-activity-summary',
      activityId: 'activity:restore-independent',
      activityType: 'individual-work',
      participantMode: 'individual',
      appletCount: 1,
      adviceMode: 'off',
      submissionPolicy: 'required',
    });
    assert.equal('selectedParticipantIds' in observerActivityStage.stage.payload, false);
    student.ws.send(JSON.stringify({ type: 'live.state', frame: { sessionId: 'session:authenticated-demo', activityId: 'activity:restore-independent', appletInstanceId: 'applet-instance:restore-independent-board', scope: { type: 'participant', id: 'student:S17' }, streamId: 'live:boundary', seq: 1, payload: { preview: true } } }));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(display.messages.some(message => message.type === 'live.state'), false);
    assert.equal(observer.messages.some(message => message.type === 'live.state'), false);
    display.ws.close(); observer.ws.close(); student.ws.close(); teacher.ws.close();
  } finally {
    child.kill('SIGTERM');
    await waitForChild(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('teacher analytics uses lesson evidence and requires confirmation before Stage comparison', async () => {
  const port = 29100 + Math.floor(Math.random() * 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-analytics-chain-'));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['apps/server/runtime/authenticated-server.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), LOCAL_TOOLS_HOST: '127.0.0.1', LOCAL_TOOLS_PORT: String(port + 1), CLASSROOM_DATA_DIR: dataDir, CLASSROOM_LESSON: 'pattern-restoration', CLASSROOM_DEMO_MODE: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitForHttpReady(`${baseUrl}/readyz`);
    const join = async (requestedRole, credential) => (await fetch(`${baseUrl}/api/classroom/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ joinRequestId: `join:${requestedRole}:analytics`, runtimeApiVersion: 1, sessionLocator: 'class:authenticated-demo', requestedRole, credential }),
    })).json();
    const teacherJoin = await join('teacher', { type: 'teacher-issued', value: 'T17' });
    const studentJoin = await join('student', { type: 'class-code', value: 'A17' });
    const observerJoin = await join('observer', { type: 'observer-token', value: 'O17' });
    const teacher = await openAuthenticated(baseUrl, teacherJoin.grant.accessToken);
    const student = await openAuthenticated(baseUrl, studentJoin.grant.accessToken);
    const observer = await openAuthenticated(baseUrl, observerJoin.grant.accessToken);
    observer.ws.send(JSON.stringify({ type: 'observer.subscribe', subscriptionId: 'observer-sub:analytics' }));
    await waitForMessage(observer.messages, message => message.type === 'observer.subscribe.ack' && message.ok === true);
    teacher.ws.send(JSON.stringify({ type: 'teacher.lease.claim', expectedRevision: 0 }));
    await waitForMessage(teacher.messages, message => message.type === 'teacher.lease.ack' && message.ok === true);
    student.ws.send(JSON.stringify({ type: 'applet.event', event: { clientEventId: 'analytics:event:1', eventEnvelopeVersion: 1, appletEventSchemaVersion: 1, appletInstanceId: 'applet-instance:restore-independent-board', streamId: 'stream:analytics', streamSeq: 1, type: 'object.rotated', payload: { objectId: 'piece:a', centerId: 'P', angle: 90 } } }));
    await waitForMessage(student.messages, message => message.type === 'event.ack' && message.clientEventId === 'analytics:event:1');
    student.ws.send(JSON.stringify({ type: 'submission.submit', clientEventId: 'analytics:submission:1', payload: { appletInstanceId: 'applet-instance:restore-independent-board', recordTokens: [{ kind: 'word', value: '旋转', display: '旋转' }], recordText: '旋转', snapshot: { objects: {} }, solved: false } }));
    await waitForMessage(student.messages, message => message.type === 'submission.ack' && message.clientEventId === 'analytics:submission:1');
    teacher.ws.send(JSON.stringify({ type: 'teacher.analytics.request', participantId: 'student:S17' }));
    const resultMessage = await waitForMessage(teacher.messages, message => message.type === 'teacher.analytics.result' && message.ok === true);
    assert.equal(resultMessage.result.subject.id, 'student:S17');
    assert.ok(resultMessage.result.classifications.some(item => item.code === 'rotate-first'));
    const recommendation = resultMessage.result.recommendations[0];
    assert.equal(recommendation.status, 'candidate');
    teacher.ws.send(JSON.stringify({ type: 'teacher.analytics.confirm', resultId: resultMessage.result.resultId, recommendationId: recommendation.recommendationId, expectedRevision: 0 }));
    const confirmed = await waitForMessage(teacher.messages, message => message.type === 'teacher.analytics.confirmed' && message.ok === true);
    assert.equal(confirmed.result.recommendations[0].status, 'confirmed');
    assert.equal(confirmed.stage.contentType, 'core:student-comparison');
    assert.equal(confirmed.stage.payload.widget.selector, 'selected-artifact');
    assert.equal(confirmed.stage.payload.widget.artifactCount, 1);
    const publicComparison = await waitForMessage(observer.messages, message => message.type === 'stage.state' && message.audience === 'observer' && message.stage?.contentType === 'core:student-comparison');
    assert.deepEqual(publicComparison.stage.payload.widget, { selector: 'selected-artifact', evidenceCount: 2, artifactCount: 1 });
    assert.deepEqual(publicComparison.stage.payload.artifactContents, [{
      artifactType: 'student-submission-evidence',
      revision: 1,
      recordText: '旋转',
      tokens: [{ kind: 'word', display: '旋转' }],
      objectCount: 0,
      solved: false,
      objects: [],
    }]);
    assert.equal('recommendationId' in publicComparison.stage.payload, false);
    teacher.ws.close(); student.ws.close(); observer.ws.close();
  } finally {
    child.kill('SIGTERM');
    await waitForChild(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('authenticated Presentation controls use the published playback revision and public Display sync', async () => {
  const port = 29400 + Math.floor(Math.random() * 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-presentation-chain-'));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['apps/server/runtime/authenticated-server.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), LOCAL_TOOLS_HOST: '127.0.0.1', LOCAL_TOOLS_PORT: String(port + 1), CLASSROOM_DATA_DIR: dataDir, CLASSROOM_LESSON: 'pattern-restoration', CLASSROOM_DEMO_MODE: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitForHttpReady(`${baseUrl}/readyz`);
    const join = async (requestedRole, credential) => (await fetch(`${baseUrl}/api/classroom/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ joinRequestId: `join:${requestedRole}:presentation`, runtimeApiVersion: 1, sessionLocator: 'class:authenticated-demo', requestedRole, credential }),
    })).json();
    const teacherJoin = await join('teacher', { type: 'teacher-issued', value: 'T17' });
    const displayJoin = await join('display', { type: 'display-token', value: 'D17' });
    const teacher = await openAuthenticated(baseUrl, teacherJoin.grant.accessToken);
    const display = await openAuthenticated(baseUrl, displayJoin.grant.accessToken);
    teacher.ws.send(JSON.stringify({ type: 'teacher.lease.claim', expectedRevision: 0 }));
    await waitForMessage(teacher.messages, message => message.type === 'teacher.lease.ack' && message.ok === true);
    teacher.ws.send(JSON.stringify({ type: 'teacher.stage.source', source: 'presentation', expectedRevision: 0 }));
    const presentationStage = await waitForMessage(teacher.messages, message => message.type === 'stage.state' && message.stage?.contentType === 'presentation:deck');
    assert.equal(presentationStage.stage.payload.source, 'presentation');
    const initial = await waitForMessage(display.messages, message => message.type === 'presentation.sync' && message.state?.revision === 0);
    assert.equal(initial.state.presentationRevisionId.startsWith('published-'), true);
    let expectedRevision = 0;
    if (process.env.CLASSROOM_PRESENTATION_PPTX) {
      teacher.ws.send(JSON.stringify({ type: 'presentation.control', controlId: 'presentation:goto:2', action: 'goto', sceneId: 'auth-demos2', step: 0, expectedRevision }));
      const gotoAck = await waitForMessage(teacher.messages, message => message.type === 'presentation.control.ack' && message.controlId === 'presentation:goto:2');
      assert.equal(gotoAck.ok, true);
      assert.equal(gotoAck.state.sceneId, 'auth-demos2');
      expectedRevision = 1;
      await waitForMessage(display.messages, message => message.type === 'presentation.sync' && message.state?.revision === expectedRevision);
    }
    teacher.ws.send(JSON.stringify({ type: 'presentation.control', controlId: 'presentation:play:1', action: 'play', expectedRevision }));
    const ack = await waitForMessage(teacher.messages, message => message.type === 'presentation.control.ack' && message.controlId === 'presentation:play:1');
    assert.equal(ack.ok, true);
    assert.equal(ack.state.playState, 'playing');
    assert.equal(ack.state.revision, expectedRevision + 1);
    const synced = await waitForMessage(display.messages, message => message.type === 'presentation.sync' && message.state?.revision === expectedRevision + 1);
    assert.equal(synced.state.playState, 'playing');
    teacher.ws.close(); display.ws.close();
  } finally {
    child.kill('SIGTERM');
    await waitForChild(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
