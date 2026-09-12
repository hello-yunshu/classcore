import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialTransformBoardState,
  reduceTransformBoard,
} from '../apps/student-web/src/entry.ts';
import {
  addElement,
  addScene,
  cloneScene,
  computeStageFitZoom,
  createBlankStudioDocument,
  moveElementLayer,
  moveScene,
  removeScene,
  updateElement,
} from '../apps/presentation-studio/src/entry.ts';

test('Student TransformBoard Alpha keeps selection, movement, rotation and reset pure', () => {
  const initial = createInitialTransformBoardState();
  const moved = reduceTransformBoard(initial, { type: 'move', objectId: 'fragmentA', dx: 20, dy: -5 });
  assert.equal(initial.objects.fragmentA.x, 112);
  assert.equal(moved.objects.fragmentA.x, 132);
  const centered = reduceTransformBoard(moved, { type: 'set-rotation-center', objectId: 'fragmentB', x: 1.4, y: -0.2 });
  assert.equal(centered.selectedObjectId, 'fragmentB');
  assert.deepEqual(centered.objects.fragmentB.rotationCenter, { x: 1, y: 0 });
  const rotated = reduceTransformBoard(centered, { type: 'rotate', objectId: 'fragmentB', delta: 350 });
  assert.equal(rotated.objects.fragmentB.rotation, 2);
  const panned = reduceTransformBoard(rotated, { type: 'pan', dx: 12, dy: 8 });
  assert.deepEqual(panned.pan, { x: 12, y: 8 });
  const reset = reduceTransformBoard(panned, { type: 'reset' });
  assert.equal(reset.objects.fragmentA.x, 112);
  assert.equal(reset.pan.x, 0);
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
