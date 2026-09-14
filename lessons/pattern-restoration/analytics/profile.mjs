const transformationTypes = new Set(['object.moved', 'object.rotated']);

function eventRef(event, pointer = '/type') {
    return { kind: 'event', id: event.eventId, pointer };
}

function firstEvent(events, type) { return events.find(event => event.type === type) ?? null; }

function eventEvidence(events, predicate) { return events.filter(predicate).map(event => eventRef(event)); }

function numberPayload(event, key) {
    const value = event?.payload?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildAnalytics(input) {
    const events = [...input.events].sort((left, right) => left.serverSeq - right.serverSeq);
    const moves = events.filter(event => event.type === 'object.moved');
    const rotations = events.filter(event => event.type === 'object.rotated');
    const transforms = events.filter(event => transformationTypes.has(event.type));
    const firstTransform = transforms[0] ?? null;
    const undoEvents = events.filter(event => event.type === 'history.undo');
    const resetEvents = events.filter(event => event.type === 'attempt.reset');
    const recordEvents = events.filter(event => event.type === 'record.token.append');
    const completed = events.filter(event => event.type === 'attempt.completed' && event.payload?.solved === true);
    const evidence = firstTransform ? [eventRef(firstTransform)] : [];
    const classifications = [];
    if (firstTransform?.type === 'object.rotated') classifications.push({ code: 'rotate-first', confidence: 1, evidence });
    if (firstTransform?.type === 'object.moved') classifications.push({ code: 'translate-first', confidence: 1, evidence });
    if (rotations.length && !moves.length) classifications.push({ code: 'orientation-first', confidence: 0.9, evidence: rotations.map(event => eventRef(event)) });
    if (moves.length && !rotations.length) classifications.push({ code: 'position-first', confidence: 0.9, evidence: moves.map(event => eventRef(event)) });
    if (transforms.length >= 6) classifications.push({ code: 'high-trial', confidence: 0.85, evidence: transforms.slice(0, 6).map(event => eventRef(event)) });
    if (transforms.length > 0 && transforms.length <= 4 && recordEvents.length > 0) classifications.push({ code: 'concise-path', confidence: 0.8, evidence: [...transforms, ...recordEvents].map(event => eventRef(event)) });
    const missingPivot = rotations.filter(event => typeof event.payload?.centerId !== 'string' || !event.payload.centerId);
    const missingDistance = moves.filter(event => numberPayload(event, 'distance') === null && typeof event.payload?.to !== 'object');
    const missingAngle = rotations.filter(event => numberPayload(event, 'angle') === null);
    if (missingPivot.length) classifications.push({ code: 'missing-pivot', confidence: 1, evidence: missingPivot.map(event => eventRef(event, '/payload/centerId')) });
    if (missingDistance.length) classifications.push({ code: 'missing-distance', confidence: 1, evidence: missingDistance.map(event => eventRef(event, '/payload')) });
    if (missingAngle.length) classifications.push({ code: 'missing-angle', confidence: 1, evidence: missingAngle.map(event => eventRef(event, '/payload/angle')) });

    const latestSubmission = input.artifacts.find(artifact => artifact.artifactType === 'student-submission-evidence') ?? null;
    const artifactEvidence = latestSubmission ? [{ kind: 'artifact', id: latestSubmission.artifactId, revision: latestSubmission.revision, pointer: '/payload' }] : [];
    const metrics = [
        { name: 'translate-count', value: moves.length, unit: 'events' },
        { name: 'rotate-count', value: rotations.length, unit: 'events' },
        { name: 'undo-count', value: undoEvents.length, unit: 'events' },
        { name: 'reset-count', value: resetEvents.length, unit: 'events' },
        { name: 'record-token-count', value: recordEvents.length, unit: 'tokens' },
        { name: 'successful-attempt-count', value: completed.length, unit: 'attempts' },
    ];
    const elapsed = input.features?.find(feature => feature.name === 'elapsed-ms');
    if (elapsed && typeof elapsed.value === 'number') metrics.push({ name: 'elapsed-ms', value: elapsed.value, unit: 'ms' });
    const recommendationEvidence = [...evidence, ...artifactEvidence];
    const recommendations = recommendationEvidence.length ? [{
        recommendationId: `recommendation:${input.subject.type}:${input.subject.id}`,
        kind: 'comparison',
        label: '建议将此证据加入 Stage 对比',
        evidence: recommendationEvidence,
        status: 'candidate',
    }] : [];
    return { classifications, metrics, recommendations };
}

export const analyticsProvider = {
    provenance: { mode: 'rule', name: 'pattern-restoration-profile', version: '1' },
    async analyze(input) { return buildAnalytics(input); },
};

// Compatibility export for existing lesson-local tests and integrations.
export const patternRestorationAnalyticsProvider = analyticsProvider;

export function toStageComparison(confirmedRecommendation) {
    if (confirmedRecommendation.status !== 'confirmed') throw new Error('recommendation-confirmation-required');
    return {
        contentType: 'core:student-comparison',
        payload: {
            recommendationId: confirmedRecommendation.recommendationId,
            evidence: structuredClone(confirmedRecommendation.evidence),
        },
    };
}
