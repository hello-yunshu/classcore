import type { AdviceViews, IntelligenceContext, ProviderProvenance } from '@classroom/contracts';
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

