import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderLessonTemplate } from '../scripts/lib/lesson-template.mjs';
import { validateLessonPackageWithFormalSchemas } from '../scripts/lib/formal-lesson-validator.mjs';
test('formal lesson validator rejects invalid Activity enum values', () => {
    const root = process.cwd();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-formal-negative-'));
    const target = path.join(tmp, 'bad-lesson');
    try {
        renderLessonTemplate(path.join(root, 'templates', 'public-lesson-starter'), target, 'bad-lesson', '反例课程');
        const activityPath = path.join(target, 'activities.json');
        const activities = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
        activities[0].participantMode = 'totally-invalid-mode';
        activities[0].submissionPolicy = 'definitely-invalid-policy';
        fs.writeFileSync(activityPath, `${JSON.stringify(activities, null, 2)}\n`);
        const result = validateLessonPackageWithFormalSchemas(target);
        assert.equal(result.valid, false);
        assert.match(result.stderr, /participantMode|submissionPolicy/);
    }
    finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('formal lesson validator rejects identity references hidden in presentation arrays and object keys', () => {
    const root = process.cwd();
    const fixture = path.join(root, 'examples', 'pattern-restoration');
    for (const mode of ['array', 'key', 'roster', 'class']) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-formal-identity-negative-'));
        const target = path.join(tmp, 'lesson');
        try {
            fs.cpSync(fixture, target, { recursive: true });
            const file = path.join(target, 'presentation.example.json');
            const presentation = JSON.parse(fs.readFileSync(file, 'utf8'));
            const parameters = presentation.classroomBindings[0].source.parameters;
            if (mode === 'array') parameters.targets = ['student:S17'];
            if (mode === 'key') parameters.byStudent = { 'student:S17': { score: 1 } };
            if (mode === 'roster') parameters.targetRoster = 'roster:17';
            if (mode === 'class') parameters.targetClass = 'class:5-5';
            fs.writeFileSync(file, `${JSON.stringify(presentation, null, 2)}\n`);
            const result = validateLessonPackageWithFormalSchemas(target);
            assert.equal(result.valid, false, mode);
            assert.match(result.stderr, /identity-specific binding reference/);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    }
});

test('formal lesson validator rejects identity references outside binding parameters', () => {
    const root = process.cwd();
    const fixture = path.join(root, 'examples', 'pattern-restoration');
    for (const mode of ['bindingId', 'selector', 'fallback']) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-formal-binding-negative-'));
        const target = path.join(tmp, 'lesson');
        try {
            fs.cpSync(fixture, target, { recursive: true });
            const file = path.join(target, 'presentation.example.json');
            const presentation = JSON.parse(fs.readFileSync(file, 'utf8'));
            const binding = presentation.classroomBindings[0];
            if (mode === 'bindingId') binding.bindingId = 'student:S17';
            if (mode === 'selector') binding.source.selector = 'student:S17';
            if (mode === 'fallback') binding.fallback = { type: 'static-text', text: 'roster:17' };
            fs.writeFileSync(file, `${JSON.stringify(presentation, null, 2)}\n`);
            const result = validateLessonPackageWithFormalSchemas(target);
            assert.equal(result.valid, false, mode);
            assert.match(result.stderr, /identity-specific binding reference/);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    }
});


test('formal lesson validator rejects embedded and multiply encoded identity references', () => {
    const root = process.cwd();
    const fixture = path.join(root, 'examples', 'pattern-restoration');
    for (const leaked of ['selected student:S17', 'student%253AS17', 'student&amp;#58;S17', 'student%255Cu003AS17']) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-formal-encoded-identity-'));
        const target = path.join(tmp, 'lesson');
        try {
            fs.cpSync(fixture, target, { recursive: true });
            const file = path.join(target, 'presentation.example.json');
            const presentation = JSON.parse(fs.readFileSync(file, 'utf8'));
            presentation.classroomBindings[0].source.parameters.debugLabel = leaked;
            fs.writeFileSync(file, `${JSON.stringify(presentation, null, 2)}\n`);
            const result = validateLessonPackageWithFormalSchemas(target);
            assert.equal(result.valid, false, leaked);
            assert.match(result.stderr, /identity-specific binding reference/);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    }
});
