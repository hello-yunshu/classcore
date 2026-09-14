import { collectFonts, parse, type FontUsage } from '@web-ppt/core';
import { Editor, querySlideAnimations, querySlideHidden, type EditAnimationStep } from '@web-ppt/edit-core';
import { createWebPptAdapter, openEditor, type EditorSession, type WebPptAdapter } from '@web-ppt/editor';
import { Viewer } from '@web-ppt/viewer-core';
import type {
    PresentationAsset,
    PresentationBinarySource,
    PresentationEditorSession,
    PresentationEngineAdapter,
    PresentationEngineCapabilities,
    PresentationEngineDescriptor,
    PresentationCompatibilityReport,
    PresentationCompatibilityIssue,
    PresentationPlayerMountOptions,
    PresentationPlayerSession,
    PresentationPlaybackState,
    PresentationRuntimeIndex,
    PresentationSceneDescriptor,
} from '@classroom/presentation';
import { sha256Hex } from './sha256.js';

const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const ENGINE_VERSION = '0.5.0-beta.2';
const FORMAT = 'web-ppt-ooxml-v1';

export interface WebPptDocumentMetadata {
    readonly [key: string]: string;
    format: typeof FORMAT;
    /** web-ppt IDs are stable only when the same prefix is supplied on reopen. */
    idPrefix: string;
}

export type WebPptPresentationAsset = PresentationAsset<WebPptDocumentMetadata>;
export type BlankTemplateLoader = () => Promise<Uint8Array>;
export interface WebPptCompatibilityOptions {
    /** Optional host font inventory; omission is intentionally NOT_EVALUATED. */
    availableFonts?: readonly string[];
    /** Source-family to bundled approximate-family substitutions. */
    fontSubstitutions?: Readonly<Record<string, string>>;
}

export const WEB_PPT_DESCRIPTOR: PresentationEngineDescriptor = Object.freeze({
    engineId: 'web-ppt',
    engineVersion: ENGINE_VERSION,
    documentFormatVersion: FORMAT,
});

export const WEB_PPT_CAPABILITIES: PresentationEngineCapabilities = Object.freeze({
    createBlank: true,
    authoring: true,
    playback: true,
    stepAnimations: true,
    transitions: true,
    pptxImport: true,
    pptxExport: true,
    classroomCustomElements: false,
});

function cloneBytes(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(bytes);
}

function randomIdPrefix(): string {
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return `classcore-${suffix.replace(/[^a-zA-Z0-9-]/g, '')}`;
}

function assetDocument(asset: WebPptPresentationAsset): WebPptDocumentMetadata {
    if (asset.document?.format !== FORMAT || !asset.document.idPrefix)
        throw new Error('web-ppt-document-metadata-required');
    return asset.document;
}

function sourceOf(asset: WebPptPresentationAsset): Uint8Array {
    if (!asset.source || asset.source.kind !== 'bytes' || asset.source.bytes.byteLength === 0)
        throw new Error('web-ppt-binary-source-required');
    return asset.source.bytes;
}

function sceneDescriptors(session: EditorSession): PresentationSceneDescriptor[] {
    return session.editor.doc.slideOrder.map((sceneId: string, index: number) => ({ sceneId, index }));
}

function countAnimationBatches(steps: readonly EditAnimationStep[]): number {
    let batches = 0;
    for (const [index, step] of steps.entries()) {
        if (index === 0 || step.trigger === 'click')
            batches += 1;
    }
    return batches;
}

