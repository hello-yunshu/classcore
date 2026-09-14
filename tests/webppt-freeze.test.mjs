import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTrustedWebPptCompatibilityReport } from '../apps/server/runtime/webppt-freeze.mjs';

test('trusted web-ppt freeze only clears font warnings with an explicit host inventory', async () => {
  const bytes = fs.readFileSync('dist/public/assets/presentation-webppt-blank.pptx');
  const absent = await buildTrustedWebPptCompatibilityReport(bytes, { assetId: 'probe', fingerprint: 'probe' });
  const family = absent.issues.find(issue => issue.capability === 'font')?.detail.match(/「([^」]+)」/)?.[1];
  assert.ok(family);
  assert.equal(absent.status, 'warnings');
  const confirmed = await buildTrustedWebPptCompatibilityReport(bytes, { assetId: 'probe', fingerprint: 'probe', availableFonts: [family] });
  assert.equal(confirmed.issues.some(issue => issue.capability === 'font' && issue.severity === 'warning'), false);
});

test('trusted web-ppt freeze records bundled KaiTi substitution as approximate', async () => {
  const bytes = fs.readFileSync('dist/public/assets/presentation-webppt-blank.pptx');
  const report = await buildTrustedWebPptCompatibilityReport(bytes, {
    assetId: 'probe',
    fingerprint: 'probe',
    availableFonts: ['LXGW WenKai GB Lite'],
    fontSubstitutions: { 'Arial': 'LXGW WenKai GB Lite' },
  });
  const fontIssue = report.issues.find(issue => issue.capability === 'font');
  assert.ok(fontIssue);
  assert.equal(fontIssue.fidelity, 'APPROXIMATED');
  assert.match(fontIssue.detail, /随包字体/);
});
