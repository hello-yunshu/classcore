import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { probeHostLanPublication } from '../scripts/lib/lan-publication-probe.mjs';
test('LAN probe fails closed when local-tools is reachable on a non-loopback host address', async () => {
  const fakeFetch = async (url) => ({ ok: url.includes(':9602') || url.includes(':9688') });
  await assert.rejects(() => probeHostLanPublication({ addresses: ['192.168.1.8'], classroomPort: 9602, localToolsPort: 9688, fetchFn: fakeFetch }), /SECURITY_ASSERTION_FAILED/);
});
test('LAN probe accepts classroom publication when local-tools is unreachable', async () => {
  const fakeFetch = async (url) => { if (url.includes(':9688')) throw new Error('unreachable'); return { ok: true }; };
  const result = await probeHostLanPublication({ addresses: ['192.168.1.8'], classroomPort: 9602, localToolsPort: 9688, fetchFn: fakeFetch });
  assert.deepEqual(result, { status: 'passed', address: '192.168.1.8' });
});
test('generic Docker gate validates real Compose YAML semantics before image/run checks', () => {
  const source = fs.readFileSync('scripts/docker-release-gate.mjs','utf8');
  assert.match(source, /docker-compose\.example\.yml', 'config', '--quiet'/);
});
