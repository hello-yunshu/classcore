import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderIdentityPolicySource } from './generate-identity-policy.mjs';
import { findPrivateIdentityViolations } from './lib/identity-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputFile = path.join(root, 'packages/contracts/src/private-identity-policy.generated.ts');
const corpusFile = path.join(root, 'config/private-identity-mutation-corpus.json');
const expected = renderIdentityPolicySource();
const actual = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : '';
const errors = [];
if (actual !== expected) errors.push('generated TypeScript is stale; run npm run policy:generate');

let corpus;
try {
  corpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
} catch (error) {
  errors.push(`mutation corpus unreadable: ${error instanceof Error ? error.message : String(error)}`);
}
if (corpus) {
  if (corpus.schemaVersion !== 1) errors.push('mutation corpus schemaVersion must be 1');
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) errors.push('mutation corpus cases must be non-empty');
  else {
    const ids = new Set();
    let safe = 0;
    let unsafe = 0;
    for (const entry of corpus.cases) {
      if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id) errors.push('mutation corpus case must have non-empty id');
      else if (ids.has(entry.id)) errors.push(`mutation corpus duplicate id: ${entry.id}`);
      else ids.add(entry.id);
      if (typeof entry.valid !== 'boolean') errors.push(`mutation corpus ${entry.id ?? '?'} valid must be boolean`);
      else if (entry.valid) safe += 1;
      else unsafe += 1;
      const actualValid = findPrivateIdentityViolations(entry?.value).length === 0;
      if (typeof entry?.valid === 'boolean' && actualValid !== entry.valid) errors.push(`mutation corpus expectation mismatch: ${entry.id}`);
    }
    if (safe === 0 || unsafe === 0) errors.push('mutation corpus must include both safe and unsafe cases');
  }
}

if (errors.length) {
  console.error('Identity policy check FAILED');
  errors.forEach((error) => console.error(` - ${error}`));
  process.exit(1);
}
console.log('Identity policy check PASSED');
