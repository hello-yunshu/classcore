import type { AdviceViews, AnalyticsInput, AnalyticsResult, ProviderProvenance, RecommendationCandidate } from '@classroom/contracts';
import type { IntelligenceContext } from '@classroom/contracts';
export interface DiagnosisDraft {
    code: string;
    confidence: number;
    evidence: Record<string, unknown>[];
}
export interface InterventionDraft {
    needed: boolean;
    level: 0 | 1 | 2 | 3 | 4;
}
export interface DiagnosisProvider {
    readonly provenance: ProviderProvenance;
    diagnose(context: IntelligenceContext): Promise<DiagnosisDraft>;
}
export interface InterventionProvider {
    readonly provenance: ProviderProvenance;
    decide(context: IntelligenceContext, diagnosis: DiagnosisDraft): Promise<InterventionDraft>;
}
export interface AdviceProvider {
    readonly provenance: ProviderProvenance;
    render(context: IntelligenceContext, diagnosis: DiagnosisDraft, intervention: InterventionDraft): Promise<AdviceViews | null>;
}
export interface IntelligenceProviderBundle {
    diagnosis: DiagnosisProvider;
    intervention: InterventionProvider;
    advice: AdviceProvider;
}
export async function runIntelligence(context: IntelligenceContext, bundle: IntelligenceProviderBundle) {
    const diagnosis = await bundle.diagnosis.diagnose(context);
    const intervention = await bundle.intervention.decide(context, diagnosis);
    const advice = intervention.needed ? await bundle.advice.render(context, diagnosis, intervention) : null;
    return { diagnosis: { ...diagnosis, provider: bundle.diagnosis.provenance }, intervention: { ...intervention, provider: bundle.intervention.provenance }, advice: advice ? { views: advice, provider: bundle.advice.provenance } : null };
}

export interface AnalyticsProvider {
    readonly provenance: ProviderProvenance;
    analyze(input: AnalyticsInput): Promise<Pick<AnalyticsResult, 'classifications' | 'metrics' | 'recommendations'>>;
}
export interface AnalyticsRuntimeOptions {
    timeoutMs?: number;
    fallback?: AnalyticsProvider;
    idFactory?: () => string;
    clock?: () => string;
}

/** Generic analytics boundary. Provider failure is an empty enhancement, never a classroom-path failure. */
export async function runAnalytics(input: AnalyticsInput, provider: AnalyticsProvider, options: AnalyticsRuntimeOptions = {}): Promise<AnalyticsResult> {
    const timeoutMs = options.timeoutMs ?? 1500;
    const idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
    const clock = options.clock ?? (() => new Date().toISOString());
    let selected = provider;
    let result: Pick<AnalyticsResult, 'classifications' | 'metrics' | 'recommendations'>;
    try {
        result = await withTimeout(provider.analyze(input), timeoutMs);
    } catch {
        if (options.fallback) {
            selected = options.fallback;
            try { result = await withTimeout(options.fallback.analyze(input), timeoutMs); }
            catch { result = emptyAnalyticsResult(); }
        } else result = emptyAnalyticsResult();
    }
    return { resultId: `analytics:${idFactory()}`, sessionId: input.sessionId, activityId: input.activityId, subject: structuredClone(input.subject), classifications: structuredClone(result.classifications), metrics: structuredClone(result.metrics), recommendations: structuredClone(result.recommendations), provider: selected.provenance, createdAt: clock() };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('analytics-timeout')), timeoutMs);
        promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
}
function emptyAnalyticsResult(): Pick<AnalyticsResult, 'classifications' | 'metrics' | 'recommendations'> { return { classifications: [], metrics: [], recommendations: [] }; }

export class TeacherRecommendationGate {
    #pending = new Map<string, RecommendationCandidate>();
    propose(candidate: RecommendationCandidate): RecommendationCandidate {
        if (candidate.status !== 'candidate') throw new Error('recommendation-must-start-as-candidate');
        this.#pending.set(candidate.recommendationId, structuredClone(candidate));
        return structuredClone(candidate);
    }
    confirm(recommendationId: string): RecommendationCandidate {
        const candidate = this.#pending.get(recommendationId);
        if (!candidate) throw new Error('recommendation-not-found');
        const confirmed = { ...candidate, status: 'confirmed' as const };
        this.#pending.delete(recommendationId);
        return confirmed;
    }
    dismiss(recommendationId: string): RecommendationCandidate {
        const candidate = this.#pending.get(recommendationId);
        if (!candidate) throw new Error('recommendation-not-found');
        const dismissed = { ...candidate, status: 'dismissed' as const };
        this.#pending.delete(recommendationId);
        return dismissed;
    }
}
