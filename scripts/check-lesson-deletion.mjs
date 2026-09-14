import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkLessonBoundaries } from './check-lesson-boundaries.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-without-lessons-'));
try {
  fs.cpSync(path.join(root, 'packages'), path.join(temporaryRoot, 'packages'), { recursive: true });
  fs.cpSync(path.join(root, 'apps'), path.join(temporaryRoot, 'apps'), { recursive: true });
  fs.cpSync(path.join(root, 'config'), path.join(temporaryRoot, 'config'), { recursive: true });
  fs.cpSync(path.join(root, 'tsconfig.json'), path.join(temporaryRoot, 'tsconfig.json'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporaryRoot, 'node_modules'), 'dir');

  const boundary = checkLessonBoundaries(temporaryRoot);
  if (boundary.errors.length) throw new Error(`boundary errors after deleting lessons: ${boundary.errors.join('; ')}`);
  if (fs.existsSync(path.join(temporaryRoot, 'lessons'))) throw new Error('lesson directory was unexpectedly copied');

  const tsc = path.join(root, 'node_modules', '.bin', 'tsc');
  const typecheck = spawnSync(tsc, ['-p', path.join(temporaryRoot, 'tsconfig.json'), '--noEmit'], { cwd: temporaryRoot, encoding: 'utf8' });
  if (typecheck.status !== 0) throw new Error((typecheck.stderr || typecheck.stdout || `tsc exited ${typecheck.status}`).trim());
  console.log(`Lesson deletion proof PASSED: ${boundary.stats.coreFiles} Core and ${boundary.stats.genericSurfaceFiles} generic Surface files typecheck without lessons`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
