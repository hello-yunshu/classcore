import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

test('foundation freeze rejects newly added untracked contract files', () => {
  const sentinel = path.join(root, 'docs', 'contracts', 'v0.1.2', '__freeze-negative-test__.txt');
  fs.writeFileSync(sentinel, 'must fail exact-set freeze\n');
  try {
    const result = spawnSync(process.execPath, ['scripts/check-foundation-freeze.mjs'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /untracked Foundation file/);
  } finally {
    fs.rmSync(sentinel, { force: true });
  }
});
