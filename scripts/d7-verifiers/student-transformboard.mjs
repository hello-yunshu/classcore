import { readVerifiedEvidence, runPlaywright } from './lib.mjs';

const evidence = readVerifiedEvidence(process.argv[2], 'student-transformboard', [
  'server-provided-lesson-configuration',
  'transformboard-durable-submit',
  'refresh-and-offline-outbox-recovery',
]);
const test = runPlaywright(['tests/e2e/student-classroom.spec.ts']);
console.log(JSON.stringify({ verifier: 'student-transformboard', evidenceStatus: evidence.status, browserTest: 'passed', output: test.stdout }, null, 2));
