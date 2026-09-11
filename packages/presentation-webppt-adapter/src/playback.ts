import { parse } from '@web-ppt/core';
import { Viewer } from '@web-ppt/viewer-core';
import type {
    PresentationAsset,
    PresentationBinarySource,
    PresentationEngineDescriptor,
    PresentationPlaybackState,
    PresentationPlayerMountOptions,
    PresentationPlayerSession,
} from '@classroom/presentation';

const FORMAT = 'web-ppt-ooxml-v1';
const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export interface WebPptPlaybackDocument {
    readonly [key: string]: string;
    format: typeof FORMAT;
    idPrefix: string;
}

export type WebPptPlaybackAsset = PresentationAsset<WebPptPlaybackDocument>;

export const WEB_PPT_PLAYBACK_DESCRIPTOR: PresentationEngineDescriptor = Object.freeze({
    engineId: 'web-ppt',
    engineVersion: '0.5.0-beta.2',
    documentFormatVersion: FORMAT,
});

function sourceOf(asset: WebPptPlaybackAsset): Uint8Array {
    const source: PresentationBinarySource | undefined = asset.source;
    if (!source || source.kind !== 'bytes' || source.bytes.byteLength === 0)
        throw new Error('web-ppt-binary-source-required');
    return source.bytes;
}

function sceneIdFor(idPrefix: string, index: number): string {
    // web-ppt's editor uses this stable id scheme when opening a deck with an
    // explicit prefix. Playback can reproduce it without loading edit-core.
    return `${idPrefix}s${index + 1}`;
}

function animationBatches(steps: readonly { trigger?: string }[]): number {
    return steps.reduce((count, step, index) => index === 0 || step.trigger === 'click' ? count + 1 : count, 0);
}

export async function createWebPptPlaybackAssetFromBytes(title: string, bytes: Uint8Array, idPrefix: string, deckId: string): Promise<WebPptPlaybackAsset> {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
    const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    return {
        presentationSchemaVersion: 1,
        deckId,
        title: title || '未命名公开课',
        engine: WEB_PPT_PLAYBACK_DESCRIPTOR,
        document: { format: FORMAT, idPrefix, deckId },
        source: { kind: 'bytes', mimeType: MIME, bytes: new Uint8Array(bytes), sha256 },
        classroomBindings: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

export class WebPptPlaybackEngineAdapter {
    async mountPlayer(target: HTMLElement, asset: WebPptPlaybackAsset, _options: PresentationPlayerMountOptions): Promise<PresentationPlayerSession> {
        if (asset.engine.engineId !== WEB_PPT_PLAYBACK_DESCRIPTOR.engineId || asset.document.format !== FORMAT)
            throw new Error('web-ppt-playback-metadata-required');
        const presentation = await parse(new Uint8Array(sourceOf(asset)), { lazy: false });
        const sceneIds = presentation.slides.map((_slide: unknown, index: number) => sceneIdFor(asset.document.idPrefix, index));
        const viewer = new Viewer(target, presentation, { animate: true, textMode: 'svg' });
        let playState: PresentationPlaybackState['playState'] = 'idle';
        let disposed = false;
        const currentState = (): PresentationPlaybackState => ({
            sessionId: 'display',
            deckId: asset.deckId,
            sceneId: sceneIds[viewer.index] ?? sceneIds[0],
            step: viewer.animationDone,
            playState,
            revision: 0,
        });
        const ensureLive = (): void => {
            if (disposed) throw new Error('presentation-player-disposed');
        };
        const apply = (state: PresentationPlaybackState): void => {
            if (state.deckId !== asset.deckId) throw new Error('presentation-deck-mismatch');
            const index = sceneIds.indexOf(state.sceneId);
            if (index < 0) throw new Error('presentation-scene-not-found');
            viewer.goTo(index, index >= viewer.index ? 'forward' : 'backward');
            viewer.setAnimate(true);
            viewer.finishAnimations();
            if (state.step < viewer.animationTotal) {
                viewer.goTo(index, 'backward');
                for (let step = 0; step < state.step; step += 1) viewer.playNextAnimation();
            }
            playState = state.playState;
        };
        return {
            getState: currentState,
            applyAuthoritativeState: state => { ensureLive(); apply(state); },
            dispose: () => {
                if (disposed) return;
                disposed = true;
                viewer.destroy();
                presentation.dispose?.();
            },
        };
    }

    async validate(asset: WebPptPlaybackAsset): Promise<{ valid: boolean; errors: string[] }> {
        try {
            if (asset.document.format !== FORMAT) throw new Error('web-ppt-document-metadata-required');
            const presentation = await parse(new Uint8Array(sourceOf(asset)), { lazy: false });
            presentation.dispose?.();
            return { valid: true, errors: [] };
        }
        catch (error) {
            return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
        }
    }
}

export { animationBatches };
