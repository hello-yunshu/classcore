import { parse } from '@web-ppt/core';
import { Editor, querySlideAnimations, type EditAnimationStep } from '@web-ppt/edit-core';
import { createWebPptAdapter, openEditor, type EditorSession, type WebPptAdapter } from '@web-ppt/editor';
import { Viewer } from '@web-ppt/viewer-core';
import type {
    PresentationAsset,
    PresentationBinarySource,
    PresentationEditorSession,
    PresentationEngineAdapter,
    PresentationEngineCapabilities,
    PresentationEngineDescriptor,
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
                scenes: session.editor.doc.slideOrder.map((sceneId: string, index: number) => ({
                    sceneId,
                    index,
                    maxStep: countAnimationBatches(querySlideAnimations(session.editor.doc, [sceneId]).value),
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
        const apply = (state: PresentationPlaybackState): void => {
            if (state.deckId !== asset.deckId)
                throw new Error('presentation-deck-mismatch');
            const index = sceneIds.indexOf(state.sceneId);
            if (index < 0)
                throw new Error('presentation-scene-not-found');
            viewer.goTo(index, index >= viewer.index ? 'forward' : 'backward');
            viewer.setAnimate(true);
            viewer.finishAnimations();
            if (state.step < viewer.animationTotal) {
                viewer.goTo(index, 'backward');
                for (let step = 0; step < state.step; step += 1)
                    viewer.playNextAnimation();
            }
            playState = state.playState;
        };
        const ensureLive = (): void => {
            if (disposed)
                throw new Error('presentation-player-disposed');
        };
        return {
            getState: currentState,
            applyAuthoritativeState: async state => { ensureLive(); apply(state); },
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

export { Editor };
export { createWebPptAdapter };
export type { WebPptAdapter };
