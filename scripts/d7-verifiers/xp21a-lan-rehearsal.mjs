import { readVerifiedEvidence } from './lib.mjs';

const evidence = readVerifiedEvidence(process.argv[2], 'xp21a-lan-rehearsal', [
  'xp21a-device-lan-observation',
  'student-durable-event-under-lan-rehearsal',
  'teacher-display-observer-recovery-observation',
]);
if (!Array.isArray(evidence.observations) || evidence.observations.length < 3) throw new Error('xp21a-lan-rehearsal evidence must include three independent observations');
console.log(JSON.stringify({ verifier: 'xp21a-lan-rehearsal', evidenceStatus: evidence.status, observations: evidence.observations.length, physicalEvidence: 'verified' }, null, 2));
