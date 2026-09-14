import { CLIENT_RUNTIME_BUDGETS, getSurfaceDescriptor } from "@classroom/surfaces";
import { ClassroomClient } from "@classroom/classroom-client";

export const surface = getSurfaceDescriptor("teacher-runtime");
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS["teacher-runtime"];

type PresentationProject = { presentationId: string; title: string; currentDraftRevision: number; currentDraftDocument?: { pageCount?: number }; updatedAt: string };
const ownerId = sessionStorage.getItem("classcore.teacher.owner-id");
const ownerHeaders: Record<string, string> = ownerId ? { "x-classcore-user-id": ownerId } : {};

function toolsOrigin(): string {
  const port = Number(window.location.port || (window.location.protocol === "https:" ? 443 : 80));
  const toolsPort = port === 80 || port === 443 || port === 9602 ? 9688 : port + 1;
  return `${window.location.protocol}//${window.location.hostname}:${toolsPort}`;
}
function authoringUrl(presentationId?: string): string {
  const suffix = presentationId ? `?presentationId=${encodeURIComponent(presentationId)}` : "";
  return `${toolsOrigin()}/authoring${suffix}`;
}
function classroomApi(path: string): string {
  return path;
}
function button(label: string, action: () => void | Promise<void>, className = ""): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.className = className;
  item.textContent = label;
  item.addEventListener("click", () => {
    void action();
  });
  return item;
}
function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function mountTeacherLibrary(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "classroom") {
    mountTeacherClassroom(root);
    return;
  }
  const requestedSession = new URLSearchParams(window.location.search).get("sessionId")?.trim();
  if (requestedSession) {
    mountTeacherClassroom(root, { defaultSessionLocator: requestedSession });
    return;
  }
  mountTeacherLanding(root);
}

function mountTeacherLanding(root: HTMLElement): void {
  root.replaceChildren();
  const app = document.createElement("main");
  app.className = "teacher-landing";
  root.append(app);
  const header = document.createElement("header");
  header.className = "library-header";
  header.innerHTML = '<div><p class="library-kicker">CLASSCORE · TEACHER RUNTIME</p><h1>课堂控制台</h1><p class="library-subtitle">课堂现场只保留控制、观察和同步。课程准备与文件管理请在课程准备台完成。</p></div>';
  const headerActions = document.createElement("div");
  headerActions.className = "library-actions";
  headerActions.append(button("打开课程准备台", () => {
    window.location.href = toolsOrigin() + "/backstage";
  }, "primary-action"));
  header.append(headerActions);
  app.append(header);
  const status = document.createElement("p");
  status.className = "library-status";
  app.append(status);
  const guide = document.createElement("section");
  guide.className = "teacher-landing-guide";
  guide.innerHTML = [
    '<div><span class="landing-step">准备</span><strong>在课程准备台选择并发布课程</strong><p>导入 PPT、配置活动和 Applet，完成运行检查后点击“开始课堂”。</p></div>',
    '<div><span class="landing-step">上课</span><strong>在这里控制课堂现场</strong><p>开始课堂后，服务端会把教师带入同一 Session，学生、大屏和观察端随之同步。</p></div>',
  ].join("");
  app.append(guide);
  status.textContent = "课堂尚未启动 · 请先从课程准备台开始";
}

