import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteClassroomStateStore } from '../apps/server/runtime/sqlite-store.mjs';

test('transport idempotency accepts semantically identical object key ordering but rejects conflicting payload reuse', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-transport-payload-'));
  const file = path.join(dir, 'state.sqlite');
  const store = new SqliteClassroomStateStore(file);
  try {
    const first = store.acceptTransportEvent('session:A', 'evt:1', { type: 'student.event', eventId: 'evt:1', payload: { a: 1, b: 2 } });
    assert.equal(first.inserted, true);
    const retry = store.acceptTransportEvent('session:A', 'evt:1', { eventId: 'evt:1', payload: { b: 2, a: 1 }, type: 'student.event' });
    assert.equal(retry.inserted, false);
    assert.equal(retry.serverSeq, first.serverSeq);
    assert.throws(() => store.acceptTransportEvent('session:A', 'evt:1', { type: 'student.event', eventId: 'evt:1', payload: { a: 1, b: 3 } }), /transport-id-payload-mismatch:event:evt:1/);
    const ctl = store.acceptTransportControl('session:A', 'ctl:1', { type: 'teacher.control', controlId: 'ctl:1', action: 'next' });
    assert.equal(ctl.inserted, true);
    assert.throws(() => store.acceptTransportControl('session:A', 'ctl:1', { type: 'teacher.control', controlId: 'ctl:1', action: 'previous' }), /transport-id-payload-mismatch:control:ctl:1/);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
