import test from 'node:test';
import assert from 'node:assert/strict';
import { AppletEventSequencer } from '../dist/packages/applet-sdk/src/index.js';
test('Applet Host owns event envelope identity and monotonic sequence', () => {
    let id = 0;
    const s = new AppletEventSequencer('applet-instance:X', 1, 'stream:S17:X', () => `client-event:${++id}`);
    const a = s.next({ type: 'object.selected', payload: { objectId: 'B' } });
    const b = s.next({ type: 'object.rotated', payload: { objectId: 'B', centerId: 'P', direction: 'clockwise', angle: 90 } });
    assert.equal(a.appletInstanceId, 'applet-instance:X');
    assert.equal(a.streamSeq, 1);
    assert.equal(b.streamSeq, 2);
    assert.notEqual(a.clientEventId, b.clientEventId);
});

