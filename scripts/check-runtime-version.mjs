import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
function fail(message) {
    console.error(`Runtime version check FAILED: ${message}`);
    process.exit(2);
}
const toolchain = JSON.parse(fs.readFileSync(new URL('../config/toolchain.json', import.meta.url), 'utf8'));
const expectedNode = toolchain.runtime.node;
const actualNode = process.versions.node;
if (actualNode !== expectedNode) {
    fail(`Node ${expectedNode} required, current ${actualNode}. Run npm run doctor for setup guidance.`);
}
let actualNpm;
try {
    actualNpm = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
}
catch {
    fail('npm executable not available');
}
const expectedNpm = toolchain.packageManager.version;
if (actualNpm !== expectedNpm) {
    fail(`npm ${expectedNpm} required, current ${actualNpm}. Use the npm bundled with the selected Node LTS.`);
}
console.log(`Runtime version check PASSED: Node ${actualNode}; npm ${actualNpm}`);

