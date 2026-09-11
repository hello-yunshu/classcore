import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';
import { openEditor } from '@web-ppt/editor';
import { WebPptPresentationEngineAdapter } from '../packages/presentation-webppt-adapter/src/index.ts';

async function templateBytes() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-webppt-'));
  const filename = path.join(directory, 'blank.pptx');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText('ClassCore web-ppt gate', { x: 1, y: 1, w: 6, h: 0.5, fontSize: 22, color: '24324B' });
  await pptx.writeFile({ fileName: filename });
  const bytes = new Uint8Array(fs.readFileSync(filename));
  fs.rmSync(directory, { recursive: true, force: true });
  return bytes;
}

test('web-ppt adapter creates, validates, saves, reopens and indexes a native deck', async () => {
  const bytes = await templateBytes();
  const adapter = new WebPptPresentationEngineAdapter(async () => bytes);
  const asset = await adapter.createBlank('Gate deck');
  assert.equal(asset.engine.engineId, 'web-ppt');
  assert.equal(asset.document.format, 'web-ppt-ooxml-v1');
  assert.ok(asset.source?.bytes.byteLength > 0);
  assert.equal((await adapter.validate(asset)).valid, true);

  const first = await adapter.buildRuntimeIndex(asset);
  assert.equal(first.scenes.length, 1);
  assert.equal(first.scenes[0].maxStep, 0);

  const session = await openEditor(asset.source.bytes, { idPrefix: asset.document.idPrefix });
  const slideId = session.editor.doc.slideOrder[0];
  session.editor.exec({ type: 'AddShape', slideId, preset: 'roundRect', rect: { x: 260, y: 180, w: 240, h: 120 } });
  const elementId = session.editor.selection.kind === 'elements' ? session.editor.selection.ids[0] : null;
  assert.ok(elementId);
  session.editor.exec({ type: 'SetAnimations', slideId, steps: [{ target: elementId, kind: 'entrance', effect: 'fade', trigger: 'click', delayMs: 0, durationMs: 300 }] });
  const saved = await session.editor.save();
  session.dispose();

  const reopened = await openEditor(saved, { idPrefix: asset.document.idPrefix });
  assert.equal(reopened.editor.doc.slideOrder[0], slideId, 'ClassCore must persist the idPrefix across reopen');
  assert.equal(reopened.editor.doc.elements[elementId] !== undefined, true);
  const savedAsset = { ...asset, source: { ...asset.source, bytes: saved } };
  const indexed = await adapter.buildRuntimeIndex(savedAsset);
  assert.equal(indexed.scenes[0].sceneId, slideId);
  assert.equal(indexed.scenes[0].maxStep, 1);
  reopened.dispose();
});

test('web-ppt adapter fails closed on missing binary source', async () => {
  const adapter = new WebPptPresentationEngineAdapter(async () => new Uint8Array());
  const asset = await adapter.createBlank('broken');
  const result = await adapter.validate(asset);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});
