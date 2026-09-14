import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as bundle } from "esbuild";
import JSZip from "jszip";
import pptxgen from "pptxgenjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "dist", "public");
const assetsDir = path.join(outputDir, "assets");
const bundledPresentationFontSource = path.join(root, "packages", "presentation-webppt-adapter", "assets", "fonts");
const bundledPresentationFontTarget = path.join(assetsDir, "fonts");
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });

const surfaces = [
  ["student", "student-web", "学生端"],
  ["teacher", "teacher-web", "教师课堂端"],
  ["display", "display-web", "课堂大屏端"],
  ["observer", "observer-web", "观察端"],
  ["backstage", "backstage", "后台运维端"],
  ["authoring", "presentation-studio", "备课创作端"],
  ["simulation", "simulation-rehearsal", "模拟演练台"],
];

function readStyle(relativePath) {
  return `<style>${fs.readFileSync(path.join(root, relativePath), "utf8")}</style>`;
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
  <script type="importmap">{"imports":{"@classroom/applet-sdk":"/assets/packages/applet-sdk/src/index.js","@classroom/surfaces":"/assets/packages/surfaces/src/index.js","@classroom/transform-board":"/assets/packages/transform-board/src/index.js","@classroom/classroom-client":"/assets/packages/classroom-client/src/index.js"}}</script>
  <script type="module">${script}</script>
</body>
</html>`;
}

function presentationFontStyle() {
  return `<style>
      @font-face{font-family:"LXGW WenKai GB Lite";src:url("/assets/fonts/LXGWWenKaiGBLite-Regular.ttf") format("truetype");font-style:normal;font-weight:100 900;font-display:swap}
      @font-face{font-family:"霞鹜文楷 GB 轻便版";src:url("/assets/fonts/LXGWWenKaiGBLite-Regular.ttf") format("truetype");font-style:normal;font-weight:100 900;font-display:swap}
      @font-face{font-family:"楷体";src:url("/assets/fonts/LXGWWenKaiGBLite-Regular.ttf") format("truetype");font-style:normal;font-weight:100 900;font-display:swap}
      @font-face{font-family:"KaiTi";src:url("/assets/fonts/LXGWWenKaiGBLite-Regular.ttf") format("truetype");font-style:normal;font-weight:100 900;font-display:swap}
      @font-face{font-family:"楷体_GB2312";src:url("/assets/fonts/LXGWWenKaiGBLite-Regular.ttf") format("truetype");font-style:normal;font-weight:100 900;font-display:swap}
      @font-face{font-family:"Noto Serif";src:url("/assets/fonts/NotoSerif-Variable.ttf") format("truetype");font-style:normal;font-weight:100 900;font-display:swap}
      @font-face{font-family:"Times New Roman";src:url("/assets/fonts/NotoSerif-Variable.ttf") format("truetype");font-style:normal;font-weight:100 900;font-display:swap}
    </style>`;
}

function studentShell() {
  return baseDocument(
    "学生练习",
    readStyle("apps/student-web/src/student.css"),
    '<div id="student-root"></div><!-- R3.10 · 视觉与交互设计尚未冻结 -->',
    "import { mountStudent } from '/assets/apps/student-web/src/entry.js'; mountStudent(document.querySelector('#student-root'));",
  );
}

function studioShell() {
  return baseDocument(
    "备课创作",
    readStyle("apps/presentation-studio/src/studio.css") + presentationFontStyle(),
    '<div id="studio-root"></div><!-- 备课创作端 · D2 Alpha -->',
    "import { mountPresentationStudio } from '/assets/apps/presentation-studio/bundle.js'; mountPresentationStudio(document.querySelector('#studio-root'));",
  );
}

function teacherShell() {
  return baseDocument(
    "课堂控制台",
    readStyle("apps/teacher-web/src/teacher.css"),
    '<div id="teacher-root"></div>',
    "import { mountTeacherLibrary } from '/assets/apps/teacher-web/src/entry.js'; mountTeacherLibrary(document.querySelector('#teacher-root'));",
  );
}

function backstageShell() {
  return baseDocument(
    "课程准备台",
    readStyle("apps/backstage/src/backstage.css"),
    '<div id="backstage-root"></div>',
    "import { mountBackstage } from '/assets/apps/backstage/src/entry.js'; mountBackstage(document.querySelector('#backstage-root'));",
  );
}

function observerShell() {
  return baseDocument(
    "课堂观察",
    readStyle("apps/observer-web/src/observer.css"),
    '<div id="observer-root"></div>',
    "import { mountObserver } from '/assets/apps/observer-web/src/entry.js'; mountObserver(document.querySelector('#observer-root'));",
  );
}

function displayShell() {
  const style = presentationFontStyle() + `<style>
      :root { color-scheme: light; --ink: #24324b; --ink-soft: #697386; --muted: #7d8490; --line: #d9d6cc; --line-strong: #d2d0ca; --paper: #f6f3ec; --panel: #fbfaf7; --canvas: #e7e3d9; --focus: #5575b8; --focus-wash: #e3eaf7; --signal: #c96b55; --gold: #897e70; }
      *{box-sizing:border-box}
      html,body{margin:0;min-width:320px;background:var(--paper);color:var(--ink);font-family:"Avenir Next","PingFang SC",ui-sans-serif,system-ui,sans-serif}
      .display-runtime{min-height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr) auto;padding:24px 32px;gap:18px}
      .display-header{display:flex;align-items:center;gap:14px}.display-mark{display:grid;place-items:center;width:42px;height:42px;border:1px solid var(--signal);color:var(--signal);font:700 24px Georgia,serif}
      .display-kicker{color:var(--signal);font-size:11px;letter-spacing:.18em}.display-header h1{margin:4px 0 0;font:500 30px Georgia,serif}.display-state{margin-left:auto;color:var(--muted);font-size:13px}
      .display-stage{display:grid;place-items:center;min-height:0;background:var(--canvas);border:1px solid var(--line-strong);box-shadow:0 24px 60px rgba(110,102,86,.18);border-radius:14px;overflow:hidden}.display-stage>*{width:min(100%,1200px);height:auto;max-height:100%;aspect-ratio:var(--display-aspect-ratio,auto);object-fit:contain}
      .display-empty{display:grid;place-items:center;align-content:center;gap:12px;color:var(--muted)}.display-empty strong{font:500 40px Georgia,serif;color:var(--ink)}.display-footer{color:var(--muted);font-size:12px;text-align:center}
      .display-classroom{height:100vh;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto auto;padding:24px 32px;gap:14px;overflow:hidden}
      .display-classroom-stage{display:grid;place-items:center;align-content:center;gap:10px;min-height:0;overflow:auto;padding:18px 20px;background:linear-gradient(145deg,var(--ink),#3d5678);border:1px solid var(--ink);border-radius:14px;box-shadow:0 24px 60px rgba(36,50,75,.24);text-align:center}
      .display-classroom-stage [hidden]{display:none}
      .display-classroom-stage>[data-field="widget"]:empty,.display-classroom-stage>[data-field="live-board"]:empty,.display-classroom-stage>[data-field="artifact-content"]:empty,.display-classroom-stage>[data-field="annotation"]:empty{display:none}
      .display-classroom-stage strong{font:500 clamp(38px,6vw,82px) Georgia,serif;color:var(--paper)}.display-classroom-stage span{font-size:clamp(16px,2.2vw,28px);color:var(--focus-wash)}
      .display-classroom-stage .artifact-content{display:grid;gap:4px;width:min(90%,720px);padding:10px 14px;border:1px solid rgba(227,234,247,.42);border-radius:9px;font-size:13px;line-height:1.45;text-align:left}
      .display-classroom-stage .artifact-content strong{font:700 13px Inter, sans-serif}.display-classroom-stage .artifact-content span{font-size:13px}.display-classroom-stage em{min-height:24px;color:#f0d6cc;font-style:normal}
      .display-live-board{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:min(92%,860px)}.display-student-card{display:grid;gap:5px;padding:8px;border:1px solid rgba(227,234,247,.42);border-radius:8px;background:rgba(251,250,247,.96);color:var(--ink);text-align:left}
      .display-student-card strong{font:700 12px Inter,sans-serif}.display-student-card svg{display:block;width:100%;height:auto}
      .display-presentation-player{position:relative;display:grid;place-items:center;width:min(92%,980px,calc(46vh * 16 / 9));height:auto;aspect-ratio:var(--display-aspect-ratio,16 / 9)}.display-presentation-player>div{position:absolute;inset:0}.display-presentation-player>svg{display:block;width:100%;height:100%;object-fit:contain}
      .display-join-panel{display:grid;gap:9px;padding:11px 16px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:0 8px 24px rgba(110,102,86,.12)}
      .display-join-panel[hidden]{display:none}
      .display-join-heading{display:flex;align-items:baseline;justify-content:center;gap:12px}.display-join-heading strong{font:500 23px Georgia,serif}.display-join-heading span{color:var(--muted);font-size:12px}
      .display-join-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:840px;width:100%;margin:0 auto}.display-join-card{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto 1fr;column-gap:12px;align-items:center;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:#fff}
      .display-join-card canvas{grid-row:span 3;width:176px;height:176px;image-rendering:pixelated}.display-join-card strong{font-size:15px}.display-join-card span{color:var(--ink-soft);font-size:12px}.display-join-card code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:9px;max-width:100%}
      @media(max-width:680px){.display-runtime{padding:18px 14px}.display-header h1{font-size:24px}.display-classroom{padding:16px 14px;gap:12px}.display-join-heading{display:grid;gap:3px;text-align:center}.display-join-grid{grid-template-columns:1fr}.display-join-card canvas{width:96px;height:96px}}
    </style>`;
  return baseDocument(
    "课堂大屏",
    style,
    '<div id="display-root"></div>',
    "import { mountDisplayRuntime } from '/assets/apps/display-web/bundle.js'; mountDisplayRuntime(document.querySelector('#display-root'));",
  );
}

async function buildPresentationBundle() {
  await bundle({
    entryPoints: [path.join(root, "dist", "apps", "presentation-studio", "src", "entry.js")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    sourcemap: false,
    outfile: path.join(assetsDir, "apps", "presentation-studio", "bundle.js"),
    logLevel: "warning",
  });
}

async function buildDisplayBundle() {
  await bundle({
    entryPoints: [path.join(root, "dist", "apps", "display-web", "src", "entry.js")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    sourcemap: false,
    outfile: path.join(assetsDir, "apps", "display-web", "bundle.js"),
    logLevel: "warning",
  });
}

async function buildBlankPresentationTemplate() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "ClassCore";
  pptx.subject = "ClassCore web-ppt blank template";
  const slide = pptx.addSlide();
  slide.background = { color: "F6F3EC" };
  slide.addText("ClassCore 网页 Presentation", {
    x: 1,
    y: 1,
    w: 8,
    h: 0.6,
    fontFace: "Arial",
    fontSize: 24,
    color: "24324B",
  });
  const visualMarker =
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" rx="18" fill="#E3EAF7"/><circle cx="60" cy="60" r="28" fill="#5575B8"/><path d="M120 82 164 28 208 82Z" fill="#C96B55"/></svg>';
  slide.addImage({ data: `data:image/svg+xml;base64,${Buffer.from(visualMarker).toString("base64")}`, x: 1, y: 2, w: 3, h: 1.5 });
  await pptx.writeFile({ fileName: path.join(assetsDir, "presentation-webppt-blank.pptx") });
  // PptxGenJS emits PowerPoint's blue default table style even for a blank
  // deck. Remove only that default declaration so AddTable + SetTableStyle
  // with null remains visibly neutral without editing the engine document.
  const filename = path.join(assetsDir, "presentation-webppt-blank.pptx");
  const zip = await JSZip.loadAsync(fs.readFileSync(filename));
  const tableStyles = zip.file("ppt/tableStyles.xml");
  if (tableStyles) {
    const xml = await tableStyles.async("string");
    zip.file("ppt/tableStyles.xml", xml.replace(/ def="[^"]+"/, ""));
    fs.writeFileSync(filename, await zip.generateAsync({ type: "nodebuffer" }));
  }
}

function neutralShell({ app, label }) {
  const style = `<style>
      :root { color-scheme: light; --ink: #24324b; --muted: #7d8490; --line: #d9d6cc; --paper: #f6f3ec; --panel: #fbfaf7; --focus-wash: #e3eaf7; }
      html, body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: var(--paper); color: var(--ink); }
      main { max-width: 760px; margin: 8vh auto; padding: 28px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 19px 42px rgba(110,102,86,.11); }
      code { background: var(--focus-wash); padding: 2px 6px; border-radius: 4px; }
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
  if (route === "student") {
    return studentShell();
  }
  if (route === "authoring") {
    return studioShell();
  }
  if (route === "teacher") {
    return teacherShell();
  }
  if (route === "backstage") {
    return backstageShell();
  }
  if (route === "observer") {
    return observerShell();
  }
  if (route === "display") {
    return displayShell();
  }
  return neutralShell({ app, label });
}

function copyCompiledAsset(relativePath) {
  const source = path.join(root, "dist", relativePath);
  const target = path.join(assetsDir, relativePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing compiled browser asset: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

copyCompiledAsset("packages/surfaces/src/index.js");
copyCompiledAsset("packages/applet-sdk/src/index.js");
copyCompiledAsset("packages/transform-board/src/index.js");
copyCompiledAsset("packages/classroom-client/src/index.js");
fs.mkdirSync(bundledPresentationFontTarget, { recursive: true });
for (const filename of ["LXGWWenKaiGBLite-Regular.ttf", "LXGWWenKaiGBLite-OFL.txt", "NotoSerif-Variable.ttf", "NotoSerif-OFL.txt"]) {
  const source = path.join(bundledPresentationFontSource, filename);
  if (!fs.existsSync(source)) throw new Error(`Missing bundled presentation font asset: ${filename}`);
  fs.copyFileSync(source, path.join(bundledPresentationFontTarget, filename));
}
for (const [, app] of surfaces) {
  if (app !== "presentation-studio") {
    copyCompiledAsset(`apps/${app}/src/entry.js`);
  }
}
await buildPresentationBundle();
await buildDisplayBundle();
await buildBlankPresentationTemplate();
for (const [route, app, label] of surfaces) {
  const directory = path.join(outputDir, route);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), buildShell({ route, app, label }));
}
console.log("Neutral web surface shells built");
