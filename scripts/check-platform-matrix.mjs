import fs from 'node:fs';
function fail(message) {
    console.error(`Platform matrix check FAILED: ${message}`);
    process.exit(2);
}
const matrix = JSON.parse(fs.readFileSync(new URL('../deploy/platform-matrix.json', import.meta.url), 'utf8'));
const toolchain = JSON.parse(fs.readFileSync(new URL('../config/toolchain.json', import.meta.url), 'utf8'));
if (matrix.policy !== 'cross-architecture')
    fail('must remain cross-architecture');
if (matrix.currentPublicLesson?.requiredServerTarget !== 'linux/arm64')
    fail('current public lesson must require linux/arm64');
const targets = new Map((matrix.serverTargets ?? []).map((target) => [target.platform, target]));
if (targets.get('linux/arm64')?.status !== 'required-current')
    fail('linux/arm64 current requirement missing');
if (!targets.has('linux/amd64'))
    fail('linux/amd64 compatibility target missing');
if (matrix.browserClients?.policy !== 'capability-driven-not-cpu-whitelist')
    fail('browser clients must stay capability-driven');
if (matrix.runtime?.productionNodeLine !== toolchain.runtime.line)
    fail('platform matrix Node line must match central toolchain');
if (matrix.runtime?.productionNodeVersion !== toolchain.runtime.node)
    fail('platform matrix Node version must match central toolchain');
const dockerfile = fs.readFileSync(new URL('../deploy/docker/Dockerfile.server', import.meta.url), 'utf8');
if (/--platform=linux\/amd64/i.test(dockerfile))
    fail('Dockerfile must not force amd64');
if (!dockerfile.includes(`ARG NODE_VERSION=${toolchain.runtime.node}`))
    fail('Dockerfile Node version must match config/toolchain.json');
if (!/FROM node:\$\{NODE_VERSION\}-bookworm-slim/.test(dockerfile))
    fail('Dockerfile must consume NODE_VERSION ARG');
if (/skeleton only/i.test(dockerfile) || /process\.exit\(2\)/.test(dockerfile))
    fail('Dockerfile must start executable server');
if (!/server\.mjs/.test(dockerfile))
    fail('Dockerfile server CMD missing');
const compose = fs.readFileSync(new URL('../deploy/docker/docker-compose.example.yml', import.meta.url), 'utf8');
if (/^\s*platform:\s*linux\/amd64\s*$/im.test(compose))
    fail('Compose must not force amd64');
if (!/127\.0\.0\.1:8788:8788/.test(compose))
    fail('Reference local tools must be loopback-only on 127.0.0.1:8788');
if (!/127\.0\.0\.1:8787:8787/.test(compose))
    fail('Reference classroom endpoint must be loopback-only before authenticated D7 runtime exists');
const d7ComposeUrl = new URL('../deploy/docker/docker-compose.d7.yml', import.meta.url);
if (!fs.existsSync(d7ComposeUrl)) fail('missing dedicated authenticated D7 Compose file');
const d7Compose = fs.readFileSync(d7ComposeUrl, 'utf8');
if (!/CLASSROOM_RUNTIME_MODE:.*authenticated-classroom-server/.test(d7Compose)) fail('D7 Compose must explicitly request authenticated classroom runtime');
if (!/CLASSROOM_AUTHENTICATION:.*true/.test(d7Compose)) fail('D7 Compose must explicitly require authentication');
if (!/CLASSROOM_PRODUCT_READY:.*true/.test(d7Compose)) fail('D7 Compose must explicitly require product readiness');
if (!/\"8787:8787\"/.test(d7Compose)) fail('D7 classroom Compose must publish LAN port 8787');
if (!/127\.0\.0\.1:8788:8788/.test(d7Compose)) fail('D7 local-tools port must remain loopback-only');
if (!/npm ci/.test(dockerfile) || /npm install/.test(dockerfile))
    fail('Dockerfile must use reproducible npm ci, not npm install');
const buildCurrentUrl = new URL('../deploy/docker/build-current.sh', import.meta.url);
if (!fs.existsSync(buildCurrentUrl))
    fail('missing current-architecture build script');
const buildCurrent = fs.readFileSync(buildCurrentUrl, 'utf8');
if (!/uname -m/.test(buildCurrent) || !/linux\/arm64/.test(buildCurrent) || !/linux\/amd64/.test(buildCurrent)) {
    fail('current build script must auto-map both arm64 and amd64 hosts');
}
if (!/--build-arg "NODE_VERSION=\$\{NODE_VERSION\}"/.test(buildCurrent)) {
    fail('current build script must pass central Node version into Docker build');
}
console.log('Platform matrix check PASSED');
