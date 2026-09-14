import assert from 'node:assert/strict';
const root = new URL('../dist/', import.meta.url);
const checks = [
    ['apps/student-web/src/entry.js', 'student'], ['apps/teacher-web/src/entry.js', 'teacher-runtime'],
    ['apps/display-web/src/entry.js', 'display'], ['apps/observer-web/src/entry.js', 'observer'],
    ['apps/backstage/src/entry.js', 'backstage'], ['apps/simulation-rehearsal/src/entry.js', 'simulation-rehearsal'],
];
for (const [file, surfaceId] of checks) {
    const mod = await import(new URL(file, root));
    assert.equal(mod.surface?.surfaceId, surfaceId, file);
}
const server = await import(new URL('apps/server/src/entry.js', root));
assert.ok(server.servicePlane['classroom-server-host']);
console.log('Dist runtime resolution check PASSED');
import fs from 'node:fs';
const publicRoot = new URL('../dist/public/', import.meta.url);
for (const [file] of checks) {
    const publicFile = new URL(`assets/${file}`, publicRoot);
    assert.equal(fs.existsSync(publicFile), true, `missing public browser asset ${file}`);
}
assert.equal(fs.existsSync(new URL('assets/apps/presentation-studio/bundle.js', publicRoot)), true, 'presentation studio bundle missing');
assert.equal(fs.existsSync(new URL('assets/presentation-webppt-blank.pptx', publicRoot)), true, 'web-ppt blank template missing');
assert.equal(fs.existsSync(new URL('assets/fonts/LXGWWenKaiGBLite-Regular.ttf', publicRoot)), true, 'bundled presentation font missing');
assert.equal(fs.existsSync(new URL('assets/fonts/LXGWWenKaiGBLite-OFL.txt', publicRoot)), true, 'bundled presentation font license missing');
assert.equal(fs.existsSync(new URL('assets/fonts/NotoSerif-Variable.ttf', publicRoot)), true, 'bundled serif fallback font missing');
assert.equal(fs.existsSync(new URL('assets/fonts/NotoSerif-OFL.txt', publicRoot)), true, 'bundled serif fallback font license missing');
assert.equal(fs.existsSync(new URL('assets/apps/server/src/entry.js', publicRoot)), false, 'server entry must not be public');
console.log('Public asset isolation check PASSED');
