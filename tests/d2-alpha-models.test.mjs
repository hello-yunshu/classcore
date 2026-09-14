import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createInitialTransformBoardState,
  commitPreview,
  isValidPivot,
  previewRotation,
  previewTranslate,
  reduceTransformBoard,
  selectPivot,
  serializeBoardState,
  translateGrid,
  restoreBoardState,
} from '../apps/student-web/src/entry.ts';
import {
  addElement,
  addScene,
  cloneScene,
  computeStageFitZoom,
  computeStageViewportFrame,
  computeStageViewportLayout,
  createBlankStudioDocument,
  moveElementLayer,
  moveScene,
  removeScene,
  updateElement,
} from '../apps/presentation-studio/src/entry.ts';

test('TransformBoard keeps selection, movement, rotation and reset pure', () => {
  const initial = createInitialTransformBoardState();
  const moved = reduceTransformBoard(initial, { type: 'move', objectId: 'object:a', dx: 1, dy: 0 });
  assert.equal(initial.objects['object:a'].x, 2);
  assert.equal(moved.objects['object:a'].x, 3);
  const centered = reduceTransformBoard(moved, { type: 'set-rotation-center', objectId: 'object:b', x: 1.4, y: -0.2 });
  assert.equal(centered.selectedObjectId, 'object:a');
  assert.deepEqual(centered.objects['object:b'].rotationCenter, { x: 1, y: 0 });
  const rotated = reduceTransformBoard(centered, { type: 'rotate', objectId: 'object:b', delta: 350 });
  assert.equal(rotated.objects['object:b'].rotation, -10);
  const panned = reduceTransformBoard(rotated, { type: 'pan', dx: 12, dy: 8 });
  assert.deepEqual(panned.pan, { x: 12, y: 8 });
  const reset = reduceTransformBoard(panned, { type: 'reset' });
  assert.equal(reset.objects['object:a'].x, 2);
  assert.equal(reset.pan.x, 0);
});

test('TransformBoard enforces integer single-axis movement, bounds, fixed objects and valid pivots', () => {
  const initial = createInitialTransformBoardState({
    board: { columns: 6, rows: 4 },
    objects: [
      { objectId: 'movable', label: 'M', x: 1, y: 1, width: 2, height: 2, pivots: { corner: { x: 0, y: 0 } } },
      { objectId: 'fixed', label: 'F', x: 4, y: 0, width: 2, height: 2, fixed: true },
    ],
    initialSelection: 'movable',
  });
  assert.equal(translateGrid(initial, 'movable', 'x', 1).objects.movable.x, 2);
  assert.equal(translateGrid(initial, 'movable', 'x', 0.5).objects.movable.x, 1);
  assert.equal(translateGrid(initial, 'movable', 'y', 3).objects.movable.y, 1);
  assert.equal(translateGrid(initial, 'fixed', 'x', -1).objects.fixed.x, 4);
  assert.equal(isValidPivot(initial, 'movable', 'corner'), true);
  assert.equal(isValidPivot(initial, 'movable', 'missing'), false);
  assert.equal(selectPivot(initial, 'movable', 'missing').objects.movable.selectedPivotId, 'corner');
});

test('pattern-restoration config loads directly into the shared TransformBoard grid', () => {
  const configs = JSON.parse(fs.readFileSync(new URL('../lessons/pattern-restoration/configs.json', import.meta.url), 'utf8'));
  const config = configs['config:restore-board'].payload;
  const initial = createInitialTransformBoardState(config);
  assert.deepEqual(initial.board, { columns: 16, rows: 8, coordinateUnit: 'grid-cell' });
  assert.equal(Object.keys(initial.objects).length, 4);
  assert.equal(translateGrid(initial, 'piece:a', 'x', 1).objects['piece:a'].x, 3);
  assert.equal(translateGrid(initial, 'piece:a', 'x', 20).objects['piece:a'].x, 2);
  const preview = previewTranslate(initial, 'piece:a', 0.4, 1.6);
  assert.deepEqual(preview.preview, { kind: 'translate', objectId: 'piece:a', dx: 0.4, dy: 1.6 });
  assert.equal(commitPreview(preview).objects['piece:a'].y, 3);
});

