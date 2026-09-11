import test from 'node:test';
import assert from 'node:assert/strict';
class AtomicEventStore {
    constructor() { this.byKey = new Map(); this.seqBySession = new Map(); this.nextId = 0; }
    accept(idempotencyKey, draft) {
        const old = this.byKey.get(idempotencyKey);
        if (old)
            return { inserted: false, event: old };
        const seq = (this.seqBySession.get(draft.sessionId) ?? 0) + 1;
        this.seqBySession.set(draft.sessionId, seq);
        const event = { ...draft, eventId: `event:server-${++this.nextId}`, serverSeq: seq, serverReceivedAt: '2026-09-10T05:00:00Z' };
        this.byKey.set(idempotencyKey, event);
        return { inserted: true, event };
    }
}
test('durable retry is atomically deduplicated and returns original event', () => {
    const s = new AtomicEventStore();
    const d = { sessionId: 'session:A', type: 'object.moved' };
    const a = s.accept('session:A|student:S17|instance:X|client:1', d);
    const b = s.accept('session:A|student:S17|instance:X|client:1', d);
    assert.equal(a.inserted, true);
    assert.equal(b.inserted, false);
    assert.equal(a.event.eventId, b.event.eventId);
    assert.equal(a.event.serverSeq, b.event.serverSeq);
});
test('same raw client event id from different participants stays distinct', () => {
    const s = new AtomicEventStore();
    const d = { sessionId: 'session:A', type: 'object.moved' };
    const a = s.accept('session:A|student:S17|instance:X|same', d);
    const b = s.accept('session:A|student:S23|instance:X|same', d);
    assert.notEqual(a.event.eventId, b.event.eventId);
    assert.equal(a.event.serverSeq, 1);
    assert.equal(b.event.serverSeq, 2);
});
test('event sequence is session scoped', () => {
    const s = new AtomicEventStore();
    const a = s.accept('A1', { sessionId: 'session:A' });
    const b = s.accept('B1', { sessionId: 'session:B' });
    assert.equal(a.event.serverSeq, 1);
    assert.equal(b.event.serverSeq, 1);
});
test('state keys are session scoped', () => {
    const key = (session, activity, instance, scope) => [session, activity, instance, scope.type, scope.id].join('|');
    assert.notEqual(key('session:A', 'a', 'i', { type: 'participant', id: 'S17' }), key('session:B', 'a', 'i', { type: 'participant', id: 'S17' }));
});

