import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

export const REQUIRED_D7_REQUIREMENTS = Object.freeze([
  'authenticated-classroom-server',
  'student-transformboard',
  'presentation-runtime',
  'classroom-join-presence-submission',
  'teacher-display-observer-flow',
  'xp21a-lan-rehearsal',
]);

const file = process.env.D7_READINESS_FILE || 'config/d7-release-readiness.json';
function fail(lines, code = 1) {
  console.error('D7 product readiness FAILED');
  for (const line of lines) console.error(` - ${line}`);
  process.exit(code);
}
if (!fs.existsSync(file)) fail([`missing ${file}`], 2);
let value;
try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (error) { fail([`invalid JSON: ${error instanceof Error ? error.message : String(error)}`], 2); }
if (value.schemaVersion !== 2 || value.track !== 'D7' || !Array.isArray(value.requirements)) fail(['invalid readiness manifest schema'], 2);
const errors = [];
const ids = value.requirements.map((item) => item?.id);
if (ids.length !== REQUIRED_D7_REQUIREMENTS.length) errors.push(`requirements must be exact-set of ${REQUIRED_D7_REQUIREMENTS.length} fixed IDs`);
for (const required of REQUIRED_D7_REQUIREMENTS) if (!ids.includes(required)) errors.push(`missing required requirement: ${required}`);
for (const id of ids) if (!REQUIRED_D7_REQUIREMENTS.includes(id)) errors.push(`unknown requirement: ${id}`);
if (new Set(ids).size !== ids.length) errors.push('duplicate requirement IDs');
for (const item of value.requirements) {
  if (typeof item?.ready !== 'boolean') errors.push(`${item?.id ?? '<missing>'}: ready must be boolean`);
  if (typeof item?.note !== 'string' || !item.note.trim()) errors.push(`${item?.id ?? '<missing>'}: note required`);
}
if (errors.length) fail(errors, 2);
const blockers = value.requirements.filter((item) => item.ready !== true);
if (blockers.length) fail(blockers.map((item) => `blocker ${item.id}: ${item.note}`));

const verificationErrors = [];
for (const id of REQUIRED_D7_REQUIREMENTS) {
  const evidencePath = path.join('evidence', 'd7', `${id}.json`);
  const verifierPath = path.join('scripts', 'd7-verifiers', `${id}.mjs`);
  if (!fs.existsSync(evidencePath)) { verificationErrors.push(`${id}: missing fixed evidence file ${evidencePath}`); continue; }
  if (!fs.existsSync(verifierPath)) { verificationErrors.push(`${id}: missing live verifier ${verifierPath}`); continue; }
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')); }
  catch { verificationErrors.push(`${id}: evidence JSON unreadable`); continue; }
  if (evidence.schemaVersion !== 1 || evidence.requirementId !== id || evidence.status !== 'verified' || !Array.isArray(evidence.checks) || evidence.checks.length === 0 || evidence.checks.some((x) => x?.passed !== true)) {
    verificationErrors.push(`${id}: evidence structure/checks are not verified`);
    continue;
  }
  const run = spawnSync(process.execPath, [verifierPath, evidencePath], { encoding: 'utf8' });
  if (run.status !== 0) verificationErrors.push(`${id}: live verifier failed: ${(run.stderr || run.stdout || '').trim() || `exit ${run.status}`}`);
}
if (verificationErrors.length) fail(verificationErrors);
console.log(`D7 product readiness PASSED: ${REQUIRED_D7_REQUIREMENTS.length} fixed requirements with machine-verifiable evidence`);
