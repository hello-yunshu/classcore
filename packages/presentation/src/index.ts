import { findPrivateIdentityViolations } from '@classroom/contracts';
/** Capability-layer contract. This package is NOT part of Foundation Core v0.1.2. */
export type PresentationPlayState = 'idle' | 'playing' | 'paused';
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
export type JsonRecord = {
    [key: string]: JsonValue;
};
export type PresentationDocument = JsonRecord | JsonValue[];
/** Engine-native bytes stay outside the JSON document envelope. */
export interface PresentationBinarySource {
    kind: 'bytes';
    mimeType: string;
    bytes: Uint8Array;
    sha256?: string;
}
export interface PresentationEngineDescriptor {
    engineId: string;
    engineVersion: string;
    documentFormatVersion: string;
}
export type ClassroomWidgetSemanticSelector = 'teacher-focus' | 'recommended-resource' | 'current-activity-summary' | 'selected-artifact' | 'selected-live-view' | 'student-comparison';
export interface ClassroomWidgetBinding {
    bindingId: string;
    widgetType: string;
    source: {
        type: 'semantic';
        selector: ClassroomWidgetSemanticSelector | string;
        parameters?: JsonRecord;
    };
    fallback?: {
        type: 'placeholder' | 'static-text' | 'hidden';
        text?: string | null;
    };
}
/** Authoring assets must be portable across classes; stable participant refs never belong in a deck binding. */
export function assertIdentityNeutralBinding(binding: ClassroomWidgetBinding): void {
    const violation = findPrivateIdentityViolations(binding, '$');
    if (!violation.length)
        return;
    const first = violation[0];
    if (first.kind === 'field')
        throw new Error(`identity-specific-binding-field:${first.path}`);
    throw new Error(`identity-specific-binding-reference:${first.path}`);
}
/**
 * Engine-native document stays opaque so web-ppt or a future engine can be swapped
 * without leaking their internal element schema into Classroom Runtime Foundation.
 */
