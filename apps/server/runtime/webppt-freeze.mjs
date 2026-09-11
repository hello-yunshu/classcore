import { querySlideAnimations } from '@web-ppt/edit-core';
import { openEditor } from '@web-ppt/editor';

export const WEB_PPT_ENGINE = Object.freeze({
    engineId: 'web-ppt',
    engineVersion: '0.5.0-beta.2',
    documentFormatVersion: 'web-ppt-ooxml-v1',
});

/** Build a classroom RuntimeIndex from authoritative frozen Draft bytes. */
export async function buildTrustedWebPptRuntimeIndex(bytes, { idPrefix, deckId }) {
    if (!idPrefix || !deckId) throw new Error('web-ppt-freeze-metadata-required');
    const session = await openEditor(new Uint8Array(bytes), { idPrefix });
    try {
        const scenes = session.editor.doc.slideOrder.map((sceneId, index) => ({
            sceneId,
            index,
            maxStep: querySlideAnimations(session.editor.doc, [sceneId]).value
                .reduce((batches, step, stepIndex) => stepIndex === 0 || step.trigger === 'click' ? batches + 1 : batches, 0),
        }));
        return {
            deckId,
            documentFormatVersion: WEB_PPT_ENGINE.documentFormatVersion,
            generatedAt: new Date().toISOString(),
            scenes,
        };
    }
    finally {
        session.dispose();
    }
}
