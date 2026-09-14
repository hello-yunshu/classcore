import { CLIENT_RUNTIME_BUDGETS, getSurfaceDescriptor } from "@classroom/surfaces";
import { ClassroomClient } from "@classroom/classroom-client";
import { createWebPptPlaybackAssetFromBytes, type WebPptPlaybackAsset, WebPptPlaybackEngineAdapter } from "@classroom/presentation-webppt-adapter/playback";
import * as QRCode from "qrcode";

export const surface = getSurfaceDescriptor("display");
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS.display;

type RuntimeSnapshot = {
  pin: { sessionId: string; presentationId: string; revisionId: string; assetId: string };
  revision: { fingerprint: string; document: WebPptPlaybackAsset["document"]; runtimeIndex: { width?: number; height?: number; scenes: Array<{ sceneId: string; hidden?: boolean }> } };
  state: { sessionId: string; presentationRevisionId: string; assetId: string; deckId: string; sceneId: string; step: number; playState: "idle" | "playing" | "paused"; revision: number };
};
type ClassroomStageWidget = {
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
  liveFrames?: PublicLiveFrame[];
};
type ClassroomArtifactContent = { recordText?: string; objectCount?: number; solved?: boolean | null; tokens?: Array<{ kind?: string; display?: string }>; objects?: Array<{ shape?: string; x?: number; y?: number; rotation?: number }> };
type PublicLiveFrame = { subjectId?: string; payload?: { objects?: Record<string, unknown> } };
type ClassroomJoinLinks = { student?: string; observer?: string };

function renderPublicStudentBoards(container: HTMLElement, frames: PublicLiveFrame[] = []): void {
  container.replaceChildren();
  for (const frame of frames.slice(0, 4)) {
    const card = document.createElement("article");
    card.className = "display-student-card";
    const title = document.createElement("strong");
    title.textContent = frame.subjectId ?? "匿名学生";
    card.append(title);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 8");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("aria-label", `${frame.subjectId ?? "匿名学生"}的实时操作`);
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "16");
    bg.setAttribute("height", "8");
    bg.setAttribute("fill", "#fbfaf7");
    svg.append(bg);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "8");
    circle.setAttribute("cy", "4");
    circle.setAttribute("r", "2");
    circle.setAttribute("fill", "#fbfaf7");
    circle.setAttribute("stroke", "#24324b");
    circle.setAttribute("stroke-width", ".035");
    svg.append(circle);
    for (const raw of Object.values(frame.payload?.objects ?? {})) {
      const object = raw as {
        x?: number;
        y?: number;
        rotation?: number;
        rotationCenter?: { x?: number; y?: number };
        geometry?: { path?: string; internalElements?: Array<{ type?: string; cx?: number; cy?: number; r?: number; d?: string; fill?: string; stroke?: string; strokeWidth?: number }> };
        visual?: { color?: string };
      };
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const cx = Number(object.rotationCenter?.x ?? .5), cy = Number(object.rotationCenter?.y ?? .5);
      group.setAttribute("transform", `translate(${Number(object.x ?? 0)} ${Number(object.y ?? 0)}) rotate(${Number(object.rotation ?? 0)} ${cx} ${cy})`);
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
    card.append(svg);
    container.append(card);
  }
}

function renderArtifactContent(container: HTMLElement, artifact?: ClassroomArtifactContent): void {
  container.replaceChildren();
  if (!artifact) return;
  const heading = document.createElement("strong");
  heading.textContent = `作品内容 · ${artifact.solved === true ? "已完成" : "未完成"}`;
  const record = document.createElement("span");
  record.textContent = artifact.recordText ? `记录：${artifact.recordText}` : "未记录文字";
  const tokens = document.createElement("span");
  tokens.textContent = `表达：${(artifact.tokens ?? []).map((token) => token.display || token.kind || "词元").join("") || "无"}`;
  const objects = document.createElement("span");
  const objectText = (artifact.objects ?? []).slice(0, 6).map((object, index) => `图形${index + 1} ${object.shape ?? "unknown"} · ${object.x ?? 0},${object.y ?? 0} · ${object.rotation ?? 0}°`).join(" ｜ ");
  objects.textContent = `对象：${artifact.objectCount ?? 0}${objectText ? ` · ${objectText}` : ""}`;
  container.append(heading, record, tokens, objects);
}

