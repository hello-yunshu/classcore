import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const canonical = [
    'AGENTS.md',
    'CODEX-HANDOFF.md',
    'README.md',
    'docs/README.md',
    'docs/development/MASTER-DEVELOPMENT-PLAN.md',
    'docs/development/RELEASE-GATES.md',
    'docs/development/NEW-PUBLIC-LESSON-GUIDE.md',
    'docs/development/CONTRACT-CORRECTNESS-CR3.md',
    'docs/development/FRONTEND-DESIGN-BOUNDARY.md',
    'docs/deployment/PLATFORM-ARCHITECTURE-MATRIX.md',
    'docs/deployment/DOCKER-RUNTIME-BASELINE.md',
];
const errors = [];
for (const relative of canonical)
    if (!fs.existsSync(path.join(root, relative)))
        errors.push(`missing canonical doc: ${relative}`);
function walk(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (['node_modules', 'dist', '.venv'].includes(entry.name))
            continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory())
            files.push(...walk(absolute));
        else if (entry.name.endsWith('.md'))
            files.push(absolute);
    }
    return files;
}
for (const file of walk(root)) {
    const relativeFile = path.relative(root, file).replaceAll(path.sep, '/');
    if (relativeFile.startsWith('docs/contracts/v0.1.2/'))
        continue; // Frozen historical contracts may reference archived closure docs.
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/`(docs\/[A-Za-z0-9_./-]+\.(?:md|json))`/g)) {
        if (!fs.existsSync(path.join(root, match[1])))
            errors.push(`${relativeFile}: missing ${match[1]}`);
    }
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
        const ref = match[1];
        if (/^[a-z]+:/i.test(ref) || ref.startsWith('#'))
            continue;
        const target = path.resolve(path.dirname(file), ref);
        if (!fs.existsSync(target))
            errors.push(`${relativeFile}: broken link ${ref}`);
    }
}
if (errors.length) {
    console.error('Documentation check FAILED');
    errors.forEach((error) => console.error(' -', error));
    process.exit(1);
}
console.log('Documentation check PASSED');

