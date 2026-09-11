import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderIdentityPolicySource } from '../scripts/generate-identity-policy.mjs';
import { findPrivateIdentityViolations as findScriptViolations } from '../scripts/lib/identity-policy.mjs';
import { runPython, projectRoot } from '../scripts/lib/python-runtime.mjs';
import { findPrivateIdentityViolations as findRuntimeViolations } from '../dist/packages/contracts/src/index.js';

test('canonical private identity policy generated TypeScript is in sync and covers server identity fields/references', () => {
  const policy=JSON.parse(fs.readFileSync('config/private-identity-policy.json','utf8'));
  for (const field of ['participantId','studentId','membershipId','connectionId','rosterId','displayName','realName','studentName','seatNo','classId','deviceId','clientInstanceId','participantHint','reconnectToken','accessToken','credential']) assert.ok(policy.privateFieldNames.includes(field),field);
  for (const prefix of ['student:','teacher:','observer:','display:','membership:','connection:','roster:','class:']) assert.ok(policy.participantReferencePrefixes.includes(prefix),prefix);
  assert.equal(fs.readFileSync('packages/contracts/src/private-identity-policy.generated.ts','utf8'), renderIdentityPolicySource(policy));
});

test('private identity mutation corpus has parity across runtime TypeScript, lesson JavaScript and Python validator semantics', () => {
  const corpus=JSON.parse(fs.readFileSync('config/private-identity-mutation-corpus.json','utf8'));
  for (const entry of corpus.cases) {
    const expected=entry.valid;
    const runtimeValid=findRuntimeViolations(entry.value).length===0;
    const scriptValid=findScriptViolations(entry.value).length===0;
    assert.equal(runtimeValid,expected,`runtime:${entry.id}`);
    assert.equal(scriptValid,expected,`script:${entry.id}`);
  }
  const result=runPython(['scripts/check-identity-policy-corpus.py'],{cwd:projectRoot});
  assert.equal(result.status,0,result.stderr || result.stdout);
  const rows=JSON.parse(result.stdout);
  assert.equal(rows.length,corpus.cases.length);
  for (const row of rows) assert.equal(row.valid,row.expected,`python:${row.id}`);
});
