import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import pptxgen from 'pptxgenjs';

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
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
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
        "import { mountPresentationStudio } from '/assets/apps/presentation-studio/bundle.js'; mountPresentationStudio(document.querySelector('#studio-root'));"
    );
}

function teacherShell() {
    return baseDocument(
        '我的课件',
        readStyle('apps/teacher-web/src/teacher.css'),
        '<div id="teacher-root"></div>',
        "import { mountTeacherLibrary } from '/assets/apps/teacher-web/src/entry.js'; mountTeacherLibrary(document.querySelector('#teacher-root'));"
    );
}

function displayShell() {
    const style = `<style>
      html,body{margin:0;min-width:320px;background:#101827;color:#f7f4ee;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
      .display-runtime{min-height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr) auto;padding:24px 32px;gap:18px}
      .display-header{display:flex;align-items:center;gap:14px}.display-mark{display:grid;place-items:center;width:42px;height:42px;border:1px solid #efb37e;color:#efb37e;font:700 24px Georgia,serif}
      .display-kicker{color:#efb37e;font-size:11px;letter-spacing:.18em}.display-header h1{margin:4px 0 0;font:500 30px Georgia,serif}.display-state{margin-left:auto;color:#b8c1d1;font-size:13px}
      .display-stage{display:grid;place-items:center;min-height:0;background:#182338;border:1px solid #34435c;box-shadow:0 24px 60px #090e18;border-radius:14px;overflow:hidden}.display-stage>*{width:min(100%,1200px);aspect-ratio:16/9}
      .display-empty{display:grid;place-items:center;align-content:center;gap:12px;color:#b8c1d1}.display-empty strong{font:500 40px Georgia,serif;color:#f7f4ee}.display-footer{color:#7e8ba1;font-size:12px;text-align:center}
      @media(max-width:680px){.display-runtime{padding:18px 14px}.display-header h1{font-size:24px}}
    </style>`;
    return baseDocument(
        '课堂大屏',
        style,
        '<div id="display-root"></div>',
        "import { mountDisplayRuntime } from '/assets/apps/display-web/bundle.js'; mountDisplayRuntime(document.querySelector('#display-root'));"
    );
}

async function buildPresentationBundle() {
    await bundle({
        entryPoints: [path.join(root, 'dist', 'apps', 'presentation-studio', 'src', 'entry.js')],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        sourcemap: false,
        outfile: path.join(assetsDir, 'apps', 'presentation-studio', 'bundle.js'),
        logLevel: 'warning',
    });
}

async function buildDisplayBundle() {
    await bundle({
        entryPoints: [path.join(root, 'dist', 'apps', 'display-web', 'src', 'entry.js')],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        sourcemap: false,
        outfile: path.join(assetsDir, 'apps', 'display-web', 'bundle.js'),
        logLevel: 'warning',
    });
}

async function buildBlankPresentationTemplate() {
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'ClassCore';
    pptx.subject = 'ClassCore web-ppt blank template';
    const slide = pptx.addSlide();
    slide.background = { color: 'F7F4EE' };
    slide.addText('ClassCore 网页 Presentation', {
        x: 1, y: 1, w: 8, h: 0.6, fontFace: 'Arial', fontSize: 24, color: '24324B',
    });
    await pptx.writeFile({ fileName: path.join(assetsDir, 'presentation-webppt-blank.pptx') });
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
    if (route === 'teacher')
        return teacherShell();
    if (route === 'display')
        return displayShell();
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
for (const [, app] of surfaces) {
    if (app !== 'presentation-studio')
        copyCompiledAsset(`apps/${app}/src/entry.js`);
}
await buildPresentationBundle();
await buildDisplayBundle();
await buildBlankPresentationTemplate();
for (const [route, app, label] of surfaces) {
    const directory = path.join(outputDir, route);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), buildShell({ route, app, label }));
}
console.log('Neutral web surface shells built');
