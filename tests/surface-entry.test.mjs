import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const entries = [
    ['student-web', 'student'],
    ['teacher-web', 'teacher-runtime'],
    ['display-web', 'display'],
    ['observer-web', 'observer'],
    ['backstage', 'backstage'],
    ['presentation-studio', 'authoring-studio'],
    ['simulation-rehearsal', 'simulation-rehearsal'],
];
test('all six product surfaces plus engineering surface have typed source entries', () => {
    for (const [app, surfaceId] of entries) {
        const url = new URL(`../apps/${app}/src/entry.ts`, import.meta.url);
        assert.equal(fs.existsSync(url), true, `${app} 缺少 src/entry.ts`);
        const source = fs.readFileSync(url, 'utf8');
        assert.match(source, new RegExp(`getSurfaceDescriptor\\(['\"]${surfaceId}['\"]\\)`));
        assert.match(source, /@classroom\/surfaces/);
    }
});
test('server host entry exposes Service Plane source boundary', () => {
    const url = new URL('../apps/server/src/entry.ts', import.meta.url);
    const source = fs.readFileSync(url, 'utf8');
    assert.match(source, /SERVICE_PLANE/);
    assert.match(source, /@classroom\/surfaces/);
});

