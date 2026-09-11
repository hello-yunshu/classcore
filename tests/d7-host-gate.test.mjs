import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('D7 release gate is explicitly Apple-Silicon-only while generic Docker gate remains cross-architecture', () => {
  const host = fs.readFileSync('scripts/check-d7-host.mjs','utf8');
  const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
  assert.match(host, /process\.platform !== 'darwin'/);
  assert.match(host, /process\.arch !== 'arm64'/);
  assert.match(pkg.scripts['release:d7'], /d7:host/);
  assert.match(pkg.scripts['release:d7'], /docker:d7:gate/);
});