function sessionIdFromUrl(): string {
  return new URLSearchParams(window.location.search).get("sessionId")?.trim() || "";
}

export function mountDisplayRuntime(root: HTMLElement): void {
  if (new URLSearchParams(window.location.search).get("mode") === "classroom") {
    void mountAuthenticatedDisplay(root);
    return;
  }
  void mountDisplayRuntimeAsync(root);
}

async function mountAuthenticatedDisplay(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  const app = document.createElement("main");
  app.className = "display-classroom";
  app.innerHTML = [
    '<header class="display-header"><span class="display-mark">C</span><div><span class="display-kicker">CLASSCORE · DISPLAY</span><h1>课堂 Stage</h1></div><span class="display-state" data-field="status">正在认证</span></header>',
    '<section class="display-classroom-stage" data-testid="display-stage"><strong data-field="source">等待 Stage</strong><span data-field="focus">等待教师投影</span><span data-field="widget"></span>' +
      '<div data-field="presentation-player" class="display-presentation-player"></div><div data-field="live-board" class="display-live-board"></div>' +
      '<div data-field="artifact-content" class="artifact-content"></div><span data-field="playback"></span><em data-field="annotation"></em></section>',
    '<section class="display-join-panel" data-field="join-panel" hidden>' +
      '<div class="display-join-heading"><strong>扫码加入课堂</strong><span>二维码按当前大屏网址生成，网络地址变化后刷新大屏即可更新</span></div>' +
      '<div class="display-join-grid"><article class="display-join-card"><canvas data-qr="student" aria-label="学生端课堂二维码"></canvas><strong>学生端</strong><span>扫码后输入学号</span><code data-field="student-url"></code></article>' +
      '<article class="display-join-card"><canvas data-qr="observer" aria-label="Observer 观察端二维码"></canvas><strong>Observer 观察端</strong><span>扫码后自动进入匿名观察</span><code data-field="observer-url"></code></article></div></section>',
    '<footer class="display-footer">只读投影 · 身份由服务器裁剪</footer>',
  ].join("");
  root.append(app);
  const status = app.querySelector<HTMLElement>('[data-field="status"]')!;
  const source = app.querySelector<HTMLElement>('[data-field="source"]')!;
  const focus = app.querySelector<HTMLElement>('[data-field="focus"]')!;
  const widget = app.querySelector<HTMLElement>('[data-field="widget"]')!;
  const artifactContent = app.querySelector<HTMLElement>('[data-field="artifact-content"]')!;
  const playback = app.querySelector<HTMLElement>('[data-field="playback"]')!;
  const annotation = app.querySelector<HTMLElement>('[data-field="annotation"]')!;
  const liveBoard = app.querySelector<HTMLElement>('[data-field="live-board"]')!;
  const presentationPlayer = app.querySelector<HTMLElement>('[data-field="presentation-player"]')!;
  const joinPanel = app.querySelector<HTMLElement>('[data-field="join-panel"]')!;
  const client = new ClassroomClient({ clientBuild: "display-web-dev", sessionStorageKey: "classcore.display.classroom.join.v1" });
  const sessionId = sessionIdFromUrl();
  const engine = new WebPptPlaybackEngineAdapter();
  let player: Awaited<ReturnType<typeof engine.mountPlayer>> | null = null;
  let mountedPresentationRevision = "";
  let joinLinks: ClassroomJoinLinks | null = null;
  let showJoinPanel = false;
  async function renderJoinLinks(links: ClassroomJoinLinks): Promise<void> {
    const entries = [
      ["student", links.student, "student-url"],
      ["observer", links.observer, "observer-url"],
    ] as const;
    joinPanel.hidden = !showJoinPanel;
    if (!showJoinPanel) return;
    await Promise.all(entries.map(async ([kind, url, field]) => {
      const canvas = app.querySelector<HTMLCanvasElement>(`canvas[data-qr="${kind}"]`);
      const label = app.querySelector<HTMLElement>(`[data-field="${field}"]`);
      if (!canvas || !label || !url) return;
      label.textContent = url;
      try {
        await QRCode.toCanvas(canvas, url, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 220,
          color: { dark: "#24324b", light: "#fbfaf7" },
        });
      } catch {
        label.textContent = "二维码生成失败，请刷新大屏";
      }
    }));
  }
  async function mountPresentation(): Promise<void> {
    if (!sessionId) return;
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/presentation-runtime`, { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as { runtime: RuntimeSnapshot | null };
    if (!body.runtime?.revision?.document?.idPrefix) return;
    const assetResponse = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/presentation-runtime/asset`, { cache: "no-store" });
    if (!assetResponse.ok) return;
    const bytes = new Uint8Array(await assetResponse.arrayBuffer());
    const asset = await createWebPptPlaybackAssetFromBytes("课堂课件", bytes, body.runtime.revision.document.idPrefix, body.runtime.state.deckId);
    if (asset.source?.sha256 !== body.runtime.revision.fingerprint) return;
    const { width, height } = body.runtime.revision.runtimeIndex;
    presentationPlayer.style.setProperty("--display-aspect-ratio", `${width} / ${height}`);
    player?.dispose();
    presentationPlayer.replaceChildren();
    player = await engine.mountPlayer(presentationPlayer, asset, { context: { sessionId, surface: "display" } });
    await player.applyAuthoritativeState(body.runtime.state);
    mountedPresentationRevision = body.runtime.state.presentationRevisionId;
  }
  const applyStage = (
    stage: { payload?: { source?: string; sources?: string[] | null; selectedCount?: number; annotation?: string | null; artifactContents?: ClassroomArtifactContent[]; liveFrames?: PublicLiveFrame[]; widget?: ClassroomStageWidget } },
  ): void => {
    const payload = stage.payload ?? {};
    const selectedArtifact = payload.widget?.selector === "selected-artifact";
    const selectedLive = payload.widget?.selector === "selected-live-view";
    const currentActivity = payload.widget?.selector === "current-activity-summary";
    const sources = payload.sources ?? (payload.source ? [payload.source] : []);
    showJoinPanel = sources.includes("entry") || payload.source === "entry";
    source.textContent = selectedArtifact
      ? "学生作品对比"
      : currentActivity
      ? "当前活动摘要"
      : showJoinPanel
      ? "课堂入口"
      : sources.includes("presentation") && sources.includes("student-live")
      ? "PPT + 学生操作"
      : sources.includes("presentation")
      ? "Presentation 权威源"
      : "学生实时视图";
    if (selectedArtifact) focus.textContent = `已选 ${payload.widget?.artifactCount ?? 0} 份作品证据`;
    else if (currentActivity) focus.textContent = `${payload.widget?.activityType ?? "活动"} · ${payload.widget?.appletCount ?? 0} 个互动组件`;
    else if (selectedLive) focus.textContent = `已选 ${payload.widget?.selectedCount ?? payload.selectedCount ?? 0} 个实时视图`;
    else if (showJoinPanel) focus.textContent = "请使用大屏二维码加入课堂";
    else focus.textContent = `教师聚焦 ${payload.selectedCount ?? 0} 人`;
    if (selectedArtifact) widget.textContent = `selected-artifact · ${payload.widget?.evidenceCount ?? 0} 条证据`;
    else if (currentActivity) widget.textContent = `current-activity-summary · ${payload.widget?.participantMode ?? "unknown"} · 提交 ${payload.widget?.submissionPolicy ?? "none"}`;
    else if (selectedLive) widget.textContent = `selected-live-view · ${payload.widget?.activeCount ?? 0} 个活动视图 · ${payload.widget?.objectCount ?? 0} 个对象`;
    else widget.textContent = "";
    renderArtifactContent(artifactContent, payload.artifactContents?.[0]);
    renderPublicStudentBoards(liveBoard, payload.liveFrames ?? payload.widget?.liveFrames);
    annotation.textContent = payload.annotation ? `标注：${payload.annotation}` : "";
    presentationPlayer.hidden = showJoinPanel;
    liveBoard.hidden = showJoinPanel || (sources.length > 0 && !sources.includes("student-live") && !selectedLive);
    artifactContent.hidden = showJoinPanel;
    playback.hidden = showJoinPanel;
    annotation.hidden = showJoinPanel;
    joinPanel.hidden = !showJoinPanel;
    if (joinLinks) void renderJoinLinks(joinLinks);
  };
  client.onMessage((message) => {
    if (message.type === "stage.state" && message.stage) applyStage(message.stage as { payload?: { source?: string; selectedCount?: number; annotation?: string | null } });
    if (message.type === "presentation.sync" && message.state) {
      const state = message.state as { sceneId?: string; step?: number; playState?: string };
      playback.textContent = `播放 ${state.sceneId ?? "未知场景"} · step ${state.step ?? 0} · ${state.playState ?? "idle"}`;
      if (!player || mountedPresentationRevision !== (message.state as { presentationRevisionId?: string }).presentationRevisionId) void mountPresentation();
      else void player.applyAuthoritativeState(message.state as never);
    }
    if (message.type === "classroom.join-links" && message.links && typeof message.links === "object") {
      joinLinks = message.links as ClassroomJoinLinks;
      void renderJoinLinks(joinLinks);
    }
    if (message.type === "server.hello") status.textContent = "已连接 · 只读投影";
  });
  if (!sessionId) {
    status.textContent = "缺少 sessionId";
    return;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const locator = params.get("locator")?.trim() ?? "";
    const code = params.get("code")?.trim() ?? "";
    if (!locator || !code) throw new Error("display-session-credentials-required");
    const result = await client.join({ joinRequestId: `join:display:${Date.now()}`, runtimeApiVersion: 1, sessionLocator: locator, requestedRole: "display", credential: { type: "display-token", value: code } });
    if (result.grant.sessionId !== sessionId) throw new Error("display-session-mismatch");
    await client.connect();
    status.textContent = "已连接 · 只读投影";
    void mountPresentation();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "大屏加入失败";
  }
}