function mountTeacherPresentationLibrary(root: HTMLElement): void {
  root.replaceChildren();
  const app = document.createElement("main");
  app.className = "teacher-library";
  root.append(app);
  const header = document.createElement("header");
  header.className = "library-header";
  header.innerHTML = '<div><p class="library-kicker">CLASSCORE · TEACHER DESK</p><h1>我的课件</h1><p class="library-subtitle">把要讲的内容留在手边，把课堂版本留在服务器。</p></div>';
  const headerActions = document.createElement("div");
  headerActions.className = "library-actions";
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";
  importInput.hidden = true;
  const status = document.createElement("p");
  status.className = "library-status";
  async function createBlank(): Promise<void> {
    status.textContent = "正在创建空白课件…";
    const response = await fetch(classroomApi("/api/presentations"), { method: "POST", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({ title: "未命名公开课" }) });
    if (!response.ok) throw new Error(`新建失败（${response.status}）`);
    const project = (await response.json()).presentation as PresentationProject;
    window.location.href = authoringUrl(project.presentationId);
  }
  headerActions.append(button("新建课件", () => createBlank(), "primary-action"), button("导入 PPTX", () => importInput.click(), "secondary-action"), button("从我的课件中选择", () => openPicker(), "secondary-action"), importInput);
  header.append(headerActions);
  app.append(header, status);
  const toolbar = document.createElement("div");
  toolbar.className = "library-toolbar";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "搜索课件";
  search.setAttribute("aria-label", "搜索课件");
  toolbar.append(search);
  app.append(toolbar);
  const content = document.createElement("section");
  content.className = "library-content";
  app.append(content);
  let projects: PresentationProject[] = [];

  async function preparePresentation(project: PresentationProject): Promise<void> {
    const sessionId = `classroom-${crypto.randomUUID()}`;
    status.textContent = "正在准备课堂版本…";
    const block = await fetch("/api/classroom-blocks", {
      method: "POST",
      headers: { ...ownerHeaders, "content-type": "application/json" },
      body: JSON.stringify({ blockId: `presentation-block-${crypto.randomUUID()}`, presentationId: project.presentationId }),
    });
    if (!block.ok) throw new Error(`课堂绑定失败（${block.status}）`);
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/presentation-prepare`, {
      method: "POST",
      headers: { ...ownerHeaders, "content-type": "application/json" },
      body: JSON.stringify({ presentationId: project.presentationId }),
    });
    if (!response.ok) throw new Error(`课堂准备失败（${response.status}）`);
    status.textContent = `课件已准备 · ${project.title} · ${sessionId}`;
  }

  function openPicker(): void {
    const dialog = document.createElement("dialog");
    dialog.className = "presentation-picker";
    const title = document.createElement("h2");
    title.textContent = "选择课堂课件";
    const subtitle = document.createElement("p");
    subtitle.textContent = "选择后只绑定 presentationId，课堂版本在准备阶段由服务器冻结。";
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "搜索我的课件";
    input.setAttribute("aria-label", "搜索我的课件");
    const list = document.createElement("div");
    list.className = "picker-list";
    const close = button("取消", () => dialog.close(), "card-secondary");
    function renderPicker(): void {
      list.replaceChildren();
      const query = input.value.trim().toLowerCase();
      for (const project of projects.filter((item) => !query || item.title.toLowerCase().includes(query))) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "picker-item";
        item.innerHTML = `<strong></strong><span></span>`;
        item.querySelector("strong")!.textContent = project.title;
        item.querySelector("span")!.textContent = `${project.currentDraftDocument?.pageCount ?? "—"} 页 · ${formatUpdatedAt(project.updatedAt)}`;
        item.addEventListener("click", () => {
          dialog.close();
          void preparePresentation(project).catch((error) => {
            status.textContent = error instanceof Error ? error.message : "课堂准备失败";
          });
        });
        list.append(item);
      }
      if (!list.childElementCount) list.textContent = "没有匹配的课件";
    }
    input.addEventListener("input", renderPicker);
    const footer = document.createElement("footer");
    footer.append(close);
    dialog.append(title, subtitle, input, list, footer);
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    renderPicker();
    dialog.showModal();
  }

  async function rename(project: PresentationProject): Promise<void> {
    const title = window.prompt("课件名称", project.title)?.trim();
    if (!title || title === project.title) return;
    const response = await fetch(`/api/presentations/${encodeURIComponent(project.presentationId)}`, { method: "PATCH", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({ title }) });
    if (!response.ok) throw new Error(`重命名失败（${response.status}）`);
    await refresh();
  }
  async function duplicate(project: PresentationProject): Promise<void> {
    const response = await fetch(`/api/presentations/${encodeURIComponent(project.presentationId)}/duplicate`, { method: "POST", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({}) });
    if (!response.ok) throw new Error(`创建副本失败（${response.status}）`);
    await refresh();
  }
  async function showHistory(project: PresentationProject): Promise<void> {
    const response = await fetch(`/api/presentations/${encodeURIComponent(project.presentationId)}/revisions`, { headers: ownerHeaders });
    if (!response.ok) throw new Error(`版本历史读取失败（${response.status}）`);
    const revisions = (await response.json()).revisions as Array<{ kind: string; createdAt: string; retained: boolean }>;
    status.textContent = revisions.length ? `${project.title}：${revisions.map((item) => `${item.kind === "published" ? "课堂版本" : "试课"} · ${formatUpdatedAt(item.createdAt)}`).join(" ｜ ")}` : `${project.title}：暂无正式版本`;
  }

  function render(): void {
    content.replaceChildren();
    const query = search.value.trim().toLowerCase();
    const visible = projects.filter((project) => !query || project.title.toLowerCase().includes(query));
    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.innerHTML = `<span>最近编辑</span><span>${visible.length} 份</span>`;
    content.append(heading);
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "library-empty";
      empty.innerHTML = "<strong>还没有课件</strong><span>新建一个空白课件，或导入已有 PPTX。</span>";
      empty.append(button("开始制作", () => createBlank(), "primary-action"));
      content.append(empty);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "presentation-grid";
    for (const project of visible) {
      const card = document.createElement("article");
      card.className = "presentation-card";
      const preview = document.createElement("div");
      preview.className = "card-preview";
      preview.innerHTML = `<span class="preview-mark">${project.title.slice(0, 1) || "C"}</span><span class="preview-lines"></span>`;
      const details = document.createElement("div");
      details.className = "card-details";
      const title = document.createElement("h2");
      title.textContent = project.title;
      const meta = document.createElement("p");
      meta.textContent = `${project.currentDraftDocument?.pageCount ?? "—"} 页 · ${formatUpdatedAt(project.updatedAt)}`;
      details.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "card-actions";
      actions.append(button("编辑", () => {
        window.location.href = authoringUrl(project.presentationId);
      }, "card-primary"));
      actions.append(button("用于课堂", () => preparePresentation(project), "card-primary"));
      actions.append(button("重命名", () => rename(project), "card-secondary"));
      actions.append(button("创建副本", () => duplicate(project), "card-secondary"));
      actions.append(button("版本历史", () => showHistory(project), "card-secondary"));
      actions.append(
        button("导出 PPTX", async () => {
          const response = await fetch(`/api/presentations/${encodeURIComponent(project.presentationId)}/draft?download=1`, { headers: ownerHeaders });
          if (!response.ok) throw new Error(`导出失败（${response.status}）`);
          const blob = await response.blob();
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = `${project.title || "presentation"}.pptx`;
          link.click();
          URL.revokeObjectURL(link.href);
        }, "card-secondary"),
        button("删除", async () => {
          if (!window.confirm(`删除“${project.title}”？`)) return;
          const response = await fetch(`/api/presentations/${encodeURIComponent(project.presentationId)}`, { method: "DELETE", headers: ownerHeaders });
          if (!response.ok) throw new Error(`删除失败（${response.status}）`);
          await refresh();
        }, "card-secondary"),
      );
      card.append(preview, details, actions);
      grid.append(card);
    }
    content.append(grid);
  }
  async function refresh(): Promise<void> {
    status.textContent = "正在读取课件…";
    try {
      const response = await fetch("/api/presentations", { headers: ownerHeaders });
      if (!response.ok) throw new Error(`课件服务返回 ${response.status}`);
      projects = (await response.json()).presentations as PresentationProject[];
      status.textContent = `已连接 · ${projects.length} 份课件`;
      render();
    } catch (error) {
      status.textContent = error instanceof Error ? `${error.message}。仍可打开本机创作台。` : "课件服务暂未连接";
      projects = [];
      render();
    }
  }
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file) return;
    void (async () => {
      status.textContent = "正在导入…";
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const uploaded = await fetch("/api/presentation-assets", {
          method: "POST",
          headers: { ...ownerHeaders, "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
          body: bytes as unknown as BodyInit,
        });
        if (!uploaded.ok) throw new Error(`导入失败（${uploaded.status}）`);
        const { asset } = await uploaded.json();
        const idPrefix = `classcore-import-${crypto.randomUUID()}`;
        const response = await fetch("/api/presentations", {
          method: "POST",
          headers: { ...ownerHeaders, "content-type": "application/json" },
          body: JSON.stringify({ title: file.name.replace(/\.pptx?$/i, "") || "未命名课件", assetId: asset.assetId, document: { format: "web-ppt-ooxml-v1", idPrefix, deckId: `deck-${idPrefix}` } }),
        });
        if (!response.ok) throw new Error(`导入失败（${response.status}）`);
        await refresh();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "导入失败";
      }
      importInput.value = "";
    })();
  });
  search.addEventListener("input", render);
  void refresh();
}

type TeacherStudent = { participantId: string; displayName: string; seatNo?: string | null };
type TeacherStageWidget = {
  selector?: string;
  activityType?: string;
  participantMode?: string;
  appletCount?: number;
  adviceMode?: string;
  submissionPolicy?: string;
  evidenceCount?: number;
  artifactCount?: number;
  selectedCount?: number;
  activeCount?: number;
  objectCount?: number;
  latestSeq?: number;
};
type ArtifactObject = { shape?: string; x?: number; y?: number; width?: number; height?: number; rotation?: number };
type ArtifactContent = { artifactType?: string; revision?: number; recordText?: string; tokens?: Array<{ kind?: string; display?: string }>; objectCount?: number; solved?: boolean | null; objects?: ArtifactObject[] };
type TeacherStage = {
  revision: number;
  contentType: string;
  payload: { source?: string; sources?: string[] | null; selectedParticipantIds?: string[]; annotation?: string | null; artifactContents?: ArtifactContent[]; widget?: TeacherStageWidget };
};
type TeacherLiveFrame = {
  scope?: { type?: string; id?: string };
  seq?: number;
  payload?: { state?: { objects?: Record<string, unknown> }; objects?: Record<string, unknown> };
};

function liveFrameObjects(frame: TeacherLiveFrame | null | undefined): Record<string, unknown> {
  const payload = frame?.payload;
  const stateObjects = payload?.state?.objects;
  if (stateObjects && typeof stateObjects === "object") return stateObjects;
  return payload?.objects && typeof payload.objects === "object" ? payload.objects : {};
}

function renderArtifactContent(container: HTMLElement, artifact?: ArtifactContent): void {
  container.replaceChildren();
  if (!artifact) return;
  const heading = document.createElement("strong");
  heading.textContent = `作品内容 · ${artifact.solved === true ? "已完成" : "未完成"}`;
  const record = document.createElement("span");
  record.textContent = artifact.recordText ? `记录：${artifact.recordText}` : "未记录文字";
  const tokens = document.createElement("span");
  const tokenText = (artifact.tokens ?? []).map((token) => token.display || token.kind || "词元").join("");
  tokens.textContent = tokenText ? `表达：${tokenText}` : "无表达词元";
  const objects = document.createElement("span");
  const objectText = (artifact.objects ?? []).slice(0, 6).map((object, index) => {
    const position = `${object.x ?? 0},${object.y ?? 0}`;
    return `图形${index + 1} ${object.shape ?? "unknown"} · ${position} · ${object.rotation ?? 0}°`;
  }).join(" ｜ ");
  objects.textContent = `对象：${artifact.objectCount ?? 0}${objectText ? ` · ${objectText}` : ""}`;
  container.append(heading, record, tokens, objects);
}

function renderReadOnlyStudentBoard(container: HTMLElement, frame: { payload?: { objects?: Record<string, unknown> } } | null): void {
  container.replaceChildren();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 8");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-label", "学生实时操作方格纸");
  svg.dataset.testid = "teacher-live-board";
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
  pattern.id = "teacher-board-grid";
  pattern.setAttribute("width", "1");
  pattern.setAttribute("height", "1");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  const grid = document.createElementNS("http://www.w3.org/2000/svg", "path");
  grid.setAttribute("d", "M 1 0 L 0 0 0 1");
  grid.setAttribute("stroke", "#d2d0ca");
  grid.setAttribute("stroke-width", ".018");
  grid.setAttribute("fill", "none");
  pattern.append(grid);
  defs.append(pattern);
  svg.append(defs);
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "16");
  bg.setAttribute("height", "8");
  bg.setAttribute("fill", "url(#teacher-board-grid)");
  svg.append(bg);
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "8");
  circle.setAttribute("cy", "4");
  circle.setAttribute("r", "2");
  circle.setAttribute("fill", "#fbfaf7");
  circle.setAttribute("stroke", "#24324b");
  circle.setAttribute("stroke-width", ".035");
  svg.append(circle);
  for (const raw of Object.values(liveFrameObjects(frame as TeacherLiveFrame | null))) {
    const object = raw as {
      x?: number;
      y?: number;
      rotation?: number;
      rotationCenter?: { x?: number; y?: number };
      geometry?: { path?: string; internalElements?: Array<{ type?: string; cx?: number; cy?: number; r?: number; d?: string; fill?: string; stroke?: string; strokeWidth?: number }> };
      visual?: { color?: string };
    };
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const x = Number(object.x ?? 0), y = Number(object.y ?? 0), rotation = Number(object.rotation ?? 0), cx = Number(object.rotationCenter?.x ?? .5), cy = Number(object.rotationCenter?.y ?? .5);
    group.setAttribute("transform", `translate(${x} ${y}) rotate(${rotation} ${cx} ${cy})`);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", object.geometry?.path ?? "M0 0 H2 V2 H0 Z");
    path.setAttribute("fill", object.visual?.color ?? "#ffd54a");
    path.setAttribute("stroke", "#24324b");
    path.setAttribute("stroke-width", ".035");
    group.append(path);
    for (const mark of object.geometry?.internalElements ?? []) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", mark.type === "circle" ? "circle" : "path");
      if (mark.type === "circle") {
        node.setAttribute("cx", String(mark.cx ?? 0));
        node.setAttribute("cy", String(mark.cy ?? 0));
        node.setAttribute("r", String(mark.r ?? .1));
      } else node.setAttribute("d", mark.d ?? "");
      node.setAttribute("fill", mark.fill ?? "none");
      node.setAttribute("stroke", mark.stroke ?? "#000");
      node.setAttribute("stroke-width", String(mark.strokeWidth ?? .08));
      group.append(node);
    }
    svg.append(group);
  }
  container.append(svg);
}

function mountTeacherClassroom(root: HTMLElement, options: { defaultSessionLocator?: string; defaultCredential?: string } = {}): void {
  root.replaceChildren();
  const app = document.createElement("main");
  app.className = "teacher-reference-app app";
  const teacherShell = [
    `<header class="topbar"><div class="brand"><div class="logo">课</div><div><h1>公开课课堂控制台</h1>` +
      `<p>教师控制台 · <span class="teacher-course-context" data-field="course">等待课程信息</span></p></div></div>` +
      `<div class="top-status"><div class="status-pill"><span class="dot"></span>` +
      `<span data-testid="teacher-status">等待加入课堂</span></div><div class="status-pill"><span>📶</span>` +
      `<span><b data-field="top-online">0</b> 台平板在线</span></div><div class="status-pill"><span>📩</span>` +
      `<span><b data-field="top-messages">0</b> 条新消息</span></div>` +
      `<a class="icon-btn teacher-settings-link" title="返回课程准备台" aria-label="返回课程准备台" href="${toolsOrigin()}/backstage">↗</a>` +
      `<button class="top-join-btn" type="button" data-action="join">加入课堂</button></div></header>`,
    `<section class="teacher-join-strip"><label><span>课堂定位</span>` +
      `<input data-field="locator" aria-label="课堂定位" required></label><label><span>教师凭证</span>` +
      `<input data-field="credential" aria-label="教师凭证" required autocomplete="off"></label>` +
      `<span class="teacher-join-state" data-field="join-url">等待服务端入口</span>` +
      `<button type="button" data-action="copy-display" hidden>复制大屏地址</button>` +
      `<span class="teacher-entry-state" data-field="student-entry">学生 / 听课老师入口由服务器签发</span></section>`,
    `<aside class="sidebar"><div class="side-scroll"><section class="section"><div class="section-title">` +
      `<span>显示控制</span><small>2 路 + 入口</small></div><div class="source-list">` +
      `<button class="source source-control" type="button" data-action="presentation-source">` +
      `<span class="source-icon">▣</span><span class="source-text"><b>PPT</b><small>课堂演示文稿</small></span>` +
      `<span class="source-arrow">›</span></button>` +
      `<button class="source source-control" type="button" data-action="student-live-source">` +
      `<span class="source-icon">◫</span><span class="source-text"><b>学生操作</b>` +
      `<small>右侧指定或随机，最多 4 人</small></span><span class="source-arrow">›</span></button>` +
      `<button class="source source-control" type="button" data-action="entry"><span class="source-icon">⌁</span>` +
      `<span class="source-text"><b>入口</b><small>学生 / 听课老师</small></span>` +
      `<span class="source-arrow">›</span></button></div><div class="layout-summary">` +
      `<span>当前控制权</span><strong data-field="lease">未取得</strong></div></section>` +
      `<section class="section"><div class="section-title"><span>PPT 控制</span>` +
      `<small data-field="ppt-state">等待数据</small></div><div class="ppt-controls">` +
      `<button class="control-btn" type="button" data-action="presentation-previous">上一页</button>` +
      `<span class="page-box" data-field="ppt-page">—</span>` +
      `<button class="control-btn" type="button" data-action="presentation-next">下一页</button></div>` +
      `<div class="ppt-control-row"><button type="button" data-action="presentation-play">播放</button>` +
      `<button type="button" data-action="presentation-pause">暂停</button></div></section>` +
      `<section class="section teacher-ai-panel"><div class="section-title"><span>AI 分析学生操作数据</span>` +
      `<small data-field="ai-state">实时</small></div><div class="ai-analysis-card"><div class="ai-stat-row">` +
      `<div class="ai-stat"><strong data-field="ai-received">0</strong><span>已接收操作</span></div>` +
      `<div class="ai-stat"><strong data-field="ai-analyzed">0</strong><span>已完成分析</span></div></div>` +
      `<p data-field="ai-progress">等待真实操作数据</p><button class="action-btn" type="button" data-action="analytics">` +
      `查看分析结果</button></div></section></div></aside>`,
    `<main class="center"><section class="stage-shell"><div class="stage one" data-testid="teacher-stage">` +
      `<div class="stage-preview" data-stage-canvas><div class="stage-head"><span>STAGE · 课堂预览</span>` +
      `<strong data-field="stage-mode">单路 / 可组合</strong></div><strong data-field="stage-source">等待 Stage</strong>` +
      `<span data-field="stage-focus">尚未选择学生</span><div data-field="presentation-preview" ` +
      `class="stage-presentation-preview" hidden><span>Presentation</span><strong data-field="presentation-scene">等待课件</strong>` +
      `<small data-field="presentation-step">—</small></div><div data-field="live-board" class="stage-live-board"></div>` +
      `<span data-field="live-preview">等待学生实时画面</span><span data-field="stage-widget"></span>` +
      `<div data-field="artifact-content" class="artifact-content"></div><em data-field="stage-annotation"></em></div>` +
      `</div></section><div class="stage-toolbar"><div class="stage-info"><span class="stage-status-dot"></span>` +
      `<span>当前预览：<strong data-field="stage-source-label">Stage</strong></span>` +
      `<span class="stage-info-note" data-field="activity-phase">等待活动</span></div>` +
      `<div class="toolbar-actions stage-actions"><button class="mini-btn primary" type="button" data-action="claim">取得控制权</button>` +
      `<button class="mini-btn" type="button" data-action="activity">学生视图</button>` +
      `<button class="mini-btn" type="button" data-action="activity-summary">当前活动</button>` +
      `<button class="mini-btn" type="button" data-action="presentation">Presentation</button>` +
      `<button class="mini-btn" type="button" data-action="presentation-play">播放</button>` +
      `<button class="mini-btn" type="button" data-action="presentation-pause">暂停</button>` +
      `<button class="mini-btn" type="button" data-action="phase-one">独立还原</button>` +
      `<button class="mini-btn" type="button" data-action="phase-two">支持还原</button>` +
      `<span data-field="activity-controls" class="activity-controls"></span></div></div>` +
      `<label class="annotation-field">教师标注 <input data-field="annotation" maxlength="160" ` +
      `placeholder="可选的 Stage 标注"><button type="button" data-action="annotate">发布</button></label>` +
      `<p data-field="control-error" class="teacher-control-error" role="alert" hidden></p></main>`,
    `<aside class="rightbar teacher-resources"><div class="right-head"><div class="section-title"><span>学生平板</span>` +
      `<small><span class="dot" style="display:inline-block;margin-right:6px"></span><span data-field="online-count">等待数据</span></small>` +
      `</div><div class="tabs"><button type="button" data-action="student-tab-designated" class="tab is-active">指定学生</button>` +
      `<button type="button" data-action="student-tab-random" class="tab">随机学生</button></div></div><div class="right-content">` +
      `<div class="direct-pick-card"><div class="direct-pick-head"><div><b>指定学生</b><span>输入 1～4 个学生编号或姓名</span></div></div>` +
      `<div class="direct-pick-row"><input data-field="student-search" class="search" aria-label="学生搜索" placeholder="例如：16，9，8，5">` +
      `<button class="action-btn" type="button" data-action="student-search-submit">显示</button></div>` +
      `<div data-field="students" class="teacher-student-list"></div><button class="bulk-btn" type="button" data-action="random">随机选择</button></div></div>` +
      `<div class="teacher-message-panel message-panel"><div class="message-head"><b>学生发来的信息</b>` +
      `<span class="badge" data-field="message-badge">0 条</span></div><div data-field="messages" class="teacher-message-list">` +
      `<span>等待课堂事件</span></div></div><div class="entry-panel"><div class="message-head"><b>课堂入口</b>` +
      `<button type="button" data-action="copy-display" hidden>复制大屏地址</button></div><p data-field="join-url">等待服务端入口</p>` +
      `<p data-field="student-entry">学生 / 听课老师入口由服务器签发</p></div><div class="teacher-submission-panel">` +
      `<div class="message-head"><b>提交资源</b><span data-field="submission-count">0</span></div>` +
      `<div data-field="submissions" class="teacher-submission-list"><span>等待课堂数据</span></div></div>` +
      `<div class="teacher-analytics"><div class="message-head"><b>学习分析</b>` +
      `<button type="button" data-action="analytics">分析已选学生</button></div><p data-field="analytics">选择学生后请求确定性分析。</p>` +
      `<button type="button" data-action="confirm-analytics" hidden>确认加入 Stage</button></div>` +
      `<div class="teacher-summary" data-field="summary">消息摘要：0</div></aside>`,
  ].join("");
  app.innerHTML = teacherShell;
  root.append(app);
  const status = app.querySelector<HTMLElement>('[data-testid="teacher-status"]')!;
  const studentList = app.querySelector<HTMLElement>('[data-field="students"]')!;
  const stageSource = app.querySelector<HTMLElement>('[data-field="stage-source"]')!;
  const stageFocus = app.querySelector<HTMLElement>('[data-field="stage-focus"]')!;
  const stagePreview = app.querySelector<HTMLElement>('[data-testid="teacher-stage"]')!;
  const presentationPreview = app.querySelector<HTMLElement>('[data-field="presentation-preview"]')!;
  const presentationScene = app.querySelector<HTMLElement>('[data-field="presentation-scene"]')!;
  const presentationStep = app.querySelector<HTMLElement>('[data-field="presentation-step"]')!;
  const livePreview = app.querySelector<HTMLElement>('[data-field="live-preview"]')!;
  const liveBoard = app.querySelector<HTMLElement>('[data-field="live-board"]')!;
  const stageWidget = app.querySelector<HTMLElement>('[data-field="stage-widget"]')!;
  const artifactContent = app.querySelector<HTMLElement>('[data-field="artifact-content"]')!;
  const stageAnnotation = app.querySelector<HTMLElement>('[data-field="stage-annotation"]')!;
  const leaseLabel = app.querySelector<HTMLElement>('[data-field="lease"]')!;
  const joinUrl = app.querySelector<HTMLElement>('[data-field="join-url"]')!;
  const copyDisplay = app.querySelector<HTMLButtonElement>('[data-action="copy-display"]')!;
  const studentEntry = app.querySelector<HTMLElement>('[data-field="student-entry"]')!;
  const entryPanel = app.querySelector<HTMLElement>('.teacher-resources .entry-panel')!;
  const resourcesColumn = app.querySelector<HTMLElement>('.teacher-resources')!;
  const courseContext = app.querySelector<HTMLElement>('[data-field="course"]')!;
  const controlError = app.querySelector<HTMLElement>('[data-field="control-error"]')!;
  const joinButton = app.querySelector<HTMLButtonElement>('[data-action="join"]')!;
  const submissionCount = app.querySelector<HTMLElement>('[data-field="submission-count"]')!;
  const submissions = app.querySelector<HTMLElement>('[data-field="submissions"]')!;
  const summary = app.querySelector<HTMLElement>('[data-field="summary"]')!;
  const analytics = app.querySelector<HTMLElement>('[data-field="analytics"]')!;
  const confirmAnalytics = app.querySelector<HTMLButtonElement>('[data-action="confirm-analytics"]')!;
  const onlineCount = app.querySelector<HTMLElement>('[data-field="online-count"]')!;
  const aiReceived = app.querySelector<HTMLElement>('[data-field="ai-received"]')!;
  const aiAnalyzed = app.querySelector<HTMLElement>('[data-field="ai-analyzed"]')!;
  const aiProgress = app.querySelector<HTMLElement>('[data-field="ai-progress"]')!;
  const pptState = app.querySelector<HTMLElement>('[data-field="ppt-state"]')!;
  const pptPage = app.querySelector<HTMLElement>('[data-field="ppt-page"]')!;
  const messages = app.querySelector<HTMLElement>('[data-field="messages"]')!;
  const messageBadge = app.querySelector<HTMLElement>('[data-field="message-badge"]')!;
  const studentSearch = app.querySelector<HTMLInputElement>('[data-field="student-search"]')!;
  const locator = app.querySelector<HTMLInputElement>('[data-field="locator"]')!;
  const credential = app.querySelector<HTMLInputElement>('[data-field="credential"]')!;
  const annotation = app.querySelector<HTMLInputElement>('[data-field="annotation"]')!;
  locator.value = options.defaultSessionLocator ?? new URLSearchParams(window.location.search).get("locator")?.trim() ?? "";
  credential.value = options.defaultCredential ?? new URLSearchParams(window.location.search).get("code")?.trim() ?? "";
  const client = new ClassroomClient({ clientBuild: "teacher-web-dev", sessionStorageKey: "classcore.teacher.classroom.join.v1" });
  let students: TeacherStudent[] = [];
  let selected = new Set<string>();
  let activeSources = new Set<string>();
  let presence = new Map<string, string>();
  let stage: TeacherStage | null = null;
  let latestLive: { participantId: string; seq: number; objectCount: number; frame: TeacherLiveFrame } | null = null;
  let latestAnalytics: { resultId: string; recommendations: Array<{ recommendationId: string; label: string; status: string }>; classifications: Array<{ code: string }> } | null = null;
  let presentationRevision = 0;
  let leaseRevision = 0;
  let leaseClaimed = false;
  let leaseRenewTimer: ReturnType<typeof setInterval> | null = null;
  let messageCount = 0;
  let operationMessageCount = 0;
  let analyzedMessageCount = 0;
  let studentSearchTerm = "";
  let presentationSessionId = "";
  let presentationState: { sceneId?: string; step?: number; playState?: string; revision?: number } | null = null;
  let presentationScenes: Array<{ sceneId: string; hidden?: boolean }> = [];
  let classroomActivityId = "";
  let activityOptions: Array<{ activityId: string; label: string }> = [];
  const messageLog: string[] = [];
  let displayUrlValue = "";
  const setControlError = (message: string): void => {
    controlError.textContent = message;
    controlError.hidden = !message;
  };
  const syncControlState = (): void => {
    const online = client.state.connection === "online";
    joinButton.disabled = online;
    if (online && joinButton.textContent !== "已连接") joinButton.textContent = "已连接";
    for (const action of app.querySelectorAll<HTMLButtonElement>('.stage-actions button, [data-action="annotate"], [data-action="analytics"]')) action.disabled = !online || !leaseClaimed;
    app.querySelector<HTMLButtonElement>('[data-action="claim"]')!.disabled = !online || leaseClaimed;
  };
  const startLeaseRenewal = (): void => {
    if (leaseRenewTimer) return;
    leaseRenewTimer = setInterval(() => {
      if (leaseClaimed && client.state.connection === "online") client.sendControl({ type: "teacher.lease.renew", expectedRevision: leaseRevision });
    }, 10_000);
  };
  const renderStage = (): void => {
    const selectedArtifact = stage?.payload?.widget?.selector === "selected-artifact";
    const selectedLive = stage?.payload?.widget?.selector === "selected-live-view";
    const currentActivity = stage?.payload?.widget?.selector === "current-activity-summary";
    const sources = stage?.payload?.sources ?? (stage?.payload?.source ? [stage.payload.source] : []);
    stagePreview.dataset.sources = sources.join(" ");
    app.querySelector<HTMLElement>("[data-stage-canvas]")?.setAttribute("data-sources", sources.join(" "));
    const sourceButtons: Array<[string, string]> = [["presentation-source", "presentation"], ["student-live-source", "student-live"], ["entry", "entry"]];
    for (const [action, source] of sourceButtons) {
      app.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.classList.toggle("is-active", sources.length === 1 && sources.includes(source));
    }
    presentationPreview.hidden = !sources.includes("presentation");
    liveBoard.hidden = sources.length > 0 && !sources.includes("student-live") && !selectedLive;
    presentationScene.textContent = presentationState?.sceneId ?? "等待课件";
    presentationStep.textContent = presentationState ? `第 ${Number(presentationState.step ?? 0) + 1} 步 · ${presentationState.playState ?? "idle"}` : "等待播放状态";
    const source = selectedArtifact
      ? "学生作品对比"
      : currentActivity
      ? "当前活动摘要"
      : sources.includes("entry")
      ? "课堂入口"
      : sources.includes("presentation") && sources.includes("student-live")
      ? "PPT + 学生操作"
      : sources.includes("presentation")
      ? "Presentation 权威源"
      : "学生实时视图";
    stageSource.textContent = source;
    app.querySelector<HTMLElement>('[data-field="stage-source-label"]')?.replaceChildren(document.createTextNode(source));
    const names = (stage?.payload?.selectedParticipantIds ?? [...selected]).map((id) => students.find((item) => item.participantId === id)?.displayName ?? id);
    if (selectedArtifact) stageFocus.textContent = `已选 ${stage?.payload?.widget?.artifactCount ?? 0} 份作品证据`;
    else if (currentActivity) stageFocus.textContent = `${stage?.payload?.widget?.activityType ?? "活动"} · ${stage?.payload?.widget?.appletCount ?? 0} 个互动组件`;
    else if (selectedLive) stageFocus.textContent = `已选 ${stage?.payload?.widget?.selectedCount ?? names.length} 个实时视图`;
    else stageFocus.textContent = names.length ? `聚焦：${names.join("、")}` : "尚未选择学生";
    livePreview.textContent = latestLive ? `实时缩略图 · ${latestLive.objectCount} 个对象 · seq ${latestLive.seq}` : "等待学生实时画面";
    const selectedLiveFrame = latestLive && (stage?.payload?.selectedParticipantIds ?? [...selected]).includes(latestLive.participantId) ? latestLive.frame : null;
    renderReadOnlyStudentBoard(liveBoard, selectedLiveFrame);
    if (selectedArtifact) stageWidget.textContent = `selected-artifact · ${stage?.payload?.widget?.evidenceCount ?? 0} 条证据`;
    else if (currentActivity) stageWidget.textContent = `current-activity-summary · ${stage?.payload?.widget?.participantMode ?? "unknown"} · 提交 ${stage?.payload?.widget?.submissionPolicy ?? "none"}`;
    else if (selectedLive) stageWidget.textContent = `selected-live-view · ${stage?.payload?.widget?.activeCount ?? 0} 个活动视图 · ${stage?.payload?.widget?.objectCount ?? 0} 个对象`;
    else stageWidget.textContent = "";
    renderArtifactContent(artifactContent, stage?.payload?.artifactContents?.[0]);
    stageAnnotation.textContent = stage?.payload?.annotation ? `标注：${stage.payload.annotation}` : "";
    leaseLabel.textContent = leaseClaimed ? `控制权 revision ${leaseRevision} · 自动续租` : stage ? `Stage revision ${stage.revision}` : "未取得控制权";
    const activityLabel = app.querySelector<HTMLElement>('[data-field="activity-phase"]');
    if (activityLabel) activityLabel.textContent = activityOptions.find((item) => item.activityId === classroomActivityId)?.label ?? (classroomActivityId ? "当前活动" : "等待活动");
  };
  const renderPresentationStatus = (): void => {
    const index = presentationScenes.findIndex((scene) => scene.sceneId === presentationState?.sceneId);
    pptPage.textContent = presentationState && index >= 0 ? `${index + 1} / ${presentationScenes.length}` : "—";
    pptState.textContent = presentationState ? `${presentationState.sceneId ?? "未定位"} · ${presentationState.playState ?? "idle"}` : "等待数据";
    presentationScene.textContent = presentationState?.sceneId ?? "等待课件";
    presentationStep.textContent = presentationState ? `第 ${Number(presentationState.step ?? 0) + 1} 步 · ${presentationState.playState ?? "idle"}` : "等待播放状态";
  };
  const renderMessages = (): void => {
    messageBadge.textContent = `${messageLog.length} 条`;
    app.querySelector<HTMLElement>('[data-field="top-messages"]')?.replaceChildren(document.createTextNode(String(messageLog.length)));
    messages.replaceChildren();
    if (!messageLog.length) {
      messages.textContent = "等待课堂事件";
      return;
    }
    for (const item of messageLog.slice(-8).reverse()) {
      const row = document.createElement("div");
      row.className = "teacher-message";
      row.textContent = item;
      messages.append(row);
    }
  };
  const recordClassroomMessage = (message: { type?: string }): void => {
    const labels: Record<string, string> = {
      "submission.ack": "课堂服务已确认一份提交",
      "event.ack": "课堂服务已确认一项操作",
      "live.state": "收到学生实时操作画面",
      "teacher.analytics.result": "学习分析结果已准备",
      "teacher.analytics.confirmed": "教师已确认推荐资源",
      "server.reconnect": "课堂服务已恢复连接",
    };
    const label = labels[String(message.type ?? "")];
    if (!label || messageLog.at(-1) === label) return;
    messageLog.push(label);
    renderMessages();
  };
  const renderStudents = (): void => {
    studentList.replaceChildren();
    const online = students.filter((student) => presence.get(student.participantId) === "online").length;
    onlineCount.textContent = students.length ? `${online} / ${students.length} 在线` : "等待数据";
    app.querySelector<HTMLElement>('[data-field="top-online"]')?.replaceChildren(document.createTextNode(String(online)));
    if (!students.length) {
      studentList.textContent = "等待学生加入课堂";
      return;
    }
    const visibleStudents = students.filter((student) => {
      if (!studentSearchTerm) return true;
      const needle = studentSearchTerm.toLowerCase();
      return student.displayName.toLowerCase().includes(needle) || student.participantId.toLowerCase().includes(needle) || String(student.seatNo ?? "").includes(needle);
    });
    if (!visibleStudents.length) {
      studentList.textContent = "没有匹配的学生";
      return;
    }
    for (const student of visibleStudents) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `teacher-student ${selected.has(student.participantId) ? "is-selected" : ""}`;
      item.dataset.participantId = student.participantId;
      const online = presence.get(student.participantId) === "online";
      item.innerHTML = "<strong></strong><span></span>";
      item.querySelector("strong")!.textContent = student.displayName;
      item.querySelector("span")!.textContent = `${online ? "在线" : "等待中"} · ${student.seatNo ?? "无座位号"}`;
      item.addEventListener("click", () => {
        if (selected.has(student.participantId)) selected.delete(student.participantId);
        else if (selected.size < 4) selected.add(student.participantId);
        renderStudents();
        renderStage();
        if (client.state.connection === "online") client.sendControl({ type: "teacher.selection.set", participantIds: [...selected], expectedRevision: stage?.revision });
      });
      studentList.append(item);
    }
  };
  const renderSubmissions = (items: Array<{ submissionId: string; submittedBy: string; status: string }>): void => {
    submissionCount.textContent = String(items.length);
    submissions.replaceChildren();
    if (!items.length) {
      submissions.textContent = "暂无提交资源";
      return;
    }
    for (const item of items.slice(-8).reverse()) {
      const row = document.createElement("div");
      row.className = "teacher-submission";
      row.textContent = `${item.submittedBy} · ${item.status} · ${item.submissionId.slice(-8)}`;
      submissions.append(row);
    }
  };
  const join = async (): Promise<void> => {
    status.textContent = "正在认证教师身份…";
    try {
      const result = await client.join({
        joinRequestId: `join:teacher:${Date.now()}`,
        runtimeApiVersion: 1,
        sessionLocator: locator.value.trim(),
        requestedRole: "teacher",
        credential: { type: "teacher-issued", value: credential.value.trim() },
      });
      presentationSessionId = result.grant.sessionId;
      await client.connect();
      status.textContent = `已连接 · ${result.self?.displayName ?? "教师"}`;
      setControlError("");
      joinButton.textContent = "已连接";
      joinButton.disabled = true;
      syncControlState();
      client.sendControl({ type: "teacher.students.refresh" });
      client.sendControl({ type: "teacher.lease.claim", expectedRevision: leaseRevision });
      void fetch(`/api/sessions/${encodeURIComponent(presentationSessionId)}/presentation-runtime`, { cache: "no-store" }).then(async (response) => {
        if (!response.ok) return;
        const body = await response.json() as { runtime?: { state?: typeof presentationState; revision?: { runtimeIndex?: { scenes?: Array<{ sceneId: string; hidden?: boolean }> } } } };
        presentationState = body.runtime?.state ?? presentationState;
        presentationScenes = body.runtime?.revision?.runtimeIndex?.scenes ?? presentationScenes;
        presentationRevision = Number(presentationState?.revision ?? presentationRevision);
        renderPresentationStatus();
      }).catch(() => {
        pptState.textContent = "课件状态暂不可用";
      });
    } catch (error) {
      joinButton.disabled = false;
      joinButton.textContent = "重新加入";
      status.textContent = error instanceof Error ? error.message : "教师加入失败";
      syncControlState();
    }
  };
  client.onMessage((message) => {
    messageCount += 1;
    summary.textContent = `消息摘要：${messageCount} · ${String(message.type ?? "unknown")}`;
    recordClassroomMessage(message);
    if (message.type === "classroom.course" && message.course && typeof message.course === "object") {
      const course = message.course as { title?: string; courseId?: string };
      courseContext.textContent = course.title ? `当前课程：${course.title}${course.courseId ? ` · ${course.courseId}` : ""}` : "当前课堂课程";
    }
    if (message.type === "classroom.presence" && Array.isArray(message.presence)) presence = new Map((message.presence as Array<{ participantId: string; status: string }>).map((item) => [item.participantId, item.status]));
    if (message.type === "teacher.students" && Array.isArray(message.students)) students = message.students as TeacherStudent[];
    if (message.type === "classroom.display-link" && typeof message.url === "string") {
      displayUrlValue = message.url;
      app.querySelectorAll<HTMLElement>('[data-field="join-url"]').forEach((item) => { item.textContent = `大屏加入地址：${message.url}`; });
      copyDisplay.hidden = false;
    }
    if (message.type === "classroom.join-links" && message.links && typeof message.links === "object") {
      const links = message.links as { studentCode?: string; observerCode?: string };
      app.querySelectorAll<HTMLElement>('[data-field="student-entry"]').forEach((item) => { item.textContent = `学生课堂码：${links.studentCode ?? "由服务端提供"} · 观察端凭证：${links.observerCode ?? "由服务端提供"}`; });
    }
    if (message.type === "teacher.lease.state" && message.lease) {
      leaseRevision = Number((message.lease as { revision: number }).revision);
      const lease = message.lease as { holderParticipantId: string | null };
      if (leaseClaimed && lease.holderParticipantId === client.state.grant?.participantId) client.sendControl({ type: "teacher.lease.claim", expectedRevision: leaseRevision });
      if (!leaseClaimed && (lease.holderParticipantId === null || lease.holderParticipantId === client.state.grant?.participantId)) {
        window.setTimeout(() => {
          if (!leaseClaimed && client.state.connection === "online") client.sendControl({ type: "teacher.lease.claim", expectedRevision: leaseRevision });
        }, 0);
      }
    }
    if (message.type === "teacher.lease.ack" && message.ok && message.lease) {
      leaseRevision = Number((message.lease as { revision: number }).revision);
      leaseClaimed = true;
      leaseLabel.textContent = `控制权 revision ${leaseRevision} · 自动续租`;
      setControlError("");
      startLeaseRenewal();
      syncControlState();
    }
    if (message.type === "teacher.lease.ack" && message.ok === false) {
      leaseClaimed = false;
      setControlError(`控制权续租失败：${String(message.reason ?? "请重新取得控制权")}`);
      syncControlState();
    }
    if (message.type === "error") {
      const reason = String(message.reason ?? message.code ?? "课堂操作失败");
      const copy: Record<string, string> = {
        "controller-lease-required": "请先取得控制权后再操作。",
        "controller-lease-expired": "控制权已过期，请重新取得控制权。",
        "not-lease-holder": "当前教师没有控制权，请重新取得控制权。",
        "stale-revision": "课堂状态已更新，请重新选择操作。",
      };
      setControlError(copy[reason] ?? `课堂操作失败：${reason}`);
      if (reason.includes("lease")) {
        leaseClaimed = false;
        syncControlState();
      }
    }
    if (message.type === "live.state") {
      operationMessageCount += 1;
      aiReceived.textContent = String(operationMessageCount);
      aiProgress.textContent = `已接收 ${operationMessageCount} 条实时操作证据`;
    }
    if (message.type === "teacher.analytics.result" && message.ok && message.result) {
      const result = message.result as { resultId: string; recommendations?: Array<{ recommendationId: string; label: string; status: string }>; classifications?: Array<{ code: string }> };
      latestAnalytics = { resultId: result.resultId, recommendations: result.recommendations ?? [], classifications: result.classifications ?? [] };
      analyzedMessageCount += 1;
      aiAnalyzed.textContent = String(analyzedMessageCount);
      aiProgress.textContent = `已完成 ${analyzedMessageCount} 次基于真实证据的分析`;
      const recommendation = latestAnalytics.recommendations.find((item) => item.status === "candidate");
      analytics.textContent = `${latestAnalytics.classifications.map((item) => item.code).join("、") || "暂无分类"}${recommendation ? ` · ${recommendation.label}` : ""}`;
      confirmAnalytics.hidden = !recommendation;
    }
    if (message.type === "teacher.analytics.confirmed" && message.ok) {
      confirmAnalytics.hidden = true;
      analytics.textContent = "分析建议已由教师确认并进入 Stage。";
      if (message.stage && typeof message.stage === "object") {
        stage = message.stage as TeacherStage;
        activeSources = new Set(stage.payload.sources ?? (stage.payload.source ? [stage.payload.source] : []));
      }
    }
    if (message.type === "teacher.annotation.ack" && message.ok && message.stage && typeof message.stage === "object") {
      stage = message.stage as TeacherStage;
      activeSources = new Set(stage.payload.sources ?? (stage.payload.source ? [stage.payload.source] : []));
    }
    if (message.type === "presentation.sync" && message.state) {
      presentationState = message.state as typeof presentationState;
      presentationRevision = Number((message.state as { revision?: number }).revision ?? presentationRevision);
      renderPresentationStatus();
    }
    if (message.type === "stage.state" && message.stage) {
      stage = message.stage as TeacherStage;
      activeSources = new Set(stage.payload.sources ?? (stage.payload.source ? [stage.payload.source] : []));
    }
    if ((message.type === "activity.current" || message.type === "classroom.activity") && message.activity) {
      classroomActivityId = String((message.activity as { activity?: { activityId?: string } }).activity?.activityId ?? "");
      app.querySelector<HTMLElement>('[data-field="activity-controls"]')?.querySelectorAll<HTMLButtonElement>("button").forEach((item) => item.classList.toggle("is-active", item.dataset.activityId === classroomActivityId));
    }
    if (message.type === "activity.options" && Array.isArray(message.activities)) {
      activityOptions = (message.activities as Array<{ activityId?: string; label?: string }>).filter((item): item is { activityId: string; label: string } => typeof item.activityId === "string" && typeof item.label === "string");
      const activityControls = app.querySelector<HTMLElement>('[data-field="activity-controls"]');
      if (activityControls) {
        activityControls.replaceChildren();
        for (const option of activityOptions) {
          const item = button(option.label, () => client.sendControl({ type: "teacher.activity.set", activityId: option.activityId }), option.activityId === classroomActivityId ? "is-active" : "");
          item.dataset.activityId = option.activityId;
          activityControls.append(item);
        }
      }
    }
    if ((message.type === "activity.current" || message.type === "classroom.activity") && message.activity) {
      classroomActivityId = String((message.activity as { activity?: { activityId?: string } }).activity?.activityId ?? "");
    }
    if (message.type === "live.state" && message.frame && typeof message.frame === "object") {
      const frame = message.frame as TeacherLiveFrame;
      if (frame.scope?.type === "participant" && typeof frame.scope.id === "string") {
        latestLive = { participantId: frame.scope.id, seq: Number(frame.seq ?? 0), objectCount: Object.keys(liveFrameObjects(frame)).length, frame };
      }
    }
    if (message.type === "teacher.selection.ack" && message.ok) {
      if (Array.isArray(message.selected)) selected = new Set((message.selected as TeacherStudent[]).map((item) => item.participantId));
      if (message.stage && typeof message.stage === "object") {
        stage = message.stage as TeacherStage;
        activeSources = new Set(stage.payload.sources ?? (stage.payload.source ? [stage.payload.source] : []));
      }
    }
    if (message.type === "classroom.submissions" && Array.isArray(message.submissions)) renderSubmissions(message.submissions as Array<{ submissionId: string; submittedBy: string; status: string }>);
    renderStudents();
    renderStage();
    syncControlState();
  });
  copyDisplay.addEventListener("click", async () => {
    if (!displayUrlValue) return;
    try {
      await navigator.clipboard.writeText(displayUrlValue);
      setControlError("大屏地址已复制。");
    } catch {
      setControlError("浏览器未允许复制，请直接选中大屏地址。");
    }
  });
  joinButton.addEventListener("click", () => {
    void join();
  });
  app.querySelector<HTMLButtonElement>('[data-action="claim"]')!.addEventListener("click", () => client.sendControl({ type: "teacher.lease.claim", expectedRevision: leaseRevision }));
  app.querySelector<HTMLButtonElement>('[data-action="random"]')!.addEventListener("click", () => client.sendControl({ type: "teacher.selection.random" }));
  const toggleStageSource = (source: "presentation" | "student-live"): void => {
    if (activeSources.has(source)) activeSources.delete(source);
    else activeSources.add(source);
    if (!activeSources.size) activeSources.add(source);
    client.sendControl({ type: "teacher.stage.composite", sources: [...activeSources], selectedParticipantIds: [...selected], expectedRevision: stage?.revision });
  };
  const setStageSource = (source: "presentation" | "student-live"): void => {
    activeSources = new Set([source]);
    client.sendControl({ type: "teacher.stage.composite", sources: [source], selectedParticipantIds: [...selected], expectedRevision: stage?.revision });
  };
  app.querySelector<HTMLButtonElement>('[data-action="activity"]')!.addEventListener("click", () => toggleStageSource("student-live"));
  app.querySelector<HTMLButtonElement>('[data-action="student-live-source"]')!.addEventListener("click", () => setStageSource("student-live"));
  app.querySelector<HTMLButtonElement>('[data-action="activity-summary"]')!.addEventListener("click", () => client.sendControl({ type: "teacher.stage.source", source: "activity", expectedRevision: stage?.revision }));
  const setClassroomActivity = (activityId: string): void => {
    client.sendControl({ type: "teacher.activity.set", activityId });
  };
  app.querySelector<HTMLButtonElement>('[data-action="phase-one"]')!.addEventListener("click", () => setClassroomActivity("activity:restore-independent"));
  app.querySelector<HTMLButtonElement>('[data-action="phase-two"]')!.addEventListener("click", () => setClassroomActivity("activity:restore-supported"));
  app.querySelector<HTMLButtonElement>('[data-action="entry"]')!.addEventListener("click", () => {
    resourcesColumn.scrollTo({ top: Math.max(0, entryPanel.offsetTop - 18), behavior: "smooth" });
    client.sendControl({ type: "teacher.stage.source", source: "entry", expectedRevision: stage?.revision });
    setControlError("已将课堂入口投到大屏；学生和听课老师可扫码加入。");
  });
  app.querySelector<HTMLButtonElement>('[data-action="presentation"]')!.addEventListener("click", () => toggleStageSource("presentation"));
  app.querySelector<HTMLButtonElement>('[data-action="presentation-source"]')!.addEventListener("click", () => setStageSource("presentation"));
  const sendPresentationControl = (action: "play" | "pause" | "goto", sceneId?: string): void => {
    const payload: Record<string, unknown> = { type: "presentation.control", action, expectedRevision: presentationRevision, controlId: `presentation-${action}-${Date.now()}` };
    if (action === "goto") {
      payload.sceneId = sceneId ?? presentationState?.sceneId;
      payload.step = 0;
    }
    client.sendControl(payload);
  };
  const movePresentation = (direction: -1 | 1): void => {
    const index = presentationScenes.findIndex((scene) => scene.sceneId === presentationState?.sceneId);
    if (index < 0) return;
    let next = index + direction;
    while (next >= 0 && next < presentationScenes.length && presentationScenes[next]?.hidden) next += direction;
    next = Math.max(0, Math.min(presentationScenes.length - 1, next));
    sendPresentationControl("goto", presentationScenes[next]?.sceneId);
  };
  app.querySelector<HTMLButtonElement>('[data-action="presentation-previous"]')!.addEventListener("click", () => movePresentation(-1));
  app.querySelector<HTMLButtonElement>('[data-action="presentation-next"]')!.addEventListener("click", () => movePresentation(1));
  for (const trigger of app.querySelectorAll<HTMLButtonElement>('[data-action="presentation-play"]')) {
    trigger.addEventListener("click", () => sendPresentationControl("play"));
  }
  for (const trigger of app.querySelectorAll<HTMLButtonElement>('[data-action="presentation-pause"]')) {
    trigger.addEventListener("click", () => sendPresentationControl("pause"));
  }
  app.querySelector<HTMLButtonElement>('[data-action="student-search-submit"]')!.addEventListener("click", () => {
    studentSearchTerm = studentSearch.value.trim();
    renderStudents();
  });
  app.querySelector<HTMLInputElement>('[data-field="student-search"]')!.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      studentSearchTerm = studentSearch.value.trim();
      renderStudents();
    }
  });
  app.querySelector<HTMLButtonElement>('[data-action="student-tab-designated"]')!.addEventListener("click", () => {
    app.querySelector('[data-action="student-tab-designated"]')?.classList.add("is-active");
    app.querySelector('[data-action="student-tab-random"]')?.classList.remove("is-active");
  });
  app.querySelector<HTMLButtonElement>('[data-action="student-tab-random"]')!.addEventListener("click", () => {
    app.querySelector('[data-action="student-tab-random"]')?.classList.add("is-active");
    app.querySelector('[data-action="student-tab-designated"]')?.classList.remove("is-active");
    if (client.state.connection === "online") client.sendControl({ type: "teacher.selection.random" });
  });
  app.querySelector<HTMLButtonElement>('[data-action="annotate"]')!.addEventListener("click", () => client.sendControl({ type: "teacher.annotation", text: annotation.value, expectedRevision: stage?.revision }));
  for (const trigger of app.querySelectorAll<HTMLButtonElement>('[data-action="analytics"]')) {
    trigger.addEventListener("click", () => {
      const participantId = [...selected][0];
      if (participantId) client.sendControl({ type: "teacher.analytics.request", participantId });
      else analytics.textContent = "请先选择一名学生。";
    });
  }
  confirmAnalytics.addEventListener("click", () => {
    const recommendation = latestAnalytics?.recommendations.find((item) => item.status === "candidate");
    if (latestAnalytics && recommendation) client.sendControl({ type: "teacher.analytics.confirm", resultId: latestAnalytics.resultId, recommendationId: recommendation.recommendationId, expectedRevision: stage?.revision });
  });
  renderStudents();
  renderStage();
  syncControlState();
  if (locator.value.trim() && credential.value.trim()) void join();
}

function mountTeacherControl(root: HTMLElement, sessionId: string): void {
  throw new Error("legacy-teacher-control-disabled-use-authenticated-classroom");
  /*
    root.replaceChildren();
    const app = document.createElement('main'); app.className = 'teacher-control'; root.append(app);
    app.innerHTML = [
        '<header class="control-header"><div><p class="library-kicker">CLASSCORE · TEACHER RUNTIME</p><h1>课堂控制</h1>',
        '<p class="library-subtitle">控制权由 Controller Lease 固定；大屏只接收已验证的播放状态。</p></div>',
        '<a class="secondary-action" href="/teacher">返回我的课件</a></header><section class="control-card">',
        `<div class="control-meta"><span>课堂</span><strong>${sessionId}</strong></div>`,
        '<p class="control-status">正在读取课堂版本…</p><div class="control-actions" aria-label="课件播放控制"></div></section>',
    ].join('');
    const status = app.querySelector<HTMLElement>('.control-status')!;
    const actions = app.querySelector<HTMLElement>('.control-actions')!;
    let state: { presentationRevisionId: string; sceneId: string; step: number; playState: 'idle' | 'playing' | 'paused'; revision: number; deckId: string } | null = null;
    let scenes: Array<{ sceneId: string; maxStep: number; hidden?: boolean }> = [];
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    const participantId = sessionStorage.getItem('classcore.teacher.participant') ?? `teacher:${crypto.randomUUID()}`;
    sessionStorage.setItem('classcore.teacher.participant', participantId);
    const actionButton = (label: string, action: string): void => {
        const item = document.createElement('button'); item.type = 'button'; item.className = 'control-button'; item.textContent = label;
        item.addEventListener('click', () => {
            if (!socket || socket.readyState !== WebSocket.OPEN || !state) return;
            const index = scenes.findIndex(scene => scene.sceneId === state!.sceneId);
            const currentScene = scenes[index];
            const payload: Record<string, unknown> = { type: 'presentation.control', controlId: `presentation-control-${crypto.randomUUID()}`, action, expectedRevision: state.revision };
            if (action === 'previous' || action === 'next') {
                let nextIndex = index + (action === 'next' ? 1 : -1);
                while (nextIndex >= 0 && nextIndex < scenes.length && scenes[nextIndex]?.hidden) nextIndex += action === 'next' ? 1 : -1;
                nextIndex = Math.max(0, Math.min(scenes.length - 1, nextIndex));
                payload.action = 'goto'; payload.sceneId = scenes[nextIndex]?.sceneId ?? state.sceneId; payload.step = 0;
            } else if (action === 'set-step') payload.step = Math.min(currentScene?.maxStep ?? state.step + 1, state.step + 1);
            else if (action === 'finish') { payload.action = 'set-step'; payload.step = currentScene?.maxStep ?? state.step; }
            socket.send(JSON.stringify(payload)); status.textContent = '正在同步…';
        });
        actions.append(item);
    };
    async function load(): Promise<void> {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/presentation-runtime`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`课堂读取失败（${response.status}）`);
        const runtime = await response.json() as { runtime: { state: typeof state; revision: { runtimeIndex: { scenes: Array<{ sceneId: string; maxStep: number; hidden?: boolean }> } } } };
        state = runtime.runtime.state;
        if (!state) throw new Error('课堂尚未准备课件');
        scenes = runtime.runtime.revision.runtimeIndex.scenes;
        status.textContent = `已准备 · ${state.sceneId} · 动画 ${state.step} · revision ${state.revision}`;
    }
    function connect(): void {
        if (closed) return;
        if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
        socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`);
        const clientId = `teacher-connection-${crypto.randomUUID()}`;
        socket.addEventListener('open', () => {
            socket?.send(JSON.stringify({ type: 'hello', role: 'teacher', clientId, participantId, sessionId }));
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(() => socket?.send(JSON.stringify({ type: 'teacher.heartbeat' })), 15000);
        });
        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)) as { type?: string; ok?: boolean; state?: typeof state; reason?: string };
            if (message.type === 'hello.ack') {
                if (message.ok === false) status.textContent = message.reason === 'lease-held-by-other' ? '控制权被其他教师占用' : `控制连接失败：${message.reason ?? '未知原因'}`;
                else status.textContent = '控制已连接';
                return;
            }
            if (message.type === 'teacher.heartbeat.ack' && message.ok === false) {
                status.textContent = message.reason === 'controller-lease-held-by-other' ? '控制权被其他教师占用' : '正在重新连接';
                return;
            }
            if (message.type !== 'presentation.control.ack') return;
            if (!message.ok || !message.state) { status.textContent = `控制未执行：${message.reason ?? '未知原因'}`; return; }
            state = message.state; status.textContent = `已同步 · ${state.sceneId} · 动画 ${state.step} · revision ${state.revision}`;
        });
        socket.addEventListener('close', () => {
            if (closed) return;
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = null;
            status.textContent = '正在重新连接';
            reconnectTimer = setTimeout(connect, 800);
        });
    }
    actionButton('上一页', 'previous');
    actionButton('下一页', 'next');
    actionButton('下一动画', 'set-step');
    actionButton('完成当前页', 'finish');
    actionButton('播放', 'play');
    actionButton('暂停', 'pause');
    void load().then(connect).catch(error => { status.textContent = error instanceof Error ? error.message : '课堂暂不可用'; });
    window.addEventListener('beforeunload', () => {
        closed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        socket?.close();
    });
    */
}
