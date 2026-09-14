import { readVerifiedEvidence, runNodeTest } from './lib.mjs';

const evidence = readVerifiedEvidence(process.argv[2], 'classroom-join-presence-submission', [
  'server-authoritative-join',
  'presence-projection',
  'durable-event-snapshot-submission-acks',
]);
const test = runNodeTest(['tests/authenticated-server-protocol.test.mjs']);
console.log(JSON.stringify({ verifier: 'classroom-join-presence-submission', evidenceStatus: evidence.status, protocolTest: 'passed', output: test.stdout }, null, 2));
