import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'toolchain.json'), 'utf8'));
let hardFailures = 0;
function status(ok, label, detail = '') {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok)
        hardFailures++;
}
function info(label, detail) { console.log(`• ${label} — ${detail}`); }
status(process.versions.node === config.runtime.node, 'Node.js', `${process.versions.node}; 需要 ${config.runtime.node}`);
let npmVersion = 'unavailable';
try {
    npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
}
catch { }
status(npmVersion === config.packageManager.version, 'npm', `${npmVersion}; 需要 ${config.packageManager.version}`);
status(fs.existsSync(path.join(root, 'package-lock.json')), 'package-lock.json', 'clean checkout 使用 npm ci');
const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
const py = spawnSync(pythonCommand, ['--version'], { encoding: 'utf8' });
const pythonVersion = py.status === 0 ? (py.stdout || py.stderr).trim().replace(/^Python\s+/, '') : '';
status(py.status === 0 && pythonVersion === config.python.version, 'Python', py.status === 0 ? `${pythonVersion}; 需要 ${config.python.version}` : '未找到');
const venvPython = process.platform === 'win32'
    ? path.join(root, '.venv', 'Scripts', 'python.exe')
    : path.join(root, '.venv', 'bin', 'python3');
info('.venv', fs.existsSync(venvPython) ? '已建立' : '尚未建立；bootstrap 会创建');
info('node_modules', fs.existsSync(path.join(root, 'node_modules', 'typescript')) ? '已安装' : '尚未安装；bootstrap 会执行 npm ci');
const docker = spawnSync('docker', ['--version'], { encoding: 'utf8' });
info('Docker', docker.status === 0 ? docker.stdout.trim() : '当前不可用；本地源码开发可继续，D7 Apple Silicon Docker Gate 必须补验');
info('CPU / OS', `${process.platform}/${process.arch}`);
if (hardFailures) {
    console.error(`\nDoctor: ${hardFailures} 项基础条件未满足。先切换到 .nvmrc 指定 Node 和中央配置指定的 Python，再重新运行 npm run doctor。`);
    process.exit(2);
}
console.log('\nDoctor PASSED：可以运行 npm run bootstrap');
