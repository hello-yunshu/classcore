import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_RUNTIME_BUDGETS, TRAFFIC_PRIORITY, canDropUnderPressure } from '../dist/packages/surfaces/src/index.js';
import { InMemoryIdentityDirectory, InMemoryStudentClaimDirectory, validateStudentIdentityRoster } from '../dist/packages/identity/src/index.js';
test('student runtime budget stays lighter than teacher/observer', () => {
    assert.equal(CLIENT_RUNTIME_BUDGETS.student.allowHeavyCharts, false);
    assert.equal(CLIENT_RUNTIME_BUDGETS.student.allowAuthoringEditor, false);
    assert.equal(CLIENT_RUNTIME_BUDGETS.student.loadCurrentActivityOnly, true);
    assert.ok(CLIENT_RUNTIME_BUDGETS['teacher-runtime'].maxConcurrentLiveViews > CLIENT_RUNTIME_BUDGETS.student.maxConcurrentLiveViews);
    assert.ok(CLIENT_RUNTIME_BUDGETS.observer.maxConcurrentLiveViews > CLIENT_RUNTIME_BUDGETS.student.maxConcurrentLiveViews);
});
test('durable student traffic is never shed before observer/background traffic', () => {
    assert.ok(TRAFFIC_PRIORITY['student-durable'] < TRAFFIC_PRIORITY['observer-live']);
    assert.equal(canDropUnderPressure('student-durable'), false);
    assert.equal(canDropUnderPressure('teacher-control'), false);
    assert.equal(canDropUnderPressure('observer-live'), true);
    assert.equal(canDropUnderPressure('background-ops'), true);
});
test('student identity claim supports reconnect and rejects accidental duplicate device claim', () => {
    const identities = new InMemoryIdentityDirectory();
    identities.upsertStudent({ sessionId: 'session:A', participantId: 'student:S17', displayName: '学生甲', seatNo: '17', updatedAt: '2026-09-10T00:00:00Z' });
    let n = 0;
    const claims = new InMemoryStudentClaimDirectory(identities, () => `token:${++n}`);
    const first = claims.claim('session:A', '17', 'client:A');
    assert.equal(first.ok, true);
    assert.equal(first.reconnected, false);
    const duplicate = claims.claim('session:A', '17', 'client:B');
    assert.deepEqual(duplicate, { ok: false, reason: 'already-claimed' });
    const reconnect = claims.claim('session:A', '17', 'client:B', first.reconnectToken);
    assert.equal(reconnect.ok, true);
    assert.equal(reconnect.reconnected, true);
    claims.reset('session:A', 'student:S17');
    const afterReset = claims.claim('session:A', '17', 'client:C');
    assert.equal(afterReset.ok, true);
    assert.equal(afterReset.reconnected, false);
});
test('student roster rejects duplicate seatNo/rosterId before classroom starts', () => {
    const identities = new InMemoryIdentityDirectory();
    identities.upsertStudent({ sessionId: 'session:A', participantId: 'student:S17', displayName: '学生甲', seatNo: '17', rosterId: 'r17', updatedAt: '2026-09-10T00:00:00Z' });
    assert.throws(() => identities.upsertStudent({ sessionId: 'session:A', participantId: 'student:S18', displayName: '学生乙', seatNo: '17', rosterId: 'r18', updatedAt: '2026-09-10T00:00:00Z' }), /duplicate-seat-no/);
    assert.throws(() => identities.upsertStudent({ sessionId: 'session:A', participantId: 'student:S18', displayName: '学生乙', seatNo: '18', rosterId: 'r17', updatedAt: '2026-09-10T00:00:00Z' }), /duplicate-roster-id/);
    const issues = validateStudentIdentityRoster([
        { sessionId: 'session:B', participantId: 'student:S1', displayName: '甲', seatNo: '1', updatedAt: 'x' },
        { sessionId: 'session:B', participantId: 'student:S2', displayName: '乙', seatNo: '1', updatedAt: 'x' },
    ]);
    assert.equal(issues[0].code, 'duplicate-seat-no');
});
test('server-side roster preflight reports duplicate identity hints as failed readiness', async () => {
    const { buildRosterReadinessChecks } = await import('../dist/apps/server/src/preflight.js');
    const checks = buildRosterReadinessChecks([
        { sessionId: 'session:P', participantId: 'student:S1', displayName: '甲', seatNo: '8', updatedAt: 'x' },
        { sessionId: 'session:P', participantId: 'student:S2', displayName: '乙', seatNo: '8', updatedAt: 'x' },
    ]);
    assert.equal(checks[0].status, 'failed');
    assert.match(checks[0].message, /8/);
});
test('student login hint cannot collide across seatNo and rosterId', () => {
    const issues = validateStudentIdentityRoster([
        { sessionId: 'session:H', participantId: 'student:S1', displayName: '甲', seatNo: '17', rosterId: 'r1', updatedAt: 'x' },
        { sessionId: 'session:H', participantId: 'student:S2', displayName: '乙', seatNo: '18', rosterId: '17', updatedAt: 'x' },
    ]);
    assert.ok(issues.some(x => x.code === 'ambiguous-participant-hint' && x.value === '17'));
    const identities = new InMemoryIdentityDirectory();
    identities.upsertStudent({ sessionId: 'session:H', participantId: 'student:S1', displayName: '甲', seatNo: '17', rosterId: 'r1', updatedAt: 'x' });
    assert.throws(() => identities.upsertStudent({ sessionId: 'session:H', participantId: 'student:S2', displayName: '乙', seatNo: '18', rosterId: '17', updatedAt: 'x' }), /ambiguous-participant-hint/);
});

test('student roster preflight rejects duplicate participantId rows even when the repeated id is identical', () => {
    const issues = validateStudentIdentityRoster([
        { sessionId: 'session:D', participantId: 'student:S1', displayName: '甲', seatNo: '1', updatedAt: 'x' },
        { sessionId: 'session:D', participantId: 'student:S1', displayName: '乙', seatNo: '2', updatedAt: 'x' },
    ]);
    assert.ok(issues.some(x => x.code === 'duplicate-participant-id' && x.value === 'student:S1'));
});

test('student claim normalizes surrounding whitespace consistently with roster preflight', () => {
    const identities = new InMemoryIdentityDirectory();
    identities.upsertStudent({ sessionId: 'session:N', participantId: 'student:S17', displayName: '甲', seatNo: ' 17 ', rosterId: ' r17 ', updatedAt: 'x' });
    const claims = new InMemoryStudentClaimDirectory(identities, () => 'token:n');
    const bySeat = claims.claim('session:N', '17', 'client:A');
    assert.equal(bySeat.ok, true);
    assert.equal(claims.get('session:N', 'student:S17')?.participantHint, '17');
    claims.reset('session:N', 'student:S17');
    const byRoster = claims.claim('session:N', '  r17  ', 'client:B');
    assert.equal(byRoster.ok, true);
    assert.equal(claims.get('session:N', 'student:S17')?.participantHint, 'r17');
});

test('blank student claim hint fails closed instead of matching missing seat/roster fields', () => {
    const identities = new InMemoryIdentityDirectory();
    identities.upsertStudent({ sessionId: 'session:E', participantId: 'student:S1', displayName: '甲', updatedAt: 'x' });
    identities.upsertStudent({ sessionId: 'session:E', participantId: 'student:S2', displayName: '乙', updatedAt: 'x' });
    const claims = new InMemoryStudentClaimDirectory(identities, () => 'never');
    assert.deepEqual(claims.claim('session:E', '   ', 'client:A'), { ok: false, reason: 'unknown-student' });
});