test('TransformBoard supports continuous preview, 90-degree commit, undo and snapshots', () => {
  const initial = createInitialTransformBoardState();
  const preview = previewRotation(initial, 'object:a', 44);
  assert.equal(preview.preview?.kind, 'rotate');
  const committed = commitPreview(preview);
  assert.equal(committed.objects['object:a'].rotation, 90);
  const undone = reduceTransformBoard(committed, { type: 'undo' });
  assert.equal(undone.objects['object:a'].rotation, 0);
  const restored = restoreBoardState({
    board: { columns: 12, rows: 8 },
    objects: Object.values(initial.objects).map((object) => ({ objectId: object.id, label: object.label, shape: object.shape, x: object.x, y: object.y, width: object.width, height: object.height })),
  }, serializeBoardState(committed));
  assert.equal(restored.objects['object:a'].rotation, 90);
});

test('Authoring Studio Alpha supports scene CRUD, element editing and layer ordering', () => {
  const blank = createBlankStudioDocument('公开课');
  assert.equal(blank.scenes.length, 1);
  const withSecond = addScene(blank);
  assert.equal(withSecond.scenes.length, 2);
  const duplicated = cloneScene(withSecond, withSecond.scenes[0].id);
  assert.equal(duplicated.scenes.length, 3);
  const secondId = withSecond.scenes[1].id;
  const withText = addElement(withSecond, secondId, { kind: 'text', x: 10, y: 20, width: 100, height: 30, text: '课堂问题' });
  const textId = withText.scenes[1].elements.at(-1).id;
  const edited = updateElement(withText, secondId, textId, { text: '课堂问题：怎么旋转？', width: 240 });
  assert.equal(edited.scenes[1].elements.at(-1).text, '课堂问题：怎么旋转？');
  assert.equal(edited.scenes[1].elements.at(-1).width, 240);
  const withShape = addElement(edited, secondId, { kind: 'shape', shape: 'circle', x: 30, y: 60, width: 80, height: 80, color: '#e6a23c' });
  const reordered = moveElementLayer(withShape, secondId, textId, 1);
  assert.ok(reordered.scenes[1].elements.findIndex(element => element.id === textId) > 0);
  const movedScene = moveScene(reordered, secondId, -1);
  assert.equal(movedScene.scenes[0].id, secondId);
  assert.equal(removeScene(movedScene, secondId).scenes.length, 1);
  assert.equal(removeScene(blank, blank.scenes[0].id).scenes.length, 1);
});

test('Authoring Studio stage derives zoom from its responsive viewport', () => {
  assert.equal(computeStageFitZoom(640, 360, 1280, 720), 0.5);
  assert.equal(computeStageFitZoom(800, 360, 1280, 720), 0.5);
  assert.equal(computeStageFitZoom(0, 360, 1280, 720), 1);
});

test('Authoring Studio stage keeps zoomed content scrollable and centers content that fits', () => {
  assert.deepEqual(computeStageViewportFrame(1000, 600, 1280, 720, 0.5), {
    width: 640,
    height: 360,
  });
  assert.deepEqual(computeStageViewportFrame(1000, 600, 1280, 720, 0.75, 0, 0, 20), {
    width: 1000,
    height: 580,
  });
  assert.deepEqual(computeStageViewportFrame(1000, 600, 1280, 720, 1.5, 0, 0, 20), {
    width: 1000,
    height: 600,
  });
  assert.deepEqual(computeStageViewportLayout(1000, 600, 1280, 720, 0.78125, 0), {
    contentWidth: 1000,
    contentHeight: 600,
    stageLeft: 0,
    stageTop: 18.75,
  });
  assert.deepEqual(computeStageViewportLayout(1000, 600, 1280, 720, 0.75, 20), {
    contentWidth: 1000,
    contentHeight: 600,
    stageLeft: 20,
    stageTop: 30,
  });
  assert.deepEqual(computeStageViewportLayout(1000, 600, 1280, 720, 1.5, 20), {
    contentWidth: 1960,
    contentHeight: 1120,
    stageLeft: 20,
    stageTop: 20,
  });
});
