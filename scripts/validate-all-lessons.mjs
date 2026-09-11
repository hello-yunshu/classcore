import { spawnSync } from 'node:child_process';
import { discoverLessonPackages } from './lib/lesson-discovery.mjs';
const root = process.cwd();
const discovered = discoverLessonPackages(root);
if (discovered.errors.length) {
  console.error('Lesson package discovery FAILED');
  for (const error of discovered.errors) console.error(` - ${error}`);
  process.exit(1);
}
for (const directory of discovered.packages) {
  const result = spawnSync(process.execPath, ['scripts/validate-lesson-package.mjs', directory], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`All lesson packages PASSED: ${discovered.packages.length}`);