function createAsset(title: string, bytes: Uint8Array, idPrefix: string, sha256?: string): WebPptPresentationAsset {
    const source: PresentationBinarySource = { kind: 'bytes', mimeType: MIME, bytes: cloneBytes(bytes), sha256 };
    return {
        presentationSchemaVersion: 1,
        deckId: `deck-${idPrefix}`,
        title: title || '未命名公开课',
        engine: WEB_PPT_DESCRIPTOR,
        document: { format: FORMAT, idPrefix },
        source,
        classroomBindings: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

export class WebPptPresentationEngineAdapter implements PresentationEngineAdapter<WebPptDocumentMetadata, HTMLElement, HTMLElement> {
    readonly descriptor = WEB_PPT_DESCRIPTOR;
    readonly capabilities = WEB_PPT_CAPABILITIES;
    private readonly loadBlankTemplate: BlankTemplateLoader;

    constructor(loadBlankTemplate: BlankTemplateLoader) {
        this.loadBlankTemplate = loadBlankTemplate;
    }

    async createBlank(title: string): Promise<WebPptPresentationAsset> {
        const bytes = await this.loadBlankTemplate();
        return createAsset(title, bytes, randomIdPrefix(), await sha256Hex(bytes));
    }

    async validate(asset: WebPptPresentationAsset): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];
        try {
            const metadata = assetDocument(asset);
            const bytes = sourceOf(asset);
            if (asset.engine.engineId !== WEB_PPT_DESCRIPTOR.engineId)
                errors.push('web-ppt-engine-mismatch');
            if (asset.source?.sha256 && asset.source.sha256 !== await sha256Hex(bytes))
                errors.push('web-ppt-source-fingerprint-mismatch');
            const presentation = await parse(bytes, { lazy: false });
            if (presentation.slides.length === 0)
                errors.push('web-ppt-empty-deck');
            presentation.dispose?.();
            if (!metadata.idPrefix)
                errors.push('web-ppt-id-prefix-required');
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
        return { valid: errors.length === 0, errors };
    }

    async mountEditor(target: HTMLElement, asset: WebPptPresentationAsset): Promise<PresentationEditorSession<WebPptDocumentMetadata>> {
        const metadata = assetDocument(asset);
        const session = await openEditor(cloneBytes(sourceOf(asset)), { idPrefix: metadata.idPrefix });
        const view = session.mount(target, { mode: 'edit', textMode: 'svg' });
        return {
            getAsset: () => ({ ...asset, source: { ...asset.source!, bytes: cloneBytes(asset.source!.bytes) }, updatedAt: new Date().toISOString() }),
            listScenes: () => sceneDescriptors(session),
            save: async () => {
                const bytes = await session.editor.save();
                return { ...asset, source: { kind: 'bytes', mimeType: MIME, bytes, sha256: await sha256Hex(bytes) }, updatedAt: new Date().toISOString() };
            },
            dispose: () => {
                view.destroy();
                session.dispose();
            },
        };
    }

    async buildRuntimeIndex(asset: WebPptPresentationAsset): Promise<PresentationRuntimeIndex> {
        const metadata = assetDocument(asset);
        const session = await openEditor(cloneBytes(sourceOf(asset)), { idPrefix: metadata.idPrefix });
        try {
            return {
                deckId: asset.deckId,
                documentFormatVersion: FORMAT,
                generatedAt: new Date().toISOString(),
                width: session.editor.doc.meta.width,
                height: session.editor.doc.meta.height,
                scenes: session.editor.doc.slideOrder.map((sceneId: string, index: number) => ({
                    sceneId,
                    index,
                    maxStep: countAnimationBatches(querySlideAnimations(session.editor.doc, [sceneId]).value),
                    hidden: querySlideHidden(session.editor.doc, [sceneId]).value,
                    autoAdvanceMs: session.editor.doc.slides[sceneId]?.src.transition?.advanceAfterMs ?? null,
                })),
            };
        }
        finally {
            session.dispose();
        }
    }

    /**
     * Render a strip of read-only thumbnails from one parsed presentation.
     * A Studio refresh may contain dozens of slides; mounting one full parser
     * per slide needlessly multiplies OOXML parse cost and leaks lifecycle
     * pressure into the editor session.
     */
    async mountThumbnailViews(targets: ReadonlyMap<string, HTMLElement>, asset: WebPptPresentationAsset): Promise<Map<string, PresentationPlayerSession>> {
        const metadata = assetDocument(asset);
        const editorSession = await openEditor(cloneBytes(sourceOf(asset)), { idPrefix: metadata.idPrefix });
        const sceneIds = [...editorSession.editor.doc.slideOrder];
        editorSession.dispose();
        const presentation = await parse(cloneBytes(sourceOf(asset)), { lazy: false });
        if (targets.size === 0) {
            presentation.dispose?.();
            return new Map();
        }
        let disposedCount = 0;
        const sessions = new Map<string, PresentationPlayerSession>();
        for (const [sceneId, target] of targets) {
            const index = sceneIds.indexOf(sceneId);
            if (index < 0) continue;
            const viewer = new Viewer(target, presentation, { animate: false, textMode: 'svg' });
            viewer.goTo(index, 'forward');
            let disposed = false;
            sessions.set(sceneId, {
                getState: () => ({ sessionId: 'thumbnail', deckId: asset.deckId, sceneId, step: 0, playState: 'idle', revision: 0 }),
                applyAuthoritativeState: state => {
                    if (state.deckId !== asset.deckId) throw new Error('presentation-deck-mismatch');
                    const nextIndex = sceneIds.indexOf(state.sceneId);
                    if (nextIndex < 0) throw new Error('presentation-scene-not-found');
                    viewer.goTo(nextIndex, 'forward');
                },
                dispose: () => {
                    if (disposed) return;
                    disposed = true;
                    viewer.destroy();
                    disposedCount += 1;
                    if (disposedCount === sessions.size) presentation.dispose?.();
                },
            });
        }
        return sessions;
    }

    async mountPlayer(target: HTMLElement, asset: WebPptPresentationAsset, _options: PresentationPlayerMountOptions): Promise<PresentationPlayerSession> {
        const metadata = assetDocument(asset);
        const editorSession = await openEditor(cloneBytes(sourceOf(asset)), { idPrefix: metadata.idPrefix });
        const sceneIds = [...editorSession.editor.doc.slideOrder];
        editorSession.dispose();
        const presentation = await parse(cloneBytes(sourceOf(asset)), { lazy: false });
        const viewer = new Viewer(target, presentation, { animate: true, textMode: 'svg' });
        let playState: PresentationPlaybackState['playState'] = 'idle';
        let disposed = false;
        const currentState = (): PresentationPlaybackState => ({
            sessionId: 'local-preview',
            deckId: asset.deckId,
            sceneId: sceneIds[viewer.index] ?? sceneIds[0],
            step: viewer.animationDone,
            playState,
            revision: 0,
        });
        const seekTo = (sceneId: string, step: number, mode: 'silent' | 'live' = 'silent'): void => {
            if (!Number.isInteger(step) || step < 0) throw new Error('presentation-step-out-of-range');
            const index = sceneIds.indexOf(sceneId);
            if (index < 0) throw new Error('presentation-scene-not-found');
            if (mode === 'live' && index === viewer.index && step === viewer.animationDone + 1 && viewer.playNextAnimation()) {
                return;
            }
            // The upstream viewer intentionally makes same-slide goTo a no-op.
            // Reset its state machine while the host is hidden, then reveal only
            // the requested visual state. This makes recovery deterministic for
            // one-slide decks as well as multi-slide decks.
            const previousVisibility = target.style.visibility;
            target.style.visibility = 'hidden';
            try {
                viewer.setAnimate(false);
                if (index !== viewer.index) viewer.goTo(index, 'backward');
                viewer.setAnimate(true);
                for (let cursor = 0; cursor < step; cursor += 1) {
                    if (!viewer.playNextAnimation()) throw new Error('presentation-step-out-of-range');
                }
            }
            finally {
                target.style.visibility = previousVisibility;
            }
        };
        const apply = (state: PresentationPlaybackState): void => {
            if (state.deckId !== asset.deckId)
                throw new Error('presentation-deck-mismatch');
            const index = sceneIds.indexOf(state.sceneId);
            if (index < 0)
                throw new Error('presentation-scene-not-found');
            seekTo(state.sceneId, state.step, 'silent');
            playState = state.playState;
        };
        const ensureLive = (): void => {
            if (disposed)
                throw new Error('presentation-player-disposed');
        };
        return {
            getState: currentState,
            applyAuthoritativeState: async state => { ensureLive(); apply(state); },
            seekTo: (sceneId, step = 0, mode = 'silent') => { ensureLive(); seekTo(sceneId, step, mode); },
            goto: (sceneId, step = 0) => { ensureLive(); apply({ ...currentState(), sceneId, step }); },
            next: () => { ensureLive(); viewer.next(); playState = 'playing'; },
            previous: () => { ensureLive(); viewer.prev(); playState = 'idle'; },
            nextStep: () => { ensureLive(); if (!viewer.playNextAnimation()) viewer.next(); playState = 'playing'; },
            finishCurrentSlideAnimations: () => { ensureLive(); viewer.finishAnimations(); playState = 'idle'; },
            dispose: () => {
                if (disposed)
                    return;
                disposed = true;
                viewer.destroy();
                presentation.dispose?.();
            },
        };
    }
}

export function createWebPptAssetFromBytes(title: string, bytes: Uint8Array, idPrefix = randomIdPrefix()): Promise<WebPptPresentationAsset> {
    return sha256Hex(bytes).then(sha256 => createAsset(title, bytes, idPrefix, sha256));
}

export function isWebPptAsset(asset: PresentationAsset): asset is WebPptPresentationAsset {
    return asset.engine.engineId === WEB_PPT_DESCRIPTOR.engineId && asset.document && !Array.isArray(asset.document) && asset.document.format === FORMAT;
}

const COMMON_TRANSITIONS = new Set(['none', 'fade', 'cut', 'push', 'pull', 'cover', 'wipe', 'split', 'zoom']);

function walkElements(elements: readonly any[], visit: (element: any) => void): void {
    for (const element of elements) {
        visit(element);
        if (element.kind === 'group') walkElements(element.children ?? [], visit);
    }
}

/**
 * Conservative, source-backed preflight. A successful parse is not promoted to
 * visual compatibility: host font inventory and PowerPoint screenshot corpus
 * evidence remain explicit inputs to the report.
 */
export async function buildWebPptCompatibilityReport(asset: WebPptPresentationAsset, options: WebPptCompatibilityOptions = {}): Promise<PresentationCompatibilityReport> {
    const fingerprint = asset.source?.sha256 ?? await sha256Hex(sourceOf(asset));
    const issues: PresentationCompatibilityIssue[] = [];
    const add = (issue: PresentationCompatibilityIssue): void => { issues.push(issue); };
    try {
        const presentation = await parse(new Uint8Array(sourceOf(asset)), { lazy: false });
        add({ severity: 'info', capability: 'parse', fidelity: 'SUPPORTED', detail: `已解析 ${presentation.slides.length} 页 PPTX` });
        add({ severity: 'info', capability: 'static-render', fidelity: 'SUPPORTED', detail: '使用 web-ppt 唯一静态渲染路径；PowerPoint 参考截图差异尚未评估' });

        const fonts = collectFonts(presentation.slides);
        const available = options.availableFonts?.map(font => font.trim().toLowerCase());
        const substitutions = new Map<string, string>();
        for (const [source, replacement] of Object.entries(options.fontSubstitutions ?? {})) {
            const normalizedSource = source.trim().toLowerCase();
            const normalizedReplacement = replacement.trim();
            if (normalizedSource && normalizedReplacement) substitutions.set(normalizedSource, normalizedReplacement);
        }
        for (const font of fonts as FontUsage[]) {
            const known = available?.includes(font.family.trim().toLowerCase());
            const replacement = substitutions.get(font.family.trim().toLowerCase());
            add({
                severity: known === true ? 'info' : 'warning',
                capability: 'font',
                fidelity: known === true ? 'SUPPORTED' : replacement ? 'APPROXIMATED' : 'NOT_EVALUATED',
                detail: known === true
                    ? `使用字体「${font.family}」；Display 字体清单已确认可用`
                    : replacement
                        ? `使用字体「${font.family}」；Display 随包字体「${replacement}」作为近似替代`
                        : available == null
                            ? `使用字体「${font.family}」，当前 Display 环境尚未提供字体清单`
                            : `使用字体「${font.family}」，当前 Display 字体清单未确认可用`,
            });
        }
        const embedded = new Set((presentation.embeddedFonts ?? []).map((font: { family: string }) => font.family.trim().toLowerCase()));
        if (embedded.size) add({ severity: 'info', capability: 'font', fidelity: 'SUPPORTED', detail: `检测到 ${embedded.size} 个嵌入字体家族` });

        presentation.slides.forEach((slide: any, slideIndex: number) => {
            const transition = slide.transition;
            if (transition) add({
                severity: COMMON_TRANSITIONS.has(transition.type) ? 'info' : 'warning',
                capability: 'transition',
                fidelity: COMMON_TRANSITIONS.has(transition.type) ? 'SUPPORTED' : 'APPROXIMATED',
                slideIndex,
                detail: `第 ${slideIndex + 1} 页切换：${transition.type}`,
            });
            if (slide.animations?.length) add({ severity: 'info', capability: 'animation', fidelity: 'SUPPORTED', slideIndex, detail: `第 ${slideIndex + 1} 页包含 ${slide.animations.length} 个动画步骤；课堂 step 由 RuntimeIndex 权威控制` });
            walkElements(slide.elements, element => {
                if (element.kind === 'unsupported') add({ severity: 'blocker', capability: 'unknown', fidelity: 'UNSUPPORTED', slideIndex, detail: `第 ${slideIndex + 1} 页包含未支持元素：${element.label}` });
                if (element.media) add({ severity: 'warning', capability: 'media', fidelity: 'NOT_EVALUATED', slideIndex, detail: `第 ${slideIndex + 1} 页包含${element.media.kind === 'video' ? '视频' : '音频'}；课堂自动播放与离线策略尚未验证` });
                if (element.kind === 'image' && element.src?.startsWith('http')) add({ severity: 'warning', capability: 'image', fidelity: 'NOT_EVALUATED', slideIndex, detail: `第 ${slideIndex + 1} 页包含外部图片资源` });
                if (element.kind === 'shape' && element.text?.paragraphs?.some((paragraph: any) => paragraph.runs?.some((run: any) => typeof run.link === 'string'))) add({ severity: 'warning', capability: 'hyperlink', fidelity: 'NOT_EVALUATED', slideIndex, detail: `第 ${slideIndex + 1} 页包含文本链接；课堂网络策略尚未验证` });
            });
        });
        presentation.dispose?.();
    }
    catch (error) {
        add({ severity: 'blocker', capability: 'parse', fidelity: 'UNSUPPORTED', detail: error instanceof Error ? error.message : String(error) });
    }
    const blockerCount = issues.filter(issue => issue.severity === 'blocker').length;
    const warningCount = issues.filter(issue => issue.severity === 'warning').length;
    return {
        version: 1,
        assetId: asset.source?.sha256 ?? fingerprint,
        fingerprint,
        engineVersion: asset.engine.engineVersion,
        status: blockerCount ? 'blocked' : warningCount ? 'warnings' : 'ready',
        issues,
        createdAt: new Date().toISOString(),
    };
}

export { Editor };
export { createWebPptAdapter };
export type { WebPptAdapter };
