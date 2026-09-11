import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { renderLessonTemplate } from './lib/lesson-template.mjs';
import { validateLessonPackageDirectory } from './lib/lesson-package-validator.mjs';
import { validateLessonPackageWithFormalSchemas } from './lib/formal-lesson-validator.mjs';
const [slug, title] = process.argv.slice(2);
if (!slug || !title) {
    console.error('用法: npm run lesson:new -- lesson-slug "课程标题"');
    process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error('lesson slug 只允许小写字母、数字和连字符');
    process.exit(2);
}
const root = process.cwd();
const source = path.join(root, 'templates', 'public-lesson-starter');
const target = path.join(root, 'lessons', slug);
if (fs.existsSync(target)) {
    console.error(`目标已存在: ${target}`);
    process.exit(1);
}
renderLessonTemplate(source, target, slug, title);
try {
    const structural = validateLessonPackageDirectory(target);
    if (!structural.valid)
        throw new Error(structural.errors.join('; '));
    const formal = validateLessonPackageWithFormalSchemas(target);
    if (!formal.valid)
        throw new Error(formal.stderr || formal.stdout || 'formal schema validation failed');
    console.log(`已创建并通过正式 Schema 校验: lessons/${slug}`);
}
catch (error) {
    fs.rmSync(target, { recursive: true, force: true });
    console.error('公开课模板生成后校验失败');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('提示：首次 checkout 请先运行 npm run bootstrap');
    process.exit(2);
}

