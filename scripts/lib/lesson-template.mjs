import fs from 'node:fs';
import path from 'node:path';

function substitute(value, replacements) {
  if (typeof value === 'string') {
    let result = value;
    for (const [token, replacement] of replacements) result = result.replaceAll(token, replacement);
    return result;
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item, replacements)]));
  }
  return value;
}

export function renderLessonTemplate(source, target, slug, title) {
  fs.cpSync(source, target, { recursive: true });
  const replacements = [['__SLUG__', slug], ['__TITLE__', title]];

  for (const file of ['lesson.json', 'package.manifest.json']) {
    const targetFile = path.join(target, file);
    if (!fs.existsSync(targetFile)) continue;
    const parsed = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    fs.writeFileSync(targetFile, `${JSON.stringify(substitute(parsed, replacements), null, 2)}\n`);
  }

  const readme = path.join(target, 'README.md');
  if (fs.existsSync(readme)) {
    let text = fs.readFileSync(readme, 'utf8');
    for (const [token, replacement] of replacements) text = text.replaceAll(token, replacement);
    fs.writeFileSync(readme, text);
  }
}
