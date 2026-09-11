import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverLessonPackages } from '../scripts/lib/lesson-discovery.mjs';

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-discovery-'));
  fs.mkdirSync(path.join(root, 'lessons'), { recursive: true });
  return root;
}

function manifest(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.manifest.json'), '{}\n');
}

test('lesson discovery recursively finds category-nested lesson packages', () => {
  const root = tempRoot();
  try {
    manifest(path.join(root, 'lessons', 'math', 'pattern'));
    const result = discoverLessonPackages(root, ['lessons']);
    assert.deepEqual(result.errors, []);
    assert.equal(result.packages.length, 1);
    assert.match(result.packages[0], /math.*pattern/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('lesson discovery rejects nested package roots to prevent ambiguous ownership', () => {
  const root = tempRoot();
  try {
    manifest(path.join(root, 'lessons', 'outer'));
    manifest(path.join(root, 'lessons', 'outer', 'inner'));
    const result = discoverLessonPackages(root, ['lessons']);
    assert.match(result.errors.join('\n'), /nested lesson package roots are ambiguous/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('lesson discovery rejects symlinks instead of silently skipping them', (t) => {
  if (process.platform === 'win32') {
    t.skip('symlink permissions differ on Windows');
    return;
  }
  const root = tempRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-outside-'));
  try {
    manifest(outside);
    fs.symlinkSync(outside, path.join(root, 'lessons', 'linked'), 'dir');
    const result = discoverLessonPackages(root, ['lessons']);
    assert.match(result.errors.join('\n'), /symlink is not allowed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
