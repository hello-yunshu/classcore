import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageDirs = [];
for (const group of ['packages', 'apps']) {
  const base = path.join(root, group);
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(base, entry.name);
    if (fs.existsSync(path.join(dir, 'package.json'))) packageDirs.push(dir);
  }
}

const packages = new Map();
for (const dir of packageDirs) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (!pkg.name) throw new Error(`workspace missing name: ${path.relative(root, dir)}`);
  if (packages.has(pkg.name)) throw new Error(`duplicate workspace package name: ${pkg.name}`);
  packages.set(pkg.name, { dir, pkg });
}

const errors = [];
const adjacency = new Map([...packages.keys()].map((name) => [name, new Set()]));
let importCount = 0;

function sourceFiles(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(absolute));
    else if (/\.(?:ts|mjs|js)$/.test(entry.name)) out.push(absolute);
  }
  return out;
}

for (const [name, { dir, pkg }] of packages) {
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);
  for (const dependency of declared) {
    if (!dependency.startsWith('@classroom/')) continue;
    if (!packages.has(dependency)) errors.push(`${name}: declared internal dependency does not exist: ${dependency}`);
    else adjacency.get(name).add(dependency);
  }
  for (const file of sourceFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:from\s+|import\s*\()(['"])(@classroom\/[^'"/]+)\1/g)) {
      importCount += 1;
      const dependency = match[2];
      if (dependency === name) continue;
      if (!packages.has(dependency)) errors.push(`${path.relative(root, file)}: imports unknown internal package ${dependency}`);
      else if (!declared.has(dependency)) errors.push(`${path.relative(root, file)}: imports undeclared internal dependency ${dependency}`);
    }
  }
}

const visited = new Set();
const visiting = new Set();
const stack = [];
function visit(name) {
  if (visiting.has(name)) {
    const start = stack.indexOf(name);
    errors.push(`workspace dependency cycle: ${[...stack.slice(start), name].join(' -> ')}`);
    return;
  }
  if (visited.has(name)) return;
  visiting.add(name);
  stack.push(name);
  for (const dependency of adjacency.get(name) ?? []) visit(dependency);
  stack.pop();
  visiting.delete(name);
  visited.add(name);
}
for (const name of packages.keys()) visit(name);

if (errors.length) {
  console.error('Workspace boundary check FAILED');
  [...new Set(errors)].forEach((error) => console.error(` - ${error}`));
  process.exit(1);
}
const edgeCount = [...adjacency.values()].reduce((sum, set) => sum + set.size, 0);
console.log(`Workspace boundary check PASSED: ${packages.size} workspaces, ${edgeCount} internal dependency edges, ${importCount} internal imports`);
