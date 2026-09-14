import test from 'node:test';
import assert from 'node:assert/strict';
import { TeacherRecommendationGate, runAnalytics } from '../dist/packages/intelligence/src/index.js';
import { patternRestorationAnalyticsProvider, toStageComparison } from '../lessons/pattern-restoration/analytics/profile.mjs';

function input() {
    return {
        sessionId: 'session:fixture',
        activityId: 'activity:fixture',
        subject: { type: 'participant', id: 'subject:fixture' },
        events: [
            { eventId: 'event:1', serverSeq: 1, type: 'object.moved', payload: { objectId: 'object:one', to: { x: 1, y: 0 } } },
            { eventId: 'event:2', serverSeq: 2, type: 'object.rotated', payload: { objectId: 'object:one', centerId: 'pivot:one', angle: 90 } },
            { eventId: 'event:3', serverSeq: 3, type: 'record.token.append', payload: { token: '向右平移' } },
            { eventId: 'event:4', serverSeq: 4, type: 'attempt.completed', payload: { solved: true } },
        ],
        snapshots: [],
        artifacts: [{ artifactId: 'artifact:evidence', artifactType: 'student-submission-evidence', revision: 1, sessionId: 'session:fixture', activityId: 'activity:fixture', ownerScope: { type: 'participant', id: 'subject:fixture' }, payload: {}, createdAt: '2026-09-13T00:00:00.000Z' }],
        features: [{ name: 'elapsed-ms', value: 1200 }],
    };
}

test('lesson analytics is deterministic and evidence refs point to real records', async () => {
    const result = await runAnalytics(input(), patternRestorationAnalyticsProvider, { idFactory: () => 'fixture', clock: () => 'now' });
    assert.deepEqual(result.classifications.map(item => item.code), ['translate-first', 'concise-path']);
    assert.equal(result.metrics.find(item => item.name === 'elapsed-ms')?.value, 1200);
    assert.deepEqual(result.recommendations[0].evidence.map(item => item.id), ['event:1', 'artifact:evidence']);
    assert.equal(result.provider.name, 'pattern-restoration-profile');
});

test('recommendation requires teacher confirmation before generic Stage comparison', async () => {
    const result = await runAnalytics(input(), patternRestorationAnalyticsProvider, { idFactory: () => 'fixture' });
    const gate = new TeacherRecommendationGate();
    const candidate = gate.propose(result.recommendations[0]);
    assert.throws(() => toStageComparison(candidate), /confirmation-required/);
    const confirmed = gate.confirm(candidate.recommendationId);
    const stage = toStageComparison(confirmed);
    assert.equal(stage.contentType, 'core:student-comparison');
    assert.deepEqual(stage.payload.evidence.map(item => item.id), ['event:1', 'artifact:evidence']);
});

test('provider timeout falls back without weakening the classroom path', async () => {
    const fallback = { provenance: { mode: 'rule', name: 'fallback', version: '1' }, analyze: async () => ({ classifications: [{ code: 'fallback', confidence: 1, evidence: [] }], metrics: [], recommendations: [] }) };
    const result = await runAnalytics(input(), { provenance: { mode: 'llm', name: 'unavailable', version: '1' }, analyze: async () => new Promise(() => {}) }, { timeoutMs: 5, fallback });
    assert.equal(result.classifications[0].code, 'fallback');
    assert.equal(result.provider.name, 'fallback');
});