async function mountDisplayRuntimeAsync(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  const app = document.createElement("main");
  app.className = "display-runtime";
  app.innerHTML =
    '<header class="display-header"><span class="display-mark">C</span><div><span class="display-kicker">CLASSCORE · DISPLAY</span><h1>课堂大屏</h1></div><span class="display-state">正在连接</span></header><section class="display-stage" aria-label="课件播放区"></section><footer class="display-footer">只读播放 · 课堂版本由 Session Pin 固定</footer>';
  root.append(app);
  const stage = app.querySelector<HTMLElement>(".display-stage")!;
  const status = app.querySelector<HTMLElement>(".display-state")!;
  const sessionId = sessionIdFromUrl();
  if (!sessionId) {
    status.textContent = "等待课堂 sessionId";
    stage.innerHTML = '<div class="display-empty"><strong>等待课堂</strong><span>请使用 /display?sessionId=… 打开已准备的课堂。</span></div>';
    return;
  }
  const engine = new WebPptPlaybackEngineAdapter();
  let player: Awaited<ReturnType<typeof engine.mountPlayer>> | null = null;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let mountedIdentity = "";
  let accessToken: string | null = null;
  let closed = false;

  async function loadRuntime(): Promise<RuntimeSnapshot> {
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/presentation-runtime`, { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 410 ? "课堂已结束" : `运行时读取失败（${response.status}）`);
    const body = await response.json() as { runtime: RuntimeSnapshot | null };
    if (!body.runtime) throw new Error("课堂尚未准备课件");
    return body.runtime;
  }

  async function mountExact(snapshot: RuntimeSnapshot): Promise<void> {
    if (!snapshot.revision.document?.idPrefix) throw new Error("课堂版本缺少稳定文档标识");
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/presentation-runtime/asset`, { cache: "no-store" });
    if (!response.ok) throw new Error(`课堂资源读取失败（${response.status}）`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const asset = await createWebPptPlaybackAssetFromBytes("课堂课件", bytes, snapshot.revision.document.idPrefix, snapshot.state.deckId);
    if (asset.source?.sha256 !== snapshot.revision.fingerprint) throw new Error("课堂资源指纹不匹配，已阻止播放");
    const { width, height } = snapshot.revision.runtimeIndex;
    const aspectWidth = Number(width);
    const aspectHeight = Number(height);
    if (!Number.isFinite(aspectWidth) || !Number.isFinite(aspectHeight) || aspectWidth <= 0 || aspectHeight <= 0) {
      throw new Error("课堂版本缺少可信页面比例");
    }
    stage.style.setProperty("--display-aspect-ratio", `${aspectWidth} / ${aspectHeight}`);
    player?.dispose();
    stage.replaceChildren();
    player = await engine.mountPlayer(stage, asset, { context: { sessionId, surface: "display" } });
    await player.applyAuthoritativeState(snapshot.state);
    mountedIdentity = snapshot.pin.revisionId;
    status.textContent = "已连接 · 精确课堂版本";
  }

  async function refresh(): Promise<void> {
    try {
      await mountExact(await loadRuntime());
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "课堂暂不可用";
    }
  }

  async function prepareSocketCredentials(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const response = await fetch("/api/classroom/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        joinRequestId: `join:display-playback:${Date.now()}`,
        runtimeApiVersion: 1,
        sessionLocator: params.get("locator")?.trim() ?? "",
        requestedRole: "display",
        credential: { type: "display-token", value: params.get("code")?.trim() ?? "" },
      }),
    });
    if (response.status === 404) return;
    const body = await response.json() as { grant?: { sessionId?: string; accessToken?: string }; error?: string };
    if (!response.ok || !body.grant?.accessToken) throw new Error(body.error ?? "display-join-failed");
    if (body.grant.sessionId !== sessionId) throw new Error("display-session-mismatch");
    accessToken = body.grant.accessToken;
  }

  function connect(): void {
    if (closed) return;
    socket = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`);
    socket.addEventListener("open", () =>
      socket?.send(JSON.stringify(
        accessToken
          ? {
            type: "client.hello",
            protocolVersion: 1,
            runtimeApiVersion: 1,
            clientBuild: "display-web-playback",
            accessToken,
            capabilityReport: {
              capabilityReportVersion: 1,
              secureContext: window.isSecureContext,
              indexedDb: typeof window.indexedDB !== "undefined",
              pointerEvents: typeof window.PointerEvent !== "undefined",
              webWorkers: typeof window.Worker !== "undefined",
              webSocket: typeof window.WebSocket !== "undefined",
            },
          }
          : { type: "hello", role: "display", clientId: `display-${crypto.randomUUID()}`, sessionId },
      )));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { type?: string; state?: RuntimeSnapshot["state"] | null; reason?: string };
      if (message.type === "server.hello" && player) status.textContent = "已连接 · 精确课堂版本";
      if (message.type !== "presentation.sync") return;
      if (!message.state) {
        status.textContent = message.reason === "session-ended" ? "课堂已结束" : "等待课件";
        return;
      }
      const nextIdentity = message.state.presentationRevisionId ?? "";
      if (!player || (mountedIdentity && mountedIdentity !== nextIdentity)) {
        void refresh();
        return;
      }
      void Promise.resolve(player.applyAuthoritativeState(message.state)).then(() => {
        status.textContent = "已同步 · 权威播放位置";
      }).catch(() => {
        void refresh();
      });
    });
    socket.addEventListener("close", () => {
      if (closed) return;
      status.textContent = "连接中断 · 正在重连";
      reconnectTimer = setTimeout(connect, 1200);
    });
  }

  window.addEventListener("beforeunload", () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.close();
    player?.dispose();
  });
  await refresh();
  try {
    await prepareSocketCredentials();
    connect();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "大屏认证失败";
  }
}
