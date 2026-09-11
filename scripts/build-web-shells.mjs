import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'dist', 'public');
const assetsDir = path.join(outputDir, 'assets');
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });

const surfaces = [
    ['student', 'student-web', '学生端'],
    ['teacher', 'teacher-web', '教师课堂端'],
    ['display', 'display-web', '课堂大屏端'],
    ['observer', 'observer-web', '观察端'],
    ['backstage', 'backstage', '后台运维端'],
    ['authoring', 'presentation-studio', '备课创作端'],
    ['simulation', 'simulation-rehearsal', '模拟演练台'],
];

function readStyle(relativePath) {
    return `<style>${fs.readFileSync(path.join(root, relativePath), 'utf8')}</style>`;
}

function baseDocument(title, style, markup, script) {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} · Classroom Runtime</title>
  ${style}
</head>
<body>
  ${markup}
  <script type="importmap">{"imports":{"@classroom/surfaces":"/assets/packages/surfaces/src/index.js"}}</script>
  <script type="module">${script}</script>
</body>
</html>`;
}

function studentShell() {
    return baseDocument(
        '学生练习',
        readStyle('apps/student-web/src/student.css'),
        '<div id="student-root"></div><!-- R3.10 · 视觉与交互设计尚未冻结 -->',
        "import { mountStudentPractice } from '/assets/apps/student-web/src/entry.js'; mountStudentPractice(document.querySelector('#student-root'));"
    );
}

function studioShell() {
    return baseDocument(
        '备课创作',
        readStyle('apps/presentation-studio/src/studio.css'),
        '<div id="studio-root"></div><!-- 备课创作端 · D2 Alpha -->',
        "import { mountPresentationStudio } from '/assets/apps/presentation-studio/src/entry.js'; mountPresentationStudio(document.querySelector('#studio-root'));"
    );
}

function neutralShell({ app, label }) {
    const style = `<style>
      html, body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f5f6f8; color: #1f2328; }
      main { max-width: 760px; margin: 8vh auto; padding: 28px; background: white; border: 1px solid #ddd; border-radius: 12px; }
      code { background: #f1f3f5; padding: 2px 6px; border-radius: 4px; }
      .ok { font-weight: 600; }
    </style>`;
    const markup = `<main><h1>${label}</h1>
      <p>这是 R3.10 的可运行开发骨架，<strong>视觉与交互设计尚未冻结</strong>，后续单独进入 Design 阶段。</p>
      <p id="surface">正在加载 Surface Contract…</p><p id="server">正在检查课堂服务…</p></main>`;
    const script = `const app = await import('/assets/apps/${app}/src/entry.js');
      document.querySelector('#surface').innerHTML = 'Surface：<code>' + app.surface.surfaceId + '</code> · Runtime Profile：<code>' + app.runtimeBudget.profile + '</code>';
      try { const response = await fetch('/healthz'); const health = await response.json(); document.querySelector('#server').className = 'ok'; document.querySelector('#server').textContent = '课堂服务已连接 · ' + health.platform + '/' + health.arch; }
      catch { document.querySelector('#server').textContent = '课堂服务暂未连接'; }`;
    return baseDocument(label, style, markup, script);
}

function buildShell({ route, app, label }) {
    if (route === 'student')
        return studentShell();
    if (route === 'authoring')
        return studioShell();
    return neutralShell({ app, label });
}

function copyCompiledAsset(relativePath) {
    const source = path.join(root, 'dist', relativePath);
    const target = path.join(assetsDir, relativePath);
    if (!fs.existsSync(source))
        throw new Error(`Missing compiled browser asset: ${relativePath}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

copyCompiledAsset('packages/surfaces/src/index.js');
for (const [, app] of surfaces)
    copyCompiledAsset(`apps/${app}/src/entry.js`);
for (const [route, app, label] of surfaces) {
    const directory = path.join(outputDir, route);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), buildShell({ route, app, label }));
}
console.log('Neutral web surface shells built');
