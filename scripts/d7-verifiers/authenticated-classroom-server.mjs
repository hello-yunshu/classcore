import { readVerifiedEvidence, runNodeTest } from './lib.mjs';

const evidence = readVerifiedEvidence(process.argv[2], 'authenticated-classroom-server', [
  'server-startup-no-implicit-demo',
  'authenticated-join-and-membership',
  'authenticated-websocket-protocol',
]);
const test = runNodeTest(['tests/authenticated-server-protocol.test.mjs']);
console.log(JSON.stringify({ verifier: 'authenticated-classroom-server', evidenceStatus: evidence.status, protocolTest: 'passed', output: test.stdout }, null, 2));
