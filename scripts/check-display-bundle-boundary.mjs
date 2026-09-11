import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const bundle = path.join(root, 'dist', 'public', 'assets', 'apps', 'display-web', 'bundle.js');
if (!fs.existsSync(bundle)) throw new Error('display-bundle-missing');
const source = fs.readFileSync(bundle, 'utf8');
const forbidden = [
    '@web-ppt/editor',
    '@web-ppt/edit-core',
    'openEditor',
    'createWebPptAdapter',
];
const violations = forbidden.filter(token => source.includes(token));
if (violations.length) {
    console.error(`Display bundle boundary FAILED: ${violations.join(', ')}`);
    process.exit(1);
}
console.log('Display bundle boundary PASSED: playback-only bundle excludes authoring dependencies');
