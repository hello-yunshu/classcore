import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function readVerifiedEvidence(file, requirementId, requiredChecks) {
  if (!file) throw new Error(`${requirementId} verifier requires evidence JSON`);
  const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
  const expected = new Set(requiredChecks);
  if (evidence.schemaVersion !== 1 || evidence.requirementId !== requirementId || evidence.status !== 'verified') {
    throw new Error(`${requirementId} evidence must be verified schema v1`);
  }
  if (!Array.isArray(evidence.checks) || evidence.checks.length !== expected.size) {
    throw new Error(`${requirementId} evidence must contain the exact check set`);
  }
  for (const check of evidence.checks) {
    if (!expected.has(check?.id) || check.passed !== true) throw new Error(`${requirementId} evidence check failed or unknown: ${check?.id ?? '<missing>'}`);
  }
  return evidence;
}

export function runNodeTest(testFiles, extraEnv = {}) {
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: ROOT,
    env: { ...process.env, CLASSROOM_DEMO_MODE: 'true', CLASSROOM_LESSON: 'pattern-restoration', ...extraEnv },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `node test exited ${result.status}`).trim());
  return { stdout: result.stdout.trim() };
}

export function runPlaywright(specs, extraEnv = {}) {
  const runner = path.join(ROOT, 'node_modules', '.bin', 'playwright');
  const result = spawnSync(runner, ['test', ...specs], {
    cwd: ROOT,
    env: { ...process.env, CLASSROOM_LESSON: 'pattern-restoration', ...extraEnv },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `playwright exited ${result.status}`).trim());
  return { stdout: result.stdout.trim() };
}
