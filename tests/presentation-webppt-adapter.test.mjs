import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { openEditor } from '@web-ppt/editor';
import { WebPptPresentationEngineAdapter } from '../packages/presentation-webppt-adapter/src/index.ts';
import { createWebPptAdapter } from '@web-ppt/editor';
import { PresentationStudioController } from '../dist/apps/presentation-studio/src/controller.js';

async function templateBytes() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-webppt-'));
  const filename = path.join(directory, 'blank.pptx');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText('ClassCore web-ppt gate', { x: 1, y: 1, w: 6, h: 0.5, fontSize: 22, color: '24324B' });
  await pptx.writeFile({ fileName: filename });
  const zip = await JSZip.loadAsync(fs.readFileSync(filename));
  const tableStyles = zip.file('ppt/tableStyles.xml');
  if (tableStyles) {
    const xml = await tableStyles.async('string');
    zip.file('ppt/tableStyles.xml', xml.replace(/ def="[^"]+"/, ''));
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' });
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

test('Studio controller uses correct MoveSlide anchors and one transaction per batch action', async () => {
  const bytes = await templateBytes();
  const adapter = new WebPptPresentationEngineAdapter(async () => bytes);
  const asset = await adapter.createBlank('Controller gate');
  const webPpt = createWebPptAdapter();
  await webPpt.applyBinding({ source: asset.source.bytes, openOptions: { idPrefix: asset.document.idPrefix }, mode: 'edit' });
  const controller = new PresentationStudioController(webPpt);
  const editor = controller.editor;
  const first = editor.doc.slideOrder[0];
  const second = [...editor.exec({ type: 'AddSlide', layoutId: editor.doc.layoutOrder[0], at: { after: first } }).createdSlides][0];
  const third = [...editor.exec({ type: 'AddSlide', layoutId: editor.doc.layoutOrder[0], at: { after: second } }).createdSlides][0];
  controller.moveSlide(first, 1);
  assert.deepEqual([...editor.doc.slideOrder], [second, first, third]);
  controller.moveSlide(first, -1);
  assert.deepEqual([...editor.doc.slideOrder], [first, second, third]);

  const firstShape = controller.addShape('roundRect');
  const secondShape = controller.addShape('roundRect');
  assert.ok(firstShape && secondShape);
  controller.select({ kind: 'elements', ids: [firstShape, secondShape], enteredGroup: null });
  controller.removeSelected();
  assert.equal(editor.doc.slides[first].children.includes(firstShape), false);
  editor.undo();
  assert.equal(editor.doc.slides[first].children.includes(firstShape), true);
  assert.equal(editor.doc.slides[first].children.includes(secondShape), true);
  controller.dispose();
});

test('Studio insertion keeps new shapes and tables neutral until styled explicitly', async () => {
  const bytes = await templateBytes();
  const adapter = new WebPptPresentationEngineAdapter(async () => bytes);
  const asset = await adapter.createBlank('Neutral insertion gate');
  const webPpt = createWebPptAdapter();
  await webPpt.applyBinding({ source: asset.source.bytes, openOptions: { idPrefix: asset.document.idPrefix }, mode: 'edit' });
  const controller = new PresentationStudioController(webPpt);
  const undoBeforeShape = controller.editor.history.undoCount;
  const shapeId = controller.addShape('roundRect');
  assert.ok(shapeId);
  assert.equal(controller.editor.history.undoCount, undoBeforeShape + 1, 'shape insertion and neutral defaults must be one undo unit');
  assert.deepEqual(controller.editor.effectiveElement(shapeId).fill, { type: 'none' });
  assert.equal(controller.editor.effectiveElement(shapeId).stroke?.color, 'rgb(107,114,128)');
  const undoBeforeTable = controller.editor.history.undoCount;
  const tableId = controller.addTable(2, 2);
  assert.equal(controller.editor.history.undoCount, undoBeforeTable + 1, 'table insertion and neutral style must be one undo unit');
  const table = controller.editor.effectiveElement(tableId);
  assert.equal(table.kind, 'table');
  assert.deepEqual(table.rows.flatMap(row => row.cells.map(cell => cell.fill)), [
    { type: 'solid', color: 'rgb(255,255,255)' }, { type: 'solid', color: 'rgb(255,255,255)' },
    { type: 'solid', color: 'rgb(255,255,255)' }, { type: 'solid', color: 'rgb(255,255,255)' },
  ]);
  controller.dispose();
});

test('Studio text box insertion does not require an existing text-shaped source', async () => {
  const bytes = await templateBytes();
  const adapter = new WebPptPresentationEngineAdapter(async () => bytes);
  const asset = await adapter.createBlank('Standalone text box gate');
  const webPpt = createWebPptAdapter();
  await webPpt.applyBinding({ source: asset.source.bytes, openOptions: { idPrefix: asset.document.idPrefix }, mode: 'edit' });
  const controller = new PresentationStudioController(webPpt);
  const slide = controller.editor.doc.slides[controller.slideId];
  for (const id of [...(slide?.children ?? [])]) controller.execute({ type: 'RemoveElement', id });
  const textBoxId = controller.addTextBox();
  assert.ok(textBoxId);
  assert.equal(controller.editor.effectiveElement(textBoxId).kind, 'shape');
  assert.ok(controller.editor.effectiveElement(textBoxId).text);
  assert.deepEqual(controller.editor.effectiveElement(textBoxId).fill, { type: 'none' });
  assert.equal(controller.editor.effectiveElement(textBoxId).stroke, null);
  controller.dispose();
});

test('Studio controller centers a text element without entering text editing', async () => {
  const bytes = await templateBytes();
  const adapter = new WebPptPresentationEngineAdapter(async () => bytes);
  const asset = await adapter.createBlank('Text alignment gate');
  const webPpt = createWebPptAdapter();
  await webPpt.applyBinding({ source: asset.source.bytes, openOptions: { idPrefix: asset.document.idPrefix }, mode: 'edit' });
  const controller = new PresentationStudioController(webPpt);
  const textBoxId = controller.addTextBox();
  assert.ok(textBoxId);
  controller.editText(textBoxId, '课堂标题');
  controller.setParagraphForElement(textBoxId, { align: 'center' });
  const text = controller.editor.effectiveElement(textBoxId).text;
  assert.ok(text);
  assert.equal(text.paragraphs[0].align, 'center');
  controller.dispose();
});

test('Studio animation insertion appends and explicit empty steps clear the timeline', async () => {
  const bytes = await templateBytes();
  const adapter = new WebPptPresentationEngineAdapter(async () => bytes);
  const asset = await adapter.createBlank('Animation gate');
  const webPpt = createWebPptAdapter();
  await webPpt.applyBinding({ source: asset.source.bytes, openOptions: { idPrefix: asset.document.idPrefix }, mode: 'edit' });
  const controller = new PresentationStudioController(webPpt);
  const slideId = controller.slideId;
  const elementId = controller.addShape('roundRect');
  assert.ok(slideId && elementId);
  const step = { target: elementId, kind: 'entrance', effect: 'fade', trigger: 'click', delayMs: 0, durationMs: 300 };
  controller.appendAnimations(slideId, [step]);
  controller.appendAnimations(slideId, [step]);
  assert.equal(webPpt.queryAnimations()?.value.length, 2);
  controller.setAnimations(slideId, []);
  assert.equal(webPpt.queryAnimations()?.value.length, 0);
  controller.dispose();
});
