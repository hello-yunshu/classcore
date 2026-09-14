import { collectFonts, parse } from '@web-ppt/core';
import { querySlideAnimations, querySlideHidden } from '@web-ppt/edit-core';
import { openEditor } from '@web-ppt/editor';

export const WEB_PPT_ENGINE = Object.freeze({
    engineId: 'web-ppt',
    engineVersion: '0.5.0-beta.2',
    documentFormatVersion: 'web-ppt-ooxml-v1',
});

/** Conservative server-side preflight; browser supplied reports are never trusted. */
export async function buildTrustedWebPptCompatibilityReport(bytes, { assetId, fingerprint, engineVersion = WEB_PPT_ENGINE.engineVersion, availableFonts = null, fontSubstitutions = {} } = {}) {
    const issues = [];
    try {
        const presentation = await parse(new Uint8Array(bytes), { lazy: false });
        issues.push({ severity: 'info', capability: 'parse', fidelity: 'SUPPORTED', detail: `已解析 ${presentation.slides.length} 页 PPTX` });
        issues.push({ severity: 'info', capability: 'static-render', fidelity: 'SUPPORTED', detail: '使用 web-ppt 静态渲染路径；PowerPoint 参考截图尚未提供' });
        const knownFonts = Array.isArray(availableFonts) ? new Set(availableFonts.map(font => String(font).trim().toLowerCase()).filter(Boolean)) : null;
        const substitutions = new Map(Object.entries(fontSubstitutions).map(([source, replacement]) => [source.trim().toLowerCase(), String(replacement).trim()]).filter(([source, replacement]) => source && replacement));
        for (const font of collectFonts(presentation.slides)) {
            const family = font.family.trim();
            const known = knownFonts?.has(family.toLowerCase()) === true;
            const replacement = substitutions.get(family.toLowerCase());
            issues.push({
                severity: known ? 'info' : 'warning',
                capability: 'font',
                fidelity: known ? 'SUPPORTED' : replacement ? 'APPROXIMATED' : 'NOT_EVALUATED',
                detail: known
                    ? `使用字体「${family}」；Display 字体清单已确认可用`
                    : replacement
                        ? `使用字体「${family}」；Display 随包字体「${replacement}」作为近似替代`
                        : `使用字体「${family}」，Display 字体${knownFonts ? '清单未确认可用' : '清单尚未提供'}`,
            });
        }
        presentation.slides.forEach((slide, slideIndex) => {
            if (slide.transition && !new Set(['none', 'fade', 'cut', 'push', 'pull', 'cover', 'wipe', 'split', 'zoom']).has(slide.transition.type))
                issues.push({ severity: 'warning', capability: 'transition', fidelity: 'APPROXIMATED', slideIndex, detail: `第 ${slideIndex + 1} 页切换 ${slide.transition.type} 仅作近似` });
            const visit = elements => elements.forEach(element => {
                if (element.kind === 'unsupported') issues.push({ severity: 'blocker', capability: 'unknown', fidelity: 'UNSUPPORTED', slideIndex, detail: `第 ${slideIndex + 1} 页包含未支持元素：${element.label}` });
                if (element.media) issues.push({ severity: 'warning', capability: 'media', fidelity: 'NOT_EVALUATED', slideIndex, detail: `第 ${slideIndex + 1} 页媒体的离线播放尚未验证` });
                if (element.kind === 'group') visit(element.children ?? []);
            });
            visit(slide.elements);
        });
        presentation.dispose?.();
    } catch (error) {
        issues.push({ severity: 'blocker', capability: 'parse', fidelity: 'UNSUPPORTED', detail: error instanceof Error ? error.message : String(error) });
    }
    const blockerCount = issues.filter(issue => issue.severity === 'blocker').length;
    return {
        version: 1,
        assetId: assetId ?? fingerprint,
        fingerprint,
        engineVersion,
        status: blockerCount ? 'blocked' : issues.some(issue => issue.severity === 'warning') ? 'warnings' : 'ready',
        issues,
        createdAt: new Date().toISOString(),
    };
}

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
            hidden: querySlideHidden(session.editor.doc, [sceneId]).value,
            autoAdvanceMs: session.editor.doc.slides[sceneId]?.src.transition?.advanceAfterMs ?? null,
        }));
        return {
            deckId,
            documentFormatVersion: WEB_PPT_ENGINE.documentFormatVersion,
            generatedAt: new Date().toISOString(),
            width: session.editor.doc.meta.width,
            height: session.editor.doc.meta.height,
            scenes,
        };
    }
    finally {
        session.dispose();
    }
}
