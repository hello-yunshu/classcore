import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockPath = path.join(root, 'package-lock.json');
if (!fs.existsSync(lockPath)) {
    console.error('Lockfile check FAILED: package-lock.json missing');
    process.exit(1);
}
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const errors = [];
if (lock.lockfileVersion !== 3)
    errors.push(`lockfileVersion expected 3, got ${lock.lockfileVersion}`);
if (lock.name !== pkg.name || lock.version !== pkg.version)
    errors.push('root package identity mismatch');
const rootEntry = lock.packages?.[''];
if (!rootEntry)
    errors.push('missing root lock entry');
else {
    if (JSON.stringify(rootEntry.workspaces) !== JSON.stringify(pkg.workspaces))
        errors.push('workspace list mismatch');
    if (JSON.stringify(rootEntry.devDependencies) !== JSON.stringify(pkg.devDependencies))
        errors.push('root devDependencies mismatch');
    if (JSON.stringify(rootEntry.engines) !== JSON.stringify(pkg.engines))
        errors.push('root engines mismatch');
}
for (const pattern of pkg.workspaces) {
    const parent = path.join(root, pattern.slice(0, -2));
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const packageFile = path.join(parent, entry.name, 'package.json');
        if (!fs.existsSync(packageFile))
            continue;
        const workspace = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
        const relative = path.relative(root, path.dirname(packageFile)).replaceAll(path.sep, '/');
        if (!lock.packages?.[relative])
            errors.push(`missing workspace lock entry: ${relative}`);
        const link = lock.packages?.[`node_modules/${workspace.name}`];
        if (!link?.link || link.resolved !== relative)
            errors.push(`missing workspace link: ${workspace.name}`);
    }
}
const ts = lock.packages?.['node_modules/typescript'];
if (ts?.version !== pkg.devDependencies.typescript)
    errors.push('TypeScript lock version mismatch');
if (!ts?.integrity?.startsWith('sha512-'))
    errors.push('TypeScript integrity missing');
for (const nativePackage of [
    '@typescript/typescript-darwin-arm64',
    '@typescript/typescript-linux-arm64',
    '@typescript/typescript-linux-x64',
]) {
    const entry = lock.packages?.[`node_modules/${nativePackage}`];
    if (ts?.optionalDependencies?.[nativePackage] !== pkg.devDependencies.typescript) {
        errors.push(`TypeScript optional dependency missing from package metadata: ${nativePackage}`);
    }
    if (entry?.version !== pkg.devDependencies.typescript || !entry?.integrity?.startsWith('sha512-')) {
        errors.push(`required platform compiler lock entry missing/invalid: ${nativePackage}`);
    }
}
if (errors.length) {
    console.error('Lockfile check FAILED');
    errors.forEach((error) => console.error(' -', error));
    process.exit(1);
}
console.log('Lockfile check PASSED');

