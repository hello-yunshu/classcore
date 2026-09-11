import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'FOUNDATION-SHA256SUMS');
const frozenRoots = ['docs/contracts/v0.1.2'];

function filesUnder(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
    }
  }
  if (fs.existsSync(absoluteRoot)) walk(absoluteRoot);
  return files.sort();
}

if (!fs.existsSync(manifestPath)) {
  console.error('Foundation freeze check FAILED: missing FOUNDATION-SHA256SUMS');
  process.exit(1);
}

const rows = fs.readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
const errors = [];
const expectedFiles = new Map();
for (const row of rows) {
  const match = row.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) {
    errors.push(`invalid manifest row: ${row}`);
    continue;
  }
  const [, expected, relative] = match;
  if (expectedFiles.has(relative)) errors.push(`duplicate manifest path: ${relative}`);
  expectedFiles.set(relative, expected);
}

const actualFiles = frozenRoots.flatMap(filesUnder).sort();
const actualSet = new Set(actualFiles);
for (const relative of expectedFiles.keys()) {
  if (!actualSet.has(relative)) errors.push(`missing: ${relative}`);
}
for (const relative of actualFiles) {
  if (!expectedFiles.has(relative)) errors.push(`untracked Foundation file: ${relative}`);
}

for (const [relative, expected] of expectedFiles) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    errors.push(`Foundation entry must be a regular file, not a symlink/special file: ${relative}`);
    continue;
  }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) errors.push(`changed: ${relative}`);
}

if (errors.length) {
  console.error('Foundation freeze check FAILED');
  errors.forEach((error) => console.error(' -', error));
  console.error('如果确实需要改变 Foundation，请先做独立架构变更审计；不要直接重写 freeze manifest。');
  process.exit(1);
}
console.log(`Foundation exact-set freeze check PASSED: ${actualFiles.length} files across ${frozenRoots.join(', ')}`);
