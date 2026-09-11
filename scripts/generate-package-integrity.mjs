import fs from 'node:fs';
import { renderIntegrity } from './lib/package-integrity.mjs';
const output = 'SHA256SUMS';
fs.writeFileSync(output, renderIntegrity(process.cwd()));
console.log(`Package integrity generated: ${output}`);
