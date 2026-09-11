import { spawnSync } from 'node:child_process';
function run(command, args) {
    const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
    if (result.status !== 0)
        process.exit(result.status ?? 1);
}
console.log('1/4 环境检查');
run(process.execPath, ['scripts/doctor.mjs']);
console.log('2/4 安装 Node workspace 依赖（npm ci）');
run('npm', ['ci', '--no-audit', '--no-fund']);
console.log('3/4 建立 Python JSON Schema 验证环境');
run(process.execPath, ['scripts/setup-python.mjs']);
console.log('4/4 完整工程检查');
run('npm', ['run', 'check']);
console.log('Bootstrap PASSED：Codex/开发者可继续进入真实开发');

