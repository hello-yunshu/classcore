import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';
import { parse } from '@web-ppt/core';
import { openEditor } from '@web-ppt/editor';
import { PresentationState } from '@web-ppt/viewer-core';
import { WebPptPresentationEngineAdapter, createWebPptAssetFromBytes } from '../../packages/presentation-webppt-adapter/src/index.ts';

const evidenceFile = process.argv[2];
if (!evidenceFile) {
    console.error('presentation-runtime verifier requires evidence JSON');
    process.exit(2);
}

const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
const requiredChecks = new Set([
    'node-core-create-edit-save-reopen',
    'runtime-index-and-animation-batches',
    'authoritative-playback-state',
    'browser-mount-dispose-reopen',
    'offline-local-template-and-assets',
]);
if (evidence.schemaVersion !== 1 || evidence.requirementId !== 'presentation-runtime' || evidence.status !== 'verified')
    throw new Error('presentation-runtime evidence must be verified schema v1');
if (!Array.isArray(evidence.checks) || evidence.checks.length !== requiredChecks.size)
    throw new Error('presentation-runtime evidence must contain the exact check set');
for (const check of evidence.checks) {
    if (!requiredChecks.has(check.id) || check.passed !== true)
        throw new Error(`presentation-runtime evidence check failed or unknown: ${check.id ?? '<missing>'}`);
}

async function makeTemplate() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-d7-presentation-'));
    const filename = path.join(directory, 'template.pptx');
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    const slide = pptx.addSlide();
    slide.background = { color: 'F7F4EE' };
    slide.addText('ClassCore Presentation Gate', { x: 1, y: 1, w: 7, h: 0.5, fontSize: 24, color: '24324B' });
    await pptx.writeFile({ fileName: filename });
    const bytes = new Uint8Array(fs.readFileSync(filename));
    fs.rmSync(directory, { recursive: true, force: true });
    return bytes;
}

const template = await makeTemplate();
const adapter = new WebPptPresentationEngineAdapter(async () => template);
const asset = await adapter.createBlank('D7 gate deck');
assert.equal((await adapter.validate(asset)).valid, true);
const initialIndex = await adapter.buildRuntimeIndex(asset);
assert.equal(initialIndex.scenes.length, 1);

const editor = await openEditor(asset.source.bytes, { idPrefix: asset.document.idPrefix });
const sceneId = editor.editor.doc.slideOrder[0];
editor.editor.exec({ type: 'AddShape', slideId: sceneId, preset: 'roundRect', rect: { x: 280, y: 180, w: 240, h: 120 } });
const elementId = editor.editor.selection.kind === 'elements' ? editor.editor.selection.ids[0] : null;
assert.ok(elementId);
editor.editor.exec({ type: 'SetAnimations', slideId: sceneId, steps: [{ target: elementId, kind: 'entrance', effect: 'fade', trigger: 'click', delayMs: 0, durationMs: 300 }] });
const savedBytes = await editor.editor.save();
editor.dispose();

const savedSource = await createWebPptAssetFromBytes(asset.title, savedBytes, asset.document.idPrefix);
const savedAsset = { ...asset, source: savedSource.source, updatedAt: new Date().toISOString() };
assert.equal((await adapter.validate(savedAsset)).valid, true);
const runtimeIndex = await adapter.buildRuntimeIndex(savedAsset);
assert.equal(runtimeIndex.scenes[0].sceneId, sceneId);
assert.equal(runtimeIndex.scenes[0].maxStep, 1);

const reopened = await openEditor(savedBytes, { idPrefix: asset.document.idPrefix });
assert.equal(reopened.editor.doc.slideOrder[0], sceneId);
reopened.dispose();
const parsed = await parse(savedBytes, { lazy: false });
const playback = new PresentationState(parsed, { animate: true });
assert.equal(playback.animationTotal, 1);
assert.equal(Boolean(playback.playNextAnimation()), true);
assert.equal(playback.animationDone, 1);
playback.destroy();
parsed.dispose?.();

console.log(JSON.stringify({
    verifier: 'presentation-runtime',
    engine: asset.engine,
    deckId: asset.deckId,
    sceneId,
    runtimeScenes: runtimeIndex.scenes.length,
    maxStep: runtimeIndex.scenes[0].maxStep,
    publishedFingerprint: savedAsset.source.sha256 ?? null,
    browserEvidenceRequired: true,
}, null, 2));
