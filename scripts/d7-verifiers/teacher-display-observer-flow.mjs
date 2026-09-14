import { readVerifiedEvidence, runPlaywright } from './lib.mjs';

const evidence = readVerifiedEvidence(process.argv[2], 'teacher-display-observer-flow', [
  'teacher-lease-and-stage-control',
  'display-read-only-projection',
  'observer-pseudonymized-live-view',
]);
const test = runPlaywright([
  'tests/e2e/teacher-stage.spec.ts',
  'tests/e2e/observer-classroom.spec.ts',
  'tests/e2e/presentation-display.spec.ts',
]);
console.log(JSON.stringify({ verifier: 'teacher-display-observer-flow', evidenceStatus: evidence.status, browserTest: 'passed', output: test.stdout }, null, 2));
