import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderLessonTemplate } from '../scripts/lib/lesson-template.mjs';
import { validateLessonPackageDirectory } from '../scripts/lib/lesson-package-validator.mjs';

test('lesson template safely preserves quotes, slashes and unicode in title', () => {
  const root = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-template-safe-'));
  const target = path.join(tmp, 'lesson');
  const title = '“图案”与 "记录" \\ 云云数';
  try {
    renderLessonTemplate(path.join(root, 'templates', 'public-lesson-starter'), target, 'safe-title', title);
    const lesson = JSON.parse(fs.readFileSync(path.join(target, 'lesson.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'package.manifest.json'), 'utf8'));
    assert.equal(lesson.title, title);
    assert.equal(lesson.lessonId, 'lesson:safe-title');
    assert.equal(manifest.packageId, 'lesson-package:safe-title');
    const result = validateLessonPackageDirectory(target);
    assert.equal(result.valid, true, result.errors.join('; '));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
