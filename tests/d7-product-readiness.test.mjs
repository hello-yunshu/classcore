import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

test('D7 product release gate cannot become green while known product blockers remain', () => {
  const value = JSON.parse(fs.readFileSync('config/d7-release-readiness.json', 'utf8'));
  assert.equal(value.schemaVersion, 2);
  assert.equal(value.track, 'D7');
  const ids = value.requirements.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of ['authenticated-classroom-server','student-transformboard','presentation-runtime','classroom-join-presence-submission','teacher-display-observer-flow','xp21a-lan-rehearsal']) assert.ok(ids.includes(required), required);
  const blockers = value.requirements.filter((item) => item.ready !== true);
  const run = spawnSync(process.execPath, ['scripts/check-d7-product-readiness.mjs'], { encoding: 'utf8' });
  assert.equal(run.status === 0, blockers.length === 0, `${run.stdout}\n${run.stderr}`);
  if (blockers.length) assert.match(run.stderr, /D7 product readiness FAILED/);
});
