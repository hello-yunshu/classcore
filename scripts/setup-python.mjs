import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot } from './lib/python-runtime.mjs';
const venv = path.join(projectRoot, '.venv');
const systemPython = process.platform === 'win32' ? 'python' : 'python3';
function run(command, args) {
    const result = spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit' });
    if (result.status !== 0)
        process.exit(result.status ?? 1);
}
if (!fs.existsSync(venv)) {
    console.log('创建 Python 虚拟环境 .venv ...');
    run(systemPython, ['-m', 'venv', '.venv']);
}
const python = process.platform === 'win32'
    ? path.join(venv, 'Scripts', 'python.exe')
    : path.join(venv, 'bin', 'python3');
run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements-dev.txt']);
console.log('Python formal-validation environment ready');

