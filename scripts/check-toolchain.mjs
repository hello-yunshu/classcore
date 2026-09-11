import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pythonExecutable } from './lib/python-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const config = readJson(path.join(root, 'config', 'toolchain.json'));
const pkg = readJson(path.join(root, 'package.json'));

function fail(message) {
  console.error(`Toolchain check FAILED: ${message}`);
  process.exit(2);
}
function exact(actual, expected, label) {
  if (actual !== expected) fail(`${label} expected ${expected}, got ${actual}`);
}

exact(pkg.packageManager, `npm@${config.packageManager.version}`, 'packageManager');
exact(pkg.devDependencies?.typescript, config.compiler.typescript, 'package.json TypeScript');
exact(fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim(), config.runtime.node, '.nvmrc');
exact(fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim(), config.runtime.node, '.node-version');
exact(process.versions.node, config.runtime.node, 'Node.js');
const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
exact(npmVersion, config.packageManager.version, 'npm');

const localTsc = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
if (!fs.existsSync(localTsc)) fail('local TypeScript missing; run npm ci or npm run bootstrap');
const tscVersion = execFileSync(localTsc, ['--version'], { encoding: 'utf8' }).trim();
exact(tscVersion, `Version ${config.compiler.typescript}`, 'TypeScript');

const python = pythonExecutable();
if (!python || !python.includes(`${path.sep}.venv${path.sep}`)) fail('project .venv missing; run npm run bootstrap');

const requirements = fs.readFileSync(path.join(root, 'requirements-dev.txt'), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const match = line.match(/^([A-Za-z0-9_.-]+)==([^\s]+)$/);
    if (!match) fail(`requirements-dev.txt must use unconditional exact pins: ${line}`);
    return { name: match[1], version: match[2] };
  });

const pythonProbe = `
import importlib.metadata as m, json, platform, sys
reqs = json.loads(sys.argv[1])
out = {'python': platform.python_version()}
for r in reqs:
    try:
        out[r['name']] = m.version(r['name'])
    except m.PackageNotFoundError:
        out[r['name']] = None
print(json.dumps(out))
`;
let installed;
try {
  installed = JSON.parse(execFileSync(python, ['-c', pythonProbe, JSON.stringify(requirements)], { encoding: 'utf8' }));
} catch (error) {
  fail(`cannot inspect pinned Python validation packages: ${error instanceof Error ? error.message : String(error)}`);
}
for (const req of requirements) {
  if (!(req.name in installed)) continue;
  exact(installed[req.name], req.version, `Python ${req.name}`);
}
exact(installed.jsonschema, config.python.jsonschema, 'Python jsonschema');
exact(installed.python, config.python.version, 'Python');

console.log(`Toolchain check PASSED: Node ${config.runtime.node}, npm ${config.packageManager.version}, TypeScript ${config.compiler.typescript}; Python validation pins exact`);