export interface PresentationAsset<TDocument extends PresentationDocument = PresentationDocument> {
    presentationSchemaVersion: 1;
    deckId: string;
    title: string;
    engine: PresentationEngineDescriptor;
    document: TDocument;
    source?: PresentationBinarySource;
    classroomBindings: ClassroomWidgetBinding[];
    createdAt: string;
    updatedAt: string;
}
/** Canonical classroom synchronization state; independent from editor engine internals. */
export interface PresentationPlaybackState {
    sessionId: string;
    deckId: string;
    sceneId: string;
    step: number;
    playState: PresentationPlayState;
    revision: number;
}
export interface PresentationSceneDescriptor {
    sceneId: string;
    index: number;
    title?: string | null;
}
export interface PresentationRuntimeScene {
    sceneId: string;
    index: number;
    maxStep: number;
}
export interface PresentationRuntimeIndex {
    deckId: string;
    documentFormatVersion: string;
    generatedAt: string;
    scenes: PresentationRuntimeScene[];
}
export interface PresentationPlaybackStore {
    save(state: PresentationPlaybackState): Promise<void>;
    load(sessionId: string): Promise<PresentationPlaybackState | null>;
}
export class InMemoryPresentationPlaybackStore implements PresentationPlaybackStore {
    #states = new Map<string, PresentationPlaybackState>();
    async save(state: PresentationPlaybackState) { this.#states.set(state.sessionId, structuredClone(state)); }
    async load(sessionId: string) { const state = this.#states.get(sessionId); return state ? structuredClone(state) : null; }
}
export interface PresentationEngineCapabilities {
    createBlank: boolean;
    authoring: boolean;
    playback: boolean;
    stepAnimations: boolean;
    transitions: boolean;
    pptxImport: boolean;
    pptxExport: boolean;
    classroomCustomElements: boolean;
}
export interface PresentationEditorSession<TDocument extends PresentationDocument = PresentationDocument> {
    getAsset(): PresentationAsset<TDocument>;
    listScenes(): PresentationSceneDescriptor[];
    save(): Promise<PresentationAsset<TDocument>>;
    dispose(): Promise<void> | void;
}
export interface PresentationPlayerSession {
    getState(): PresentationPlaybackState | null;
    applyAuthoritativeState(state: PresentationPlaybackState): Promise<void> | void;
    goto?(sceneId: string, step?: number): Promise<void> | void;
    next?(): Promise<void> | void;
    previous?(): Promise<void> | void;
    nextStep?(): Promise<void> | void;
    finishCurrentSlideAnimations?(): Promise<void> | void;
    dispose(): Promise<void> | void;
}
export interface PresentationPlayerMountOptions {
    resolveWidget?: ClassroomWidgetResolver | null;
    context: ClassroomWidgetResolveContext;
}
/** Adapter boundary around web-ppt and future engine implementations. */
export interface PresentationEngineAdapter<TDocument extends PresentationDocument = PresentationDocument, TEditorTarget = unknown, TPlayerTarget = unknown> {
    readonly descriptor: PresentationEngineDescriptor;
    readonly capabilities: PresentationEngineCapabilities;
    createBlank(title: string): Promise<PresentationAsset<TDocument>>;
    validate(asset: PresentationAsset<TDocument>): Promise<{
        valid: boolean;
        errors: string[];
    }>;
    mountEditor(target: TEditorTarget, asset: PresentationAsset<TDocument>): Promise<PresentationEditorSession<TDocument>>;
    buildRuntimeIndex(asset: PresentationAsset<TDocument>): Promise<PresentationRuntimeIndex>;
    mountPlayer(target: TPlayerTarget, asset: PresentationAsset<TDocument>, options: PresentationPlayerMountOptions): Promise<PresentationPlayerSession>;
}
export type PresentationRuntimeSurface = 'teacher-runtime' | 'observer' | 'display';
export type WidgetProjectionKind = 'teacher-identifiable' | 'public-pseudonymous';
export interface ClassroomWidgetResolveContext {
    sessionId: string;
    activityId?: string | null;
    surface: PresentationRuntimeSurface;
    viewerParticipantId?: string | null;
}
export interface ClassroomWidgetProjection<T = unknown> {
    projection: WidgetProjectionKind;
    data: T;
}
export interface TeacherClassroomWidgetResolver {
    resolveTeacher(binding: ClassroomWidgetBinding, context: ClassroomWidgetResolveContext & {
        surface: 'teacher-runtime';
    }): Promise<ClassroomWidgetProjection>;
}
export interface PublicClassroomWidgetResolver {
    resolvePublic(binding: ClassroomWidgetBinding, context: ClassroomWidgetResolveContext & {
        surface: 'observer' | 'display';
    }): Promise<ClassroomWidgetProjection>;
}
/** Host-facing union. Public surfaces never receive a teacher-capable resolver method. */
export type ClassroomWidgetResolver = TeacherClassroomWidgetResolver | PublicClassroomWidgetResolver;
function assertNoPrivateIdentityInPublicWidget(value: unknown, path = '$'): void {
    const violation = findPrivateIdentityViolations(value, path)[0];
    if (!violation)
        return;
    if (violation.kind === 'field')
        throw new Error(`private-identity-field:${violation.path}`);
    throw new Error(`private-identity-reference:${violation.path}`);
}
/** Fail closed if a public presentation surface receives identifiable classroom data. */
export function assertWidgetProjectionCompatible(context: ClassroomWidgetResolveContext, result: ClassroomWidgetProjection): void {
    if (context.surface === 'observer' || context.surface === 'display') {
        if (result.projection !== 'public-pseudonymous')
            throw new Error('public-presentation-widget-must-be-pseudonymous');
        assertNoPrivateIdentityInPublicWidget(result.data);
    }
    if (context.surface === 'teacher-runtime' && result.projection !== 'teacher-identifiable' && result.projection !== 'public-pseudonymous')
        throw new Error('invalid-teacher-widget-projection');
}
export async function resolveClassroomWidgetSafely(binding: ClassroomWidgetBinding, context: ClassroomWidgetResolveContext, resolver: ClassroomWidgetResolver): Promise<ClassroomWidgetProjection> {
    let result: ClassroomWidgetProjection;
    if (context.surface === 'teacher-runtime') {
        if (!('resolveTeacher' in resolver))
            throw new Error('teacher-widget-resolver-required');
        result = await resolver.resolveTeacher(binding, { ...context, surface: 'teacher-runtime' });
    }
    else {
        if (!('resolvePublic' in resolver))
            throw new Error('public-widget-resolver-required');
        result = await resolver.resolvePublic(binding, { ...context, surface: context.surface });
    }
    assertWidgetProjectionCompatible(context, result);
    return result;
}
export type PresentationControlAction = 'goto' | 'set-step' | 'play' | 'pause';
export type PresentationControlIntent = {
    action: 'goto';
    sceneId: string;
    step?: number | null;
    expectedRevision: number;
} | {
    action: 'set-step';
    step: number;
    expectedRevision: number;
} | {
    action: 'play' | 'pause';
    expectedRevision: number;
};
/** Server applies this only after Runtime authorization (`presentation.control` + Controller Lease). */
export function assertPresentationStateExists(state: PresentationPlaybackState, index: PresentationRuntimeIndex): void {
    if (state.deckId !== index.deckId)
        throw new Error('presentation-deck-mismatch');
    const scene = index.scenes.find(item => item.sceneId === state.sceneId);
    if (!scene)
        throw new Error('presentation-scene-not-found');
    if (!Number.isInteger(state.step) || state.step < 0 || state.step > scene.maxStep)
        throw new Error('presentation-step-out-of-range');
}
/** Server-side safe control helper: revision + published runtime index validation. */
export function applyValidatedPresentationControl(current: PresentationPlaybackState, intent: PresentationControlIntent, index: PresentationRuntimeIndex): PresentationPlaybackState {
    assertPresentationStateExists(current, index);
    const next = applyPresentationControl(current, intent);
    assertPresentationStateExists(next, index);
    return next;
}
export function applyPresentationControl(current: PresentationPlaybackState, intent: PresentationControlIntent): PresentationPlaybackState {
    if (current.revision !== intent.expectedRevision)
        throw new Error('stale-revision');
    if (intent.action === 'goto')
        return updatePresentationState(current, { sceneId: intent.sceneId, step: intent.step ?? 0 }, intent.expectedRevision);
    if (intent.action === 'set-step')
        return updatePresentationState(current, { step: intent.step }, intent.expectedRevision);
    if (intent.action === 'play')
        return updatePresentationState(current, { playState: 'playing' }, intent.expectedRevision);
    return updatePresentationState(current, { playState: 'paused' }, intent.expectedRevision);
}
export function updatePresentationState(current: PresentationPlaybackState, patch: Partial<Pick<PresentationPlaybackState, 'sceneId' | 'step' | 'playState'>>, expectedRevision: number): PresentationPlaybackState {
    if (current.revision !== expectedRevision)
        throw new Error('stale-revision');
    const next = { ...current, ...patch, revision: current.revision + 1 };
    if (!next.sceneId)
        throw new Error('scene-required');
    if (!Number.isInteger(next.step) || next.step < 0)
        throw new Error('invalid-step');
    return next;
}
