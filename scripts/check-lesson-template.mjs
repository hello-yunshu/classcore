import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { renderLessonTemplate } from './lib/lesson-template.mjs';
import { validateLessonPackageDirectory } from './lib/lesson-package-validator.mjs';
import { validateLessonPackageWithFormalSchemas } from './lib/formal-lesson-validator.mjs';
const root = process.cwd();
const template = path.join(root, 'templates', 'public-lesson-starter');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'public-lesson-template-'));
const target = path.join(tmpRoot, 'template-check');
try {
    renderLessonTemplate(template, target, 'template-check', '模板检查课程');
    const structural = validateLessonPackageDirectory(target);
    assert.equal(structural.valid, true, structural.errors.join('; '));
    const formal = validateLessonPackageWithFormalSchemas(target);
    assert.equal(formal.valid, true, formal.stderr || formal.stdout);
    assert.equal(structural.lesson.lessonId, 'lesson:template-check');
    assert.equal(structural.lesson.title, '模板检查课程');
    assert.equal(structural.manifest.packageId, 'lesson-package:template-check');
    console.log('Public lesson template formal check PASSED');
}
finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
}

