import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const runtimeScopeDir = path.join(distDir, 'node_modules', '@classroom');
fs.mkdirSync(runtimeScopeDir, { recursive: true });
for (const directory of fs.readdirSync(path.join(root, 'packages'), { withFileTypes: true })) {
    if (!directory.isDirectory())
        continue;
    const sourcePackagePath = path.join(root, 'packages', directory.name, 'package.json');
    if (!fs.existsSync(sourcePackagePath))
        continue;
    const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, 'utf8'));
    if (typeof sourcePackage.name !== 'string' || !sourcePackage.name.startsWith('@classroom/')) {
        continue;
    }
    const compiledPackageDir = path.join(distDir, 'packages', directory.name);
    fs.mkdirSync(compiledPackageDir, { recursive: true });
    const runtimePackage = {
        name: sourcePackage.name,
        version: sourcePackage.version,
        type: 'module',
        exports: {
            '.': {
                types: './src/index.d.ts',
                default: './src/index.js',
            },
        },
        types: './src/index.d.ts',
    };
    fs.writeFileSync(path.join(compiledPackageDir, 'package.json'), JSON.stringify(runtimePackage, null, 2) + '\n');
    const runtimePackageDir = path.join(runtimeScopeDir, sourcePackage.name.slice('@classroom/'.length));
    fs.rmSync(runtimePackageDir, { recursive: true, force: true });
    fs.cpSync(compiledPackageDir, runtimePackageDir, { recursive: true });
}
console.log('Dist workspace runtime copies ready');

