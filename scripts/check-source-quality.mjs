import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const include = new Set(['.ts', '.mjs', '.json', '.yml', '.yaml']);
const ignore = new Set(['package-lock.json']);
const errors = [];
function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (['node_modules', 'dist', '.venv', '.git'].includes(entry.name))
            continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory())
            walk(absolute);
        else if (include.has(path.extname(entry.name)) && !ignore.has(entry.name))
            check(absolute);
    }
}
function check(file) {
    const relative = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    if (!text.endsWith('\n'))
        errors.push(`${relative}: missing final newline`);
    if (/\r\n/.test(text))
        errors.push(`${relative}: CRLF detected`);
    text.split('\n').forEach((line, index) => {
        if (/[ \t]+$/.test(line))
            errors.push(`${relative}:${index + 1}: trailing whitespace`);
        if ((file.endsWith('.ts') || file.endsWith('.mjs')) && line.length > 360)
            errors.push(`${relative}:${index + 1}: source line exceeds 360 characters; split it for reviewability`);
    });
}
walk(root);
if (errors.length) {
    console.error('Source quality check FAILED');
    errors.slice(0, 100).forEach((error) => console.error(' -', error));
    process.exit(1);
}
console.log('Source quality check PASSED');

