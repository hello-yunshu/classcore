import path from 'node:path';
import process from 'node:process';
import { validateLessonPackageDirectory } from './lib/lesson-package-validator.mjs';
import { validateLessonPackageWithFormalSchemas } from './lib/formal-lesson-validator.mjs';
if (!process.argv[2]) {
    console.error('用法: npm run lesson:validate -- lessons/<lesson-slug>');
    process.exit(2);
}
const directory = path.resolve(process.argv[2]);
const structural = validateLessonPackageDirectory(directory);
if (!structural.valid) {
    console.error('Lesson package structural/semantic validation FAILED');
    for (const error of structural.errors)
        console.error(' -', error);
    process.exit(1);
}
let formal;
try {
    formal = validateLessonPackageWithFormalSchemas(directory);
}
catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('提示：首次 checkout 请先运行 npm run bootstrap');
    process.exit(2);
}
if (formal.stdout)
    process.stdout.write(formal.stdout);
if (formal.stderr)
    process.stderr.write(formal.stderr);
if (!formal.valid)
    process.exit(formal.status);
console.log(`Lesson package validation PASSED: ${structural.manifest.packageId}`);

