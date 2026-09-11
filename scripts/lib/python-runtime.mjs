import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function pythonExecutable() {
    const candidates = process.platform === 'win32'
        ? [path.join(root, '.venv', 'Scripts', 'python.exe'), 'python']
        : [path.join(root, '.venv', 'bin', 'python3'), path.join(root, '.venv', 'bin', 'python'), 'python3'];
    for (const candidate of candidates) {
        if (candidate.includes(path.sep) && !fs.existsSync(candidate))
            continue;
        const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
        if (probe.status === 0)
            return candidate;
    }
    return null;
}
export function runPython(args, options = {}) {
    const python = pythonExecutable();
    if (!python) {
        throw new Error('未找到 Python。请先安装 Python 3，并运行 npm run bootstrap。');
    }
    return spawnSync(python, args, { encoding: 'utf8', ...options });
}
export { root as projectRoot };

