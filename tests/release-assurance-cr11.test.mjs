import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { findPrivateIdentityViolations as findScriptViolations } from '../scripts/lib/identity-policy.mjs';
import { findPrivateIdentityViolations as findRuntimeViolations } from '../dist/packages/contracts/src/index.js';

const REQUIRED = ['authenticated-classroom-server','student-transformboard','presentation-runtime','classroom-join-presence-submission','teacher-display-observer-flow','xp21a-lan-rehearsal'];
function runReadiness(value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd7-ready-'));
  const file = path.join(dir, 'manifest.json');
  const evidenceDirectory = path.join(dir, 'evidence');
  fs.mkdirSync(evidenceDirectory);
  fs.writeFileSync(file, JSON.stringify(value));
  const run = spawnSync(process.execPath, ['scripts/check-d7-product-readiness.mjs'], { encoding: 'utf8', env: { ...process.env, D7_READINESS_FILE: file, D7_EVIDENCE_DIR: evidenceDirectory } });
  fs.rmSync(dir, { recursive: true, force: true });
  return run;
}

test('CR11 corpus includes embedded and multiply encoded stable identity references', () => {
  const corpus = JSON.parse(fs.readFileSync('config/private-identity-mutation-corpus.json','utf8'));
  for (const id of ['private-reference-embedded-text','private-reference-url','private-reference-percent-encoded','private-reference-double-percent-encoded','private-reference-encoded-prefix','private-reference-unicode-escape','private-reference-html-entity','private-reference-nested-html-entity','private-reference-percent-to-unicode']) {
    const row = corpus.cases.find((x) => x.id === id); assert.ok(row,id); assert.equal(row.valid,false,id);
  }
});

test('script identity guard rejects stable identity tokens embedded in ordinary text and URLs', () => {
  for (const value of ['selected student:S17','https://x/?id=student:S17','debug={"participantId":"student:S17"}']) assert.ok(findScriptViolations({ value }).length > 0, value);
});

test('runtime identity guard rejects multiply percent-encoded identity references', () => {
  for (const value of ['student%253AS17','%2573tudent%253AS17','student%255Cu003AS17']) assert.ok(findRuntimeViolations({ value }).length > 0, value);
});

test('identity guard rejects escaped and HTML-entity colon forms after bounded normalization', () => {
  for (const value of ['student\\u003AS17','\\u0073tudent\\u003AS17','student\\x3AS17','student&#58;S17','student&colon;S17','student&amp;#58;S17']) assert.ok(findScriptViolations({ value }).length > 0, value);
});

test('D7 readiness manifest is schema v2 and uses the exact fixed requirement set', () => {
  const value=JSON.parse(fs.readFileSync('config/d7-release-readiness.json','utf8'));
  assert.equal(value.schemaVersion,2); assert.equal(value.track,'D7');
  assert.deepEqual([...value.requirements.map((x)=>x.id)].sort(), [...REQUIRED].sort());
});

test('D7 readiness rejects empty requirement list instead of vacuous success', () => {
  const run=runReadiness({schemaVersion:2,track:'D7',requirements:[]});
  assert.notEqual(run.status,0); assert.match(run.stderr,/exact-set|missing required requirement/);
});

test('D7 readiness cannot be self-certified with ready=true and free-text notes', () => {
  const run=runReadiness({schemaVersion:2,track:'D7',requirements:REQUIRED.map((id)=>({id,ready:true,note:'trust me'}))});
  assert.notEqual(run.status,0); assert.match(run.stderr,/missing fixed evidence file|evidence structure\/checks are not verified|live verifier failed/);
});

test('reference and D7 Compose files have intentionally different classroom exposure', () => {
  const reference=fs.readFileSync('deploy/docker/docker-compose.example.yml','utf8');
  const d7=fs.readFileSync('deploy/docker/docker-compose.d7.yml','utf8');
  assert.match(reference,/127\.0\.0\.1:9602:9602/); assert.match(reference,/127\.0\.0\.1:9688:9688/);
  assert.match(d7,/"9602:9602"/); assert.match(d7,/127\.0\.0\.1:9688:9688/);
  assert.match(d7,/CLASSROOM_RUNTIME_MODE:.*authenticated-classroom-server/);
  assert.match(d7,/CLASSROOM_AUTHENTICATION:.*true/);
  assert.match(d7,/CLASSROOM_PRODUCT_READY:.*true/);
});

test('reference runtime fails closed instead of ignoring an authenticated runtime request', () => {
  const source=fs.readFileSync('apps/server/runtime/server.mjs','utf8');
  assert.match(source,/unsupported-runtime-mode: authenticated-classroom-server is not implemented/);
  assert.match(source,/CLASSROOM_RUNTIME_MODE/); assert.match(source,/CLASSROOM_AUTHENTICATION/); assert.match(source,/CLASSROOM_PRODUCT_READY/);
});

test('D7 Docker gate binds release to authenticated runtime identity and attacks unauthenticated Teacher self-claim', () => {
  const source=fs.readFileSync('scripts/docker-d7-gate.mjs','utf8');
  assert.match(source,/authenticated-classroom-server/); assert.match(source,/authentication !== true/); assert.match(source,/productReady !== true/); assert.match(source,/unauthenticated client self-declared teacher/);
});

test('release:d7 uses authenticated D7 Docker gate and does not route through reference docker:gate', () => {
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); const cmd=pkg.scripts['release:d7'];
  assert.match(cmd,/d7:product/); assert.match(cmd,/d7:host/); assert.match(cmd,/docker:d7:gate/); assert.doesNotMatch(cmd,/release:check|docker:compose:gate/);
});

test('reference /readyz reports transport readiness but explicitly not classroom product readiness', async () => {
  const port=30200+Math.floor(Math.random()*200); const local=port+300; const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'cr11-readyz-'));
  const child=spawn(process.execPath,['apps/server/runtime/server.mjs'],{env:{...process.env,PORT:String(port),LOCAL_TOOLS_PORT:String(local),CLASSROOM_DATA_DIR:dataDir},stdio:['ignore','ignore','pipe']});
  try {
    let body; const deadline=Date.now()+5000;
    while(Date.now()<deadline){ try{ const r=await fetch(`http://127.0.0.1:${port}/readyz`); if(r.ok){body=await r.json(); break;} }catch{} await new Promise(r=>setTimeout(r,30)); }
    assert.ok(body,'readyz unavailable'); assert.equal(body.transportReady,true); assert.equal(body.productReady,false); assert.equal(body.runtimeMode,'reference-transport'); assert.equal(body.authentication,false);
  } finally { if(child.exitCode===null){child.kill('SIGTERM'); await new Promise((resolve)=>child.once('exit',resolve));} fs.rmSync(dataDir,{recursive:true,force:true}); }
});
