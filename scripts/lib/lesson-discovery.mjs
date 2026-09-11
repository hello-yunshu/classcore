import fs from 'node:fs';
import path from 'node:path';

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function discoverLessonPackages(root, parents = ['examples', 'lessons']) {
  const packages = [];
  const errors = [];
  for (const parent of parents) {
    const base = path.resolve(root, parent);
    if (!fs.existsSync(base)) continue;
    const realBase = fs.realpathSync.native(base);
    const visit = (directory) => {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) {
          errors.push(`${path.relative(root, absolute)}: symlink is not allowed under lesson discovery roots`);
          continue;
        }
        if (entry.isDirectory()) visit(absolute);
      }
      const manifest = path.join(directory, 'package.manifest.json');
      if (!fs.existsSync(manifest)) return;
      const realDirectory = fs.realpathSync.native(directory);
      if (!isInside(realBase, realDirectory)) {
        errors.push(`${path.relative(root, directory)}: real path escapes ${parent}`);
        return;
      }
      packages.push(realDirectory);
    };
    visit(base);
  }
  packages.sort();
  for (let i = 0; i < packages.length; i += 1) {
    for (let j = 0; j < packages.length; j += 1) {
      if (i === j) continue;
      const rel = path.relative(packages[i], packages[j]);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        errors.push(`nested lesson package roots are ambiguous: ${path.relative(root, packages[i])} contains ${path.relative(root, packages[j])}`);
      }
    }
  }
  return { packages: [...new Set(packages)], errors: [...new Set(errors)] };
}
