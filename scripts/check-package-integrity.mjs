import fs from 'node:fs';
import { renderIntegrity } from './lib/package-integrity.mjs';
if (!fs.existsSync('SHA256SUMS')) { console.error('Package integrity check FAILED: SHA256SUMS missing'); process.exit(1); }
const actual = fs.readFileSync('SHA256SUMS','utf8');
const expected = renderIntegrity(process.cwd());
if (actual !== expected) { console.error('Package integrity check FAILED: SHA256SUMS is stale or release file set changed. Run npm run integrity:generate.'); process.exit(1); }
console.log(`Package integrity check PASSED: ${actual.trim().split(/\n/).filter(Boolean).length} files`);
