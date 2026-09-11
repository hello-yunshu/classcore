import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.venv', '.git', '.pytest_cache', '__pycache__', '.runtime-data']);
const EXCLUDED_FILES = new Set(['SHA256SUMS']);
export function listReleaseFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).replaceAll(path.sep, '/');
      const stat = fs.lstatSync(abs);
      if (stat.isSymbolicLink()) throw new Error(`release tree contains symlink: ${rel}`);
      if (entry.isDirectory()) walk(abs);
      else if (!EXCLUDED_FILES.has(rel) && !rel.endsWith('.sqlite') && !rel.endsWith('.sqlite-shm') && !rel.endsWith('.sqlite-wal')) out.push(rel);
    }
  };
  walk(root);
  return out.sort();
}
export function renderIntegrity(root) {
  return listReleaseFiles(root).map((rel) => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
    return `${hash}  ${rel}`;
  }).join('\n') + '\n';
}
