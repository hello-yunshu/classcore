import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkLessonBoundaries } from '../scripts/check-lesson-boundaries.mjs';
import { renderLessonTemplate } from '../scripts/lib/lesson-template.mjs';
import { validateLessonPackageDirectory } from '../scripts/lib/lesson-package-validator.mjs';
import { validateLessonPackageWithFormalSchemas } from '../scripts/lib/formal-lesson-validator.mjs';

const registry = JSON.stringify({
  lessonIds: ['lesson:pattern-restoration'],
  lessonPathTokens: ['pattern-restoration'],
  lessonDisplayNames: ['图案的还原'],
  coreRoots: ['packages/contracts'],
  genericSurfaceRoots: ['apps/student-web'],
  productionRoots: ['packages', 'apps'],
}, null, 2);

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-lesson-boundary-'));
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config/lesson-boundaries.json'), registry);
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return root;
}

test('current repository satisfies the lesson boundary gate', () => {
  const result = checkLessonBoundaries(process.cwd());
  assert.deepEqual(result.errors, []);
});

test('Core to Lesson import is rejected', () => {
  const root = fixture({ 'packages/contracts/src/index.ts': "import lesson from '../../lessons/pattern-restoration/index.js';\nexport { lesson };\n" });
  const result = checkLessonBoundaries(root);
  assert.match(result.errors.join('\n'), /Core must not import lesson source/);
});

test('registered lesson namespace is rejected in Core source', () => {
  const root = fixture({ 'packages/contracts/src/index.ts': "export const defaultLesson = 'lesson:pattern-restoration';\n" });
  const result = checkLessonBoundaries(root);
  assert.match(result.errors.join('\n'), /registered lesson namespace/);
});

test('generic Surface cannot import a lesson analytics implementation', () => {
  const root = fixture({ 'apps/student-web/src/entry.ts': "import analytics from '../../../lessons/pattern-restoration/analytics/index.js';\nvoid analytics;\n" });
  const result = checkLessonBoundaries(root);
  assert.match(result.errors.join('\n'), /generic surface must not import lesson implementation/);
});

test('generic Surface cannot contain registered lesson identity', () => {
  const root = fixture({ 'apps/student-web/src/entry.ts': "const title = '图案的还原';\n" });
  const result = checkLessonBoundaries(root);
  assert.match(result.errors.join('\n'), /lesson-specific token/);
});

test('docs and fixtures may describe lesson-specific data', () => {
  const root = fixture({
    'docs/example.ts': "const fakeQr = 'fixture';\nconst lesson = 'lesson:pattern-restoration';\n",
    'tests/fixture.ts': "const channel = new BroadcastChannel('fixture');\n",
  });
  const result = checkLessonBoundaries(root);
  assert.deepEqual(result.errors, []);
});

test('production mock shortcuts are rejected', () => {
  const root = fixture({ 'apps/teacher-web/src/entry.ts': "const students = [{ studentId: '8' }];\nconst channel = new BroadcastChannel('classroom');\n" });
  const result = checkLessonBoundaries(root);
  assert.match(result.errors.join('\n'), /fixed array/);
  assert.match(result.errors.join('\n'), /BroadcastChannel/);
});

test('production classroom credentials and identities are rejected', () => {
  const root = fixture({ 'apps/display-web/src/entry.ts': "const credentialValue = 'D17';\nconst participantId = 'display:MAIN';\n" });
  const result = checkLessonBoundaries(root);
  assert.match(result.errors.join('\n'), /credentials/);
  assert.match(result.errors.join('\n'), /participant identities/);
});

test('a second Lesson Package is generated and formally validated without Core changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-second-lesson-'));
  const target = path.join(root, 'lessons', 'second-lesson');
  renderLessonTemplate(path.join(process.cwd(), 'templates', 'public-lesson-starter'), target, 'second-lesson', '第二节课');
  const structural = validateLessonPackageDirectory(target);
  const formal = validateLessonPackageWithFormalSchemas(target);
  assert.equal(structural.valid, true, structural.errors?.join('; '));
  assert.equal(formal.valid, true, formal.stderr || formal.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(target, 'lesson.json'), 'utf8')).lessonId, 'lesson:second-lesson');
  fs.rmSync(root, { recursive: true, force: true });
});
