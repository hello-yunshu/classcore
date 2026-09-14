import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const requiredFiles = [
  'AGENTS.md',
  'CODEX-HANDOFF.md',
  'README.md',
  '.env.example',
  '.npmrc',
  '.editorconfig',
  '.gitattributes',
  'package-lock.json',
  'requirements-dev.txt',
  'FOUNDATION-SHA256SUMS',
  'SHA256SUMS',
  'config/toolchain.json',
  'config/d7-release-readiness.json',
  'deploy/platform-matrix.json',
  'deploy/docker/Dockerfile.server',
  'deploy/docker/docker-compose.example.yml',
  'deploy/docker/docker-compose.d7.yml',
  'scripts/docker-release-gate.mjs',
  'scripts/docker-d7-gate.mjs',
  'scripts/check-d7-product-readiness.mjs',
  'scripts/check-workspace-boundaries.mjs',
  'scripts/check-lesson-boundaries.mjs',
  'config/lesson-boundaries.json',
  'docs/deployment/CLASSROOM-LAN-REHEARSAL.md',
  'CR11-RELEASE-ASSURANCE-CLOSURE-REPORT.md',
  'R3.10-COMPLETE-AUDIT.md',
  'config/private-identity-mutation-corpus.json',
  'config/private-identity-policy.json',
  'docs/development/CONTRACT-CORRECTNESS-CR3.md',
];
for (const rel of requiredFiles) {
  if (!fs.existsSync(path.join(root, rel))) errors.push(`missing handoff file: ${rel}`);
}
for (const legacy of ['CR6-HARDENING-REPORT.md', 'CR7-HARDENING-REPORT.md', 'R3.5-COMPLETE-AUDIT.md', 'CR8-VALIDATION-CLOSURE-REPORT.md', 'R3.7-COMPLETE-AUDIT.md', 'R3.6-COMPLETE-AUDIT.md', 'CR9-CORRECTIVE-CLOSURE-REPORT.md', 'R3.8-COMPLETE-AUDIT.md']) {
  if (fs.existsSync(path.join(root, legacy))) errors.push(`legacy root report must be removed: ${legacy}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.classroomRuntime?.roadmapRevision !== 'R3.10') errors.push('package roadmapRevision must be R3.10');
if (pkg.classroomRuntime?.contractCorrectnessRevision !== 'CR11') errors.push('package contractCorrectnessRevision must be CR11');
const requiredScripts = ['doctor', 'bootstrap', 'foundation:check', 'docker:gate', 'release:check', 'release:d7', 'd7:product', 'policy:check', 'integrity:check', 'workspace:check', 'lesson-boundary:check'];
if (requiredScripts.some((script) => !pkg.scripts?.[script])) {
  errors.push('doctor/bootstrap/foundation:check/docker:gate/release:check/release:d7/d7:product/policy:check/integrity:check/workspace:check/lesson-boundary:check scripts are required');
}
if (!String(pkg.scripts?.test ?? '').includes('npm run build')) errors.push('npm test must build from a clean checkout before unit tests');
if (!String(pkg.scripts?.['server:dev'] ?? '').includes('--env-file-if-exists=.env')) errors.push('server:dev must load optional .env without requiring it');
if (!String(pkg.scripts?.['server:dev'] ?? '').includes('npm run build')) errors.push('server:dev must build browser/runtime assets before starting');

const npmrc = fs.readFileSync(path.join(root, '.npmrc'), 'utf8');
if (!/^engine-strict=true$/m.test(npmrc)) errors.push('.npmrc must enforce engine-strict=true');
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
if (!/^PORT=9602$/m.test(envExample) || !/^LOCAL_TOOLS_PORT=9688$/m.test(envExample)) {
  errors.push('.env.example must document classroom 9602 and local tools 9688');
}

const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
for (const token of ['Foundation v0.1.2', '稳定性', 'CODEX-HANDOFF.md', 'npm run bootstrap']) {
  if (!agents.includes(token)) errors.push(`AGENTS.md missing required guidance: ${token}`);
}
const handoff = fs.readFileSync(path.join(root, 'CODEX-HANDOFF.md'), 'utf8');
for (const token of ['R3.10', 'D2', 'D7', 'D21', 'linux/arm64', 'TransformBoard', 'exact-set', 'd7:product']) {
  if (!handoff.includes(token)) errors.push(`CODEX-HANDOFF.md missing current-state token: ${token}`);
}

const compose = fs.readFileSync(path.join(root, 'deploy/docker/docker-compose.example.yml'), 'utf8');
if (!/127\.0\.0\.1:9688:9688/.test(compose)) errors.push('Local tools Docker port must be host-only: 127.0.0.1:9688:9688');
if (!/127\.0\.0\.1:9602:9602/.test(compose)) errors.push('reference classroom Docker port must be loopback-only: 127.0.0.1:9602:9602');
const d7Compose = fs.readFileSync(path.join(root, 'deploy/docker/docker-compose.d7.yml'), 'utf8');
if (!/CLASSROOM_RUNTIME_MODE:.*authenticated-classroom-server/.test(d7Compose)) errors.push('D7 Compose must explicitly request authenticated classroom runtime');
if (!/CLASSROOM_AUTHENTICATION:.*true/.test(d7Compose)) errors.push('D7 Compose must explicitly require authentication');
if (!/CLASSROOM_PRODUCT_READY:.*true/.test(d7Compose)) errors.push('D7 Compose must explicitly require product readiness');
if (!/\"9602:9602\"/.test(d7Compose)) errors.push('authenticated D7 Compose must publish classroom LAN port 9602');
const dockerfile = fs.readFileSync(path.join(root, 'deploy/docker/Dockerfile.server'), 'utf8');
if (!/npm ci/.test(dockerfile)) errors.push('Dockerfile must use npm ci');
if (/npm install/.test(dockerfile)) errors.push('Dockerfile must not use npm install');
if (!/^USER node$/m.test(dockerfile)) errors.push('Docker runtime must use non-root node user');

const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
if (!workflow.includes('ubuntu-24.04-arm')) errors.push('CI must include native Linux arm64 runner');
if (!workflow.includes('native-arm64-docker-build')) errors.push('CI must include native arm64 Docker build gate');
if (!workflow.includes('npm run docker:gate')) errors.push('ARM64 CI must actually run the reference container/restart gate');

const serverSource = fs.readFileSync(path.join(root, 'apps/server/runtime/server.mjs'), 'utf8');
if (!serverSource.includes("process.env.HOST ?? '127.0.0.1'")) errors.push('reference server must default classroom endpoint to loopback until authenticated LAN server is integrated');
const runtimeConfigIsRead = serverSource.includes("runtimeMode = process.env.CLASSROOM_RUNTIME_MODE ?? 'reference-transport'")
  && serverSource.includes("productReady = process.env.CLASSROOM_PRODUCT_READY === 'true'")
  && serverSource.includes("authentication = process.env.CLASSROOM_AUTHENTICATION === 'true'");
if (!runtimeConfigIsRead) errors.push('reference runtime must read and validate runtime identity configuration');
if (!serverSource.includes('unsupported-runtime-mode: authenticated-classroom-server is not implemented')) errors.push('reference runtime must fail closed when D7 runtime identity is requested before authentication exists');

if (errors.length) {
  console.error('Codex handoff check FAILED');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log('Codex handoff check PASSED');
