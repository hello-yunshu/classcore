import { CLIENT_RUNTIME_BUDGETS, getSurfaceDescriptor } from "@classroom/surfaces";
import { type ClassroomAppletDescriptor, ClassroomClient, type ClassroomCurrentActivity } from "@classroom/classroom-client";
import { type AppletHost, AppletHostRuntime, AppletRegistry } from "@classroom/applet-sdk";
import {
  commitPreview,
  createInitialTransformBoardState,
  createTransformBoardAppletFactory,
  isTransformBoardSolved,
  isValidPivot,
  normalizeDegrees,
  objectWorldPoint,
  previewRotation,
  previewTranslate,
  reduceTransformBoard,
  restoreBoardState,
  selectPivot,
  serializeBoardState,
  TRANSFORM_BOARD_MANIFEST,
  type TransformAction,
  type TransformBoardState,
  type TransformMode,
  type TransformObject,
  translateGrid,
} from "@classroom/transform-board";
export const surface = getSurfaceDescriptor("student");
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS.student;
export type { TransformAction, TransformBoardState, TransformMode, TransformObject };
export { commitPreview, createInitialTransformBoardState, isTransformBoardSolved, isValidPivot, normalizeDegrees, previewRotation, previewTranslate, reduceTransformBoard, restoreBoardState, selectPivot, serializeBoardState, translateGrid };

export type StudentMode = "practice" | "classroom";
export interface StudentClassroomOptions {
  client?: ClassroomClient;
  defaultSessionLocator?: string;
}

type ClassroomRecordToken = { kind: string; value: string; display: string };

interface ClassroomRecordVocabulary {
  label?: string;
  figurePrefix?: string;
  vertexPrefix?: string;
  tokens?: ClassroomRecordToken[];
}

const STORAGE_KEY = "classcore.student.transform-board.v1";
function restoreBoard(): TransformBoardState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialTransformBoardState();
    }
    const parsed = JSON.parse(raw) as TransformBoardState;
    if (!parsed || typeof parsed !== "object" || !parsed.objects) {
      return createInitialTransformBoardState();
    }
    return { ...createInitialTransformBoardState(), ...parsed, mode: "select" };
  } catch {
    return createInitialTransformBoardState();
  }
}

function saveBoard(state: TransformBoardState): TransformBoardState {
  const savedAt = new Date().toISOString();
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt }));
  return { ...state, savedAt };
}

function iconLabel(text: string, className = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function button(label: string, action: () => void, className = ""): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", action);
  return element;
}

export function mountStudentPractice(root: HTMLElement): void {
  let state = restoreBoard();
  let drag: { objectId: string | null; startX: number; startY: number; startAngle: number; startRotation: number; kind: "move" | "pan" | "rotate" } | null = null;
  root.replaceChildren();
  const app = document.createElement("div");
  app.className = "student-app";
  root.append(app);

  const header = document.createElement("header");
  header.className = "student-header";
  header.innerHTML = '<div><span class="eyebrow">CLASSCORE · PRACTICE</span><h1>在画布上练习图形变换</h1></div><div class="header-status"><span class="status-dot"></span><span id="save-status">本地练习</span></div>';
  app.append(header);

  const layout = document.createElement("main");
  layout.className = "student-layout";
  const side = document.createElement("aside");
  side.className = "student-brief";
  side.innerHTML = [
    '<span class="step-mark">先观察，再动手</span>',
    "<h2>选择对象，练习<br>拖动与旋转。</h2>",
    "<p>选择对象后拖动它。打开“旋转中心”，再点一下对象上的位置，看看旋转会发生什么变化。</p>",
    '<div class="target-card"><div class="target-title">练习提示</div>',
    '<div class="target-caption">先观察，再操作。<br>每一步都会自动保存在本机。</div></div>',
    '<div class="tip"><strong>小提示</strong><span>旋转中心不一定在正中央。</span></div>',
  ].join("");
  layout.append(side);

  const workspace = document.createElement("section");
  workspace.className = "student-workspace";
  const toolbar = document.createElement("div");
  toolbar.className = "board-toolbar";
  const modeLabel = document.createElement("span");
  modeLabel.className = "toolbar-label";
  toolbar.append(modeLabel);
  const modeButtons = document.createElement("div");
  modeButtons.className = "mode-buttons";
  const modeSelect = button("选择", () => setState(reduceTransformBoard(state, { type: "set-mode", mode: "select" })), "tool-button");
  const modePan = button("平移画布", () => setState(reduceTransformBoard(state, { type: "set-mode", mode: "pan" })), "tool-button");
  const modeCenter = button("旋转中心", () => setState(reduceTransformBoard(state, { type: "set-mode", mode: "rotate-center" })), "tool-button");
  modeButtons.append(modeSelect, modePan, modeCenter);
  toolbar.append(modeButtons);
  const toolbarActions = document.createElement("div");
  toolbarActions.className = "toolbar-actions";
  toolbarActions.append(button("重置", () => setState(reduceTransformBoard(state, { type: "reset" })), "quiet-button"));
  toolbarActions.append(button("保存进度", () => setState(saveBoard(state)), "primary-button"));
  toolbar.append(toolbarActions);
  workspace.append(toolbar);

  const boardFrame = document.createElement("div");
  boardFrame.className = "board-frame";
  const board = document.createElement("div");
  board.className = "transform-board";
  boardFrame.append(board);
  workspace.append(boardFrame);
  const selectionBar = document.createElement("div");
  selectionBar.className = "selection-bar";
  workspace.append(selectionBar);
  layout.append(workspace);
  app.append(layout);

  function setState(next: TransformBoardState): void {
    state = next;
    render();
  }

  function render(): void {
    const selected = state.selectedObjectId ? state.objects[state.selectedObjectId] : null;
    modeLabel.textContent = state.mode === "rotate-center" ? "点击对象设置旋转中心" : state.mode === "pan" ? "拖动画布查看全局" : selected ? `已选择对象 ${selected.label}` : "选择一个对象开始";
    const modes: Array<[TransformMode, HTMLButtonElement]> = [["select", modeSelect], ["pan", modePan], ["rotate-center", modeCenter]];
    for (const [mode, element] of modes) {
      element.classList.toggle("active", state.mode === mode);
    }
    const saved = document.querySelector("#save-status");
    if (saved) {
      saved.textContent = state.savedAt ? `已保存 ${new Date(state.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "本地练习";
    }
    board.style.setProperty("--board-pan-x", `${state.pan.x}px`);
    board.style.setProperty("--board-pan-y", `${state.pan.y}px`);
    board.replaceChildren();
    for (const object of Object.values(state.objects).sort((a, b) => a.zIndex - b.zIndex)) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `fragment fragment-${object.shape}${state.selectedObjectId === object.id ? " selected" : ""}`;
      element.dataset.objectId = object.id;
      element.style.left = `${object.x}px`;
      element.style.top = `${object.y}px`;
      element.style.width = `${object.width}px`;
      element.style.height = `${object.height}px`;
      element.style.zIndex = String(object.zIndex);
      element.style.background = object.visual?.color ?? "#5575b8";
      element.style.clipPath = object.visual?.clipPath ?? "none";
      element.style.transform = `rotate(${object.rotation}deg)`;
      element.setAttribute("aria-label", `对象 ${object.label}`);
      element.append(iconLabel(object.label, "fragment-label"));
      if (state.selectedObjectId === object.id) {
        const center = document.createElement("span");
        center.className = "rotation-center";
        center.style.left = `${object.rotationCenter.x * 100}%`;
        center.style.top = `${object.rotationCenter.y * 100}%`;
        center.textContent = "＋";
        element.append(center);
        const handle = document.createElement("span");
        handle.className = "rotation-handle";
        handle.setAttribute("aria-label", "拖动旋转");
        element.append(handle);
        handle.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + object.width * object.rotationCenter.x;
          const centerY = rect.top + object.height * object.rotationCenter.y;
          drag = { objectId: object.id, startX: event.clientX, startY: event.clientY, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX), startRotation: object.rotation, kind: "rotate" };
          element.setPointerCapture(event.pointerId);
        });
      }
      element.addEventListener("pointerdown", (event) => {
        if (state.mode === "rotate-center") {
          event.preventDefault();
          const rect = element.getBoundingClientRect();
          setState(reduceTransformBoard(state, { type: "set-rotation-center", objectId: object.id, x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }));
          return;
        }
        if (state.mode !== "select") {
          return;
        }
        event.preventDefault();
        setState(reduceTransformBoard(state, { type: "select", objectId: object.id }));
        drag = { objectId: object.id, startX: event.clientX, startY: event.clientY, startAngle: 0, startRotation: object.rotation, kind: "move" };
        element.setPointerCapture(event.pointerId);
      });
      element.addEventListener("pointermove", (event) => {
        if (!drag || drag.objectId !== object.id) {
          return;
        }
        if (drag.kind === "move") {
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          drag.startX = event.clientX;
          drag.startY = event.clientY;
          setState(reduceTransformBoard(state, { type: "move", objectId: object.id, dx, dy }));
        }
        if (drag.kind === "rotate") {
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + object.width * object.rotationCenter.x;
          const centerY = rect.top + object.height * object.rotationCenter.y;
          const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
          setState(reduceTransformBoard(state, { type: "rotate", objectId: object.id, delta: (angle - drag.startAngle) * 180 / Math.PI + drag.startRotation - object.rotation }));
        }
      });
      element.addEventListener("pointerup", () => {
        drag = null;
      });
      board.append(element);
    }
    selectionBar.replaceChildren();
    if (selected) {
      const label = document.createElement("span");
      label.className = "selected-name";
      label.textContent = `对象 ${selected.label} · 旋转 ${Math.round(selected.rotation)}°`;
      selectionBar.append(label);
      selectionBar.append(button("↶ 15°", () => setState(reduceTransformBoard(state, { type: "rotate", objectId: selected.id, delta: -15 })), "rotate-button"));
      selectionBar.append(button("↷ 15°", () => setState(reduceTransformBoard(state, { type: "rotate", objectId: selected.id, delta: 15 })), "rotate-button"));
      const hint = document.createElement("span");
      hint.className = "selection-hint";
      hint.textContent = "拖动圆点可自由旋转";
      selectionBar.append(hint);
    }
  }
  board.addEventListener("pointerdown", (event) => {
    if (state.mode !== "pan" || event.target !== board) {
      return;
    }
    drag = { objectId: null, startX: event.clientX, startY: event.clientY, startAngle: 0, startRotation: 0, kind: "pan" };
    board.setPointerCapture(event.pointerId);
  });
  board.addEventListener("pointermove", (event) => {
    if (!drag || drag.kind !== "pan") {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    setState(reduceTransformBoard(state, { type: "pan", dx, dy }));
  });
  board.addEventListener("pointerup", () => {
    drag = null;
  });
  render();
}

function activityConfig(descriptor: ClassroomAppletDescriptor): Record<string, unknown> {
  const payload = descriptor.config.payload;
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : descriptor.config;
}

function recordVocabularyFrom(config: Record<string, unknown>): ClassroomRecordVocabulary {
  const rules = config.rules && typeof config.rules === "object" ? config.rules as Record<string, unknown> : null;
  const value = config.recordVocabulary ?? rules?.recordVocabulary;
  if (!value || typeof value !== "object") return {};
  const vocabulary = value as Record<string, unknown>;
  const tokens = Array.isArray(vocabulary.tokens)
    ? vocabulary.tokens.filter((item) =>
      item && typeof item === "object" && typeof (item as Record<string, unknown>).kind === "string" && typeof (item as Record<string, unknown>).value === "string" && typeof (item as Record<string, unknown>).display === "string"
    ) as ClassroomRecordToken[]
    : [];
  return {
    label: typeof vocabulary.label === "string" ? vocabulary.label : undefined,
    figurePrefix: typeof vocabulary.figurePrefix === "string" ? vocabulary.figurePrefix : undefined,
    vertexPrefix: typeof vocabulary.vertexPrefix === "string" ? vocabulary.vertexPrefix : undefined,
    tokens,
  };
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgElement<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function referencePiecePath(object: TransformObject): string {
  return object.geometry.path ?? `M 0 0 H ${object.width} V ${object.height} H 0 Z`;
}

function svgPointFromClient(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const matrix = svg.getScreenCTM();
  if (!matrix) {
    const rect = svg.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * 16, y: (clientY - rect.top) / rect.height * 8 };
  }
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

function svgPointFromEvent(svg: SVGSVGElement, event: PointerEvent): { x: number; y: number } {
  return svgPointFromClient(svg, event.clientX, event.clientY);
}

function renderReferenceBoard(
  svg: SVGSVGElement,
  state: TransformBoardState,
  selectedObjectId: string | null,
  rotationVertexId: string | null,
  onPiece: (objectId: string, event: PointerEvent) => void,
  onVertex: (objectId: string, vertexId: string, event: Event) => void,
  onFigure: (objectId: string) => void,
): void {
  svg.replaceChildren();
  const defs = svgElement("defs");
  const pattern = svgElement("pattern");
  pattern.id = "lesson-grid";
  pattern.setAttribute("width", "1");
  pattern.setAttribute("height", "1");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  const gridPath = svgElement("path");
  gridPath.setAttribute("d", "M 1 0 L 0 0 0 1");
  gridPath.setAttribute("fill", "none");
  gridPath.setAttribute("stroke", "#69727d");
  gridPath.setAttribute("stroke-width", "0.018");
  gridPath.setAttribute("stroke-dasharray", "0.08 0.08");
  gridPath.setAttribute("opacity", "0.68");
  pattern.append(gridPath);
  defs.append(pattern);
  svg.append(defs);
  const paper = svgElement("rect");
  paper.setAttribute("width", "16");
  paper.setAttribute("height", "8");
  paper.setAttribute("fill", "url(#lesson-grid)");
  paper.setAttribute("data-testid", "pattern-grid");
  svg.append(paper);
  const border = svgElement("rect");
  border.setAttribute("width", "16");
  border.setAttribute("height", "8");
  border.setAttribute("fill", "none");
  border.setAttribute("stroke", "#101214");
  border.setAttribute("stroke-width", "0.035");
  border.setAttribute("shape-rendering", "geometricPrecision");
  border.setAttribute("data-testid", "pattern-border");
  svg.append(border);
  const circle = svgElement("circle");
  circle.setAttribute("cx", "8");
  circle.setAttribute("cy", "4");
  circle.setAttribute("r", "2");
  circle.setAttribute("fill", "#FBFAF7");
  circle.setAttribute("stroke", "#24324B");
  circle.setAttribute("stroke-width", "0.035");
  circle.setAttribute("data-piece-id", "fixed-circle");
  svg.append(circle);
  const drawableObjects = [...Object.values(state.objects), ...state.fixedObjects.filter((object) => object.id !== "fixed-circle")];
  for (const object of drawableObjects.sort((a, b) => a.zIndex - b.zIndex)) {
    const group = svgElement("g");
    group.dataset.objectId = object.id;
    group.classList.toggle("fixed-piece", object.fixed);
    group.classList.toggle("movable-piece", !object.fixed);
    group.setAttribute("transform", `translate(${object.x} ${object.y}) rotate(${object.rotation} ${object.rotationCenter.x} ${object.rotationCenter.y})`);
    group.classList.toggle("is-selected", object.id === selectedObjectId);
    group.addEventListener("pointerdown", (event) => onPiece(object.id, event));
    const path = svgElement("path");
    path.setAttribute("d", referencePiecePath(object));
    path.setAttribute("fill", object.visual?.color ?? "#FFD54A");
    path.setAttribute("stroke", "#101214");
    path.setAttribute("stroke-width", "0.035");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("shape-rendering", "geometricPrecision");
    path.setAttribute("data-testid", `piece-${object.id}`);
    group.append(path);
    for (const element of object.geometry.internalElements ?? []) {
      if (element.type === "circle") {
        const mark = svgElement("circle");
        mark.setAttribute("cx", String(element.cx ?? 0));
        mark.setAttribute("cy", String(element.cy ?? 0));
        mark.setAttribute("r", String(element.r ?? 0.1));
        mark.setAttribute("fill", element.fill ?? "#000");
        group.append(mark);
      }
      if (element.type === "path") {
        const mark = svgElement("path");
        mark.setAttribute("d", element.d ?? "");
        mark.setAttribute("fill", element.fill ?? "none");
        mark.setAttribute("stroke", element.stroke ?? "#000");
        // Internal marks use the lesson's coordinate space. Keep their width
        // in that space so the mouth remains visible at the board's 16:8 fit.
        mark.setAttribute("stroke-width", String(Math.max(Number(element.strokeWidth ?? 0.08), 0.06)));
        mark.setAttribute("stroke-linecap", "round");
        mark.setAttribute("stroke-linejoin", "round");
        mark.setAttribute("shape-rendering", "geometricPrecision");
        group.append(mark);
      }
    }
    if (object.id === selectedObjectId) {
      for (const [vertexId, vertex] of Object.entries(object.pivots)) {
        const handle = svgElement("circle");
        handle.setAttribute("cx", String(vertex.x));
        handle.setAttribute("cy", String(vertex.y));
        handle.setAttribute("r", "0.22");
        handle.setAttribute("class", `vertex-handle${rotationVertexId === vertexId ? " is-active" : ""}`);
        handle.setAttribute("aria-label", `顶点 ${vertexId}`);
        handle.setAttribute("role", "button");
        handle.setAttribute("tabindex", "0");
        handle.dataset.objectId = object.id;
        handle.dataset.vertexId = vertexId;
        handle.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          svg.dataset.vertexEventHandled = "1";
          onVertex(object.id, vertexId, event);
        });
        handle.addEventListener("click", (event) => {
          if (svg.dataset.vertexEventHandled === "1") {
            delete svg.dataset.vertexEventHandled;
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          svg.dataset.vertexEventHandled = "1";
          onVertex(object.id, vertexId, event);
        });
        group.append(handle);
      }
      const pivot = svgElement("circle");
      pivot.setAttribute("cx", String(object.rotationCenter.x));
      pivot.setAttribute("cy", String(object.rotationCenter.y));
      pivot.setAttribute("r", "0.11");
      pivot.setAttribute("class", "rotation-pivot");
      pivot.setAttribute("data-testid", "rotation-pivot");
      group.append(pivot);
    }
    svg.append(group);
    // Figure labels remain outside the teaching object and never intercept vertex handles.
    if (selectedObjectId === object.id) {
      const label = svgElement("text");
      label.setAttribute("x", String(object.x + object.width / 2));
      label.setAttribute("y", String(object.y - 0.18));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "piece-caption");
      label.textContent = object.label;
      label.addEventListener("click", () => onFigure(object.id));
      svg.append(label);
    }
  }
}

function mountReferenceClassroomTransformBoard(root: HTMLElement, client: ClassroomClient, current: ClassroomCurrentActivity, descriptor: ClassroomAppletDescriptor): void {
  const grant = client.grant;
  const serverHello = client.state.serverHello;
  if (!grant || !serverHello) throw new Error("classroom-connection-context-missing");
  const registry = new AppletRegistry();
  registry.register(TRANSFORM_BOARD_MANIFEST, createTransformBoardAppletFactory);
  const existingSnapshot = client.state.snapshots[descriptor.instance.appletInstanceId];
  const config = activityConfig(descriptor);
  const vocabulary = recordVocabularyFrom(config);
  const existingFrame = existingSnapshot?.state && typeof existingSnapshot.state === "object"
    ? existingSnapshot.state as Record<string, unknown>
    : null;
  const existingTimer = existingFrame?.timerState && typeof existingFrame.timerState === "object"
    ? existingFrame.timerState as Record<string, unknown>
    : null;
  let snapshotRevision = existingSnapshot?.revision ?? 0;
  let liveSeq = 0;
  const streamId = `stream:${descriptor.instance.appletInstanceId}:${grant.participantId}`;
  let recordTokens: ClassroomRecordToken[] = existingSnapshot?.state && typeof existingSnapshot.state === "object" && Array.isArray((existingSnapshot.state as Record<string, unknown>).recordTokens)
    ? (existingSnapshot.state as Record<string, unknown>).recordTokens as ClassroomRecordToken[]
    : [];
  let startedAt = Date.now();
  let elapsedBefore = Number.isFinite(Number(existingTimer?.elapsedBeforeDisconnectMs)) ? Number(existingTimer?.elapsedBeforeDisconnectMs) : 0;
  let running = existingSnapshot ? existingTimer?.running === true : true;
  let solved = existingFrame?.solvedState === true || existingFrame?.attemptState === "success";
  let runtimeReady = false;
  let progressQueue = Promise.resolve();
  let drag: { kind: "translate" | "rotate"; objectId: string; startX: number; startY: number; startAngle: number; startRotation: number; previewRotation?: number } | null = null;
  let rotationVertexId: string | null = null;
  const host: AppletHost = {
    emitEvent: (intent) => client.emitEvent({ appletInstanceId: descriptor.instance.appletInstanceId, appletEventSchemaVersion: 1, streamId, type: intent.type, payload: intent.payload }),
    publishLiveState: (payload) =>
      client.publishLiveState({
        sessionId: current.sessionId,
        activityId: current.activity.activityId,
        appletInstanceId: descriptor.instance.appletInstanceId,
        scope: { type: "participant", id: grant.participantId },
        streamId: `live:${descriptor.instance.appletInstanceId}:${grant.participantId}`,
        seq: ++liveSeq,
        payload,
      }),
    requestAction: async () => {
      throw new Error("classroom-action-not-supported-in-student-slice");
    },
    saveSnapshot: async (state) => {
      await client.queueSnapshot({
        snapshot: {
          sessionId: current.sessionId,
          activityId: current.activity.activityId,
          appletInstanceId: descriptor.instance.appletInstanceId,
          scope: { type: "participant", id: grant.participantId },
          stateSchemaVersion: 1,
          revision: ++snapshotRevision,
          state,
          capturedAt: new Date().toISOString(),
        },
      });
    },
    getAsset: async (assetId) => {
      const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`);
      if (!response.ok) throw new Error(`asset-not-found:${assetId}`);
      return response.text();
    },
  };
  const runtime = new AppletHostRuntime({
    registry,
    instance: descriptor.instance,
    config,
    context: {
      viewer: { participantId: grant.participantId, role: "student", connectionId: serverHello.connectionId },
      subject: { type: "participant", id: grant.participantId },
      accessMode: "interactive",
      sessionId: current.sessionId,
      lessonId: current.lessonId,
      activityId: current.activity.activityId,
      appletInstanceId: descriptor.instance.appletInstanceId,
      appletTypeId: descriptor.instance.appletTypeId,
      configRef: descriptor.instance.configRef,
    },
    host,
    availableCapabilities: new Set(["pointer-events", "indexeddb", "websocket", ...descriptor.instance.requiredCapabilities]),
    snapshot: existingSnapshot ? { stateSchemaVersion: existingSnapshot.stateSchemaVersion, state: existingSnapshot.state } : null,
  });
  const state = () => runtime.applet.getState() as TransformBoardState;
  const persistProgress = (): Promise<void> => {
    if (!runtimeReady) return Promise.resolve();
    progressQueue = progressQueue.then(async () => {
      const elapsed = elapsedBefore + (running ? Date.now() - startedAt : 0);
      await runtime.applet.handleCommand({
        type: "transform.record.update",
        payload: { recordTokens, timerState: { elapsedBeforeDisconnectMs: elapsed, running } },
      });
      await host.saveSnapshot(serializeBoardState(state()).state as unknown as Record<string, unknown>);
    });
    return progressQueue;
  };
  const startAttemptIfNeeded = (): void => {
    if (running || solved) return;
    startedAt = Date.now();
    running = true;
  };
  root.replaceChildren();
  const app = document.createElement("div");
  const isTwoFragment = config.studentSurfaceLayout === "two-fragment";
  app.className = isTwoFragment ? "student-two-fragment-app" : "app student-reference-app";
  const fourFragmentMarkup = `
    <header class="topbar">
      <div class="title-wrap">
        <div class="logo" aria-hidden="true">🙂</div>
        <div><h1>方格图案运动与还原教学系统</h1><div class="subtitle">观察图形运动，用准确的数学语言记录还原路径</div></div>
      </div>
      <div class="top-actions" aria-label="学生身份">
        <button type="button" id="studentIdentityBtn" class="btn identity" data-field="identity">学号：课堂服务分配</button>
        <span class="status-dot" aria-hidden="true"></span><span data-field="self"></span><span data-field="runtime">已连接</span>
      </div>
    </header>
    <main class="layout">
      <section class="panel workspace-panel">
        <div class="panel-head"><div><div class="panel-title" data-field="lesson">图案还原操作区</div><div class="panel-hint">拖动时一次只沿一个方向平移；点击顶点后可绕该点连续旋转。</div></div></div>
        <div class="timer-row" aria-label="计时"><div id="timer" class="timer">用时 <span data-field="timer">00:00</span></div><span data-field="attempt">正在操作</span></div>
        <div class="workspace-wrap" id="workspaceWrap">
          <svg id="board" class="reference-board" viewBox="0 0 16 8" preserveAspectRatio="xMidYMid meet" role="application" aria-label="16列8行方格纸上的图案还原操作区" focusable="false"></svg>
          <div class="submit-message" data-field="submit-message" aria-live="polite"><div class="submit-card" data-field="submit-card"><div data-field="submit-title" class="submit-title"></div><div data-field="submit-time" class="submit-time"></div></div></div>
        </div>
        <div class="control-row">
          <button id="undoBtn" class="btn" type="button" data-action="undo">返回上一步</button>
          <button id="resetBtn" class="btn danger-lite" type="button" data-action="restart">重新开始</button>
          <span class="control-sep"></span>
          <div class="teacher-tools-inline" aria-label="教师工具"><span class="teacher-tools-label">教师工具</span><button class="btn teacher" type="button" data-action="teacher-number">编号</button><button class="btn teacher" type="button" data-action="teacher-letter">标字母</button></div>
          <div class="legend"><span class="dot"></span> 点击蓝色顶点可选择旋转中心</div>
        </div>
        <div class="classroom-submit-row" hidden><button id="submitBtn" class="btn primary" type="button" data-action="submit">提交答案</button><span data-field="feedback">先观察图案，再开始操作。</span><span data-field="network">课堂服务已连接</span></div>
      </section>
      <aside class="panel record-panel" aria-label="还原路径记录框">
        <div class="record-title-row"><div><h2 class="record-title">还原路径记录框</h2></div></div>
        <div id="recordBox" class="record-box" data-field="record" role="textbox" aria-label="还原路径记录内容" aria-readonly="true"></div>
        <div class="record-submit-area"><div id="submitRoute" class="submit-route" data-field="record-route">提交将由课堂服务确认</div><button id="recordSubmitBtn" class="record-submit-btn" type="button" data-action="submit-record">提交</button><div id="recordSubmitStatus" class="record-submit-status" data-field="record-submit-status" aria-live="polite"></div></div>
        <div class="record-utils"><button id="recordUndo" class="mini-btn" type="button" data-action="delete">⌫ 删除上一个</button><button id="recordClear" class="mini-btn" type="button" data-action="clear">清空记录</button></div>
        <div class="key-section"><div class="section-label">表达词</div><div id="wordKeys" class="key-grid words record-keypad" data-field="keypad"></div></div>
        <div class="input-workbench">
          <div class="input-card"><div class="input-card-title"><span>方向</span></div><div id="directionKeys" class="dpad record-direction" data-field="direction" aria-label="上下左右方向键"></div><div class="input-card-title rotation-title"><span>旋转方向</span></div><div id="rotationKeys" class="key-grid rotation record-rotation" data-field="rotation"></div></div>
          <div class="input-card"><div class="input-card-title"><span>数字</span></div><div id="numberKeys" class="key-grid numbers record-numbers" data-field="numbers"></div><div id="unitKeys" class="key-grid units record-units" data-field="units"></div></div>
        </div>
        <div class="punctuation-row"><div class="punctuation-label">分隔步骤</div><div id="punctuationKeys" class="key-grid punctuation record-punctuation" data-field="punctuation"></div></div>
      </aside>
    </main>`;
  const twoFragmentMarkup =
    `<header class="two-fragment-topbar"><div class="two-fragment-title"><h1>方格图案还原</h1><p>拖动拼片时一次只能沿一个方向整格平移；点击拼片顶点的小圆点可进入旋转模式，再拖动拼片完成旋转。</p></div>` +
    `<div class="two-fragment-toolbar"><button type="button" data-action="undo" class="two-fragment-btn">返回上一步</button><button type="button" data-action="restart" class="two-fragment-btn">重置</button><button type="button" data-action="submit" class="two-fragment-btn primary-button">提交</button></div></header>` +
    `<section class="two-fragment-card"><div class="two-fragment-board-shell"><svg class="reference-board two-fragment-board" viewBox="0 0 16 8" preserveAspectRatio="xMidYMid meet" role="application" aria-label="16列8行方格图案还原操作区"></svg>` +
    `<div class="two-fragment-submit submit-message" data-field="submit-message" aria-live="polite"><div class="submit-card" data-field="submit-card"><strong data-field="submit-title"></strong><span data-field="submit-time"></span></div></div></div>` +
    `<div class="two-fragment-below"><strong data-field="feedback">先观察图案，再开始操作。</strong><span data-field="network">课堂服务已连接</span></div>` +
    `<div class="two-fragment-accessibility" aria-label="操作辅助">` +
    `<button type="button" data-action="compat-select">对象 A</button><button type="button" data-action="compat-left">← 1格</button>` +
    `<button type="button" data-action="compat-right">→ 1格</button><button type="button" data-action="compat-rotate">↻ 90°</button>` +
    `<button type="button" data-action="compat-mode">平移</button></div></section>`;
  app.innerHTML = isTwoFragment ? twoFragmentMarkup : fourFragmentMarkup;
  root.append(app);
  const svg = app.querySelector<SVGSVGElement>(".reference-board")!;
  const timer = app.querySelector<HTMLElement>('[data-field="timer"]') ?? document.createElement("span");
  const feedback = app.querySelector<HTMLElement>('[data-field="feedback"]') ?? document.createElement("span");
  const network = app.querySelector<HTMLElement>('[data-field="network"]') ?? document.createElement("span");
  const record = app.querySelector<HTMLElement>('[data-field="record"]') ?? document.createElement("div");
  const vertices = app.querySelector<HTMLElement>('[data-field="vertices"]') ?? document.createElement("div");
  const units = app.querySelector<HTMLElement>('[data-field="units"]') ?? document.createElement("div");
  const punctuation = app.querySelector<HTMLElement>('[data-field="punctuation"]') ?? document.createElement("div");
  const submitMessage = app.querySelector<HTMLElement>('[data-field="submit-message"]')!;
  const submitCard = app.querySelector<HTMLElement>('[data-field="submit-card"]')!;
  const submitTitle = app.querySelector<HTMLElement>('[data-field="submit-title"]')!;
  const submitTime = app.querySelector<HTMLElement>('[data-field="submit-time"]')!;
  const recordSubmitStatus = app.querySelector<HTMLElement>('[data-field="record-submit-status"]') ?? document.createElement("span");
  const self = client.state.self;
  app.querySelector<HTMLElement>('[data-field="lesson"]')?.replaceChildren(document.createTextNode("图案还原操作区"));
  const identity = app.querySelector<HTMLElement>('[data-field="identity"]');
  if (identity) identity.textContent = self?.seatNo ? `学号：${self.seatNo}` : "学号：课堂服务分配";
  const selfField = app.querySelector<HTMLElement>('[data-field="self"]');
  if (selfField) selfField.textContent = self ? `${self.displayName}${self.seatNo ? ` · ${self.seatNo}` : ""}` : "课堂学生";
  const seatNumber = Number(self?.seatNo?.match(/\d+/)?.[0] ?? "");
  const route = Number.isInteger(seatNumber) && seatNumber > 0
    ? seatNumber % 4 === 0
      ? { description: `${seatNumber}号为本组组长，完成后提交给老师。`, label: "提交给老师" }
      : { description: `你是${seatNumber}号，本组组长是${Math.ceil(seatNumber / 4) * 4}号。`, label: `提交给组长（${Math.ceil(seatNumber / 4) * 4}号）` }
    : { description: "提交将由课堂服务确认。", label: "提交" };
  const recordRoute = app.querySelector<HTMLElement>('[data-field="record-route"]');
  if (recordRoute) recordRoute.textContent = route.description;
  const recordSubmitButton = app.querySelector<HTMLButtonElement>('[data-action="submit-record"]');
  if (recordSubmitButton) recordSubmitButton.textContent = route.label;
  const setNetwork = (value: string): void => {
    network.textContent = value;
  };
  const emitRecord = (token: ClassroomRecordToken): void => {
    startAttemptIfNeeded();
    recordTokens = [...recordTokens, token];
    void client.emitEvent({ appletInstanceId: descriptor.instance.appletInstanceId, appletEventSchemaVersion: 1, streamId, type: "record.token.append", payload: { index: recordTokens.length - 1, token } });
    void persistProgress();
    render();
  };
  const command = (type: string, payload: Record<string, unknown>): void => {
    startAttemptIfNeeded();
    void Promise.resolve(runtime.applet.handleCommand({ type, payload })).then(async () => {
      render();
      await persistProgress();
    }).catch((error) => setNetwork(error instanceof Error ? `操作失败：${error.message}` : "操作失败"));
  };
  const tokenButton = (parent: HTMLElement, token: ClassroomRecordToken): void => {
    const item = button(token.display, () => emitRecord(token), "record-key");
    if (token.display === "平移") item.setAttribute("aria-label", "记录方向");
    parent.append(item);
  };
  const render = (): void => {
    const boardState = state();
    renderReferenceBoard(svg, boardState, boardState.selectedObjectId, rotationVertexId, (objectId, event) => {
      event.preventDefault();
      const object = boardState.objects[objectId];
      if (!object) return;
      command("transform.highlight", { objectId });
      if (rotationVertexId && object.selectedPivotId === rotationVertexId) {
        const pivot = objectWorldPoint(object, object.rotationCenter);
        const point = svgPointFromEvent(svg, event);
        drag = {
          kind: "rotate",
          objectId,
          startX: event.clientX,
          startY: event.clientY,
          startAngle: Math.atan2(point.y - pivot.y, point.x - pivot.x),
          startRotation: object.rotation,
        };
      } else drag = { kind: "translate", objectId, startX: event.clientX, startY: event.clientY, startAngle: 0, startRotation: object.rotation };
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    }, (objectId, vertexId, event) => {
      event.preventDefault();
      event.stopPropagation();
      const activating = rotationVertexId !== vertexId;
      rotationVertexId = activating ? vertexId : null;
      if (activating) emitRecord({ kind: "vertex", value: vertexId, display: vertexId });
      command("transform.select-pivot", { objectId, pivotId: vertexId });
    }, (objectId) => {
      const figureMarks = ["①", "②", "③", "④"];
      const figureIndex = Object.keys(boardState.objects).indexOf(objectId);
      emitRecord({ kind: "figure", value: objectId, display: figureMarks[figureIndex] ?? `图${figureIndex + 1}` });
    });
    record.textContent = recordTokens.map((item) => item.display).join("");
    vertices.replaceChildren();
    const selectedObject = boardState.selectedObjectId ? boardState.objects[boardState.selectedObjectId] : null;
    if (selectedObject) {
      for (const vertexId of Object.keys(selectedObject.pivots)) {
        const vertexButton = button(vertexId, () => {
          rotationVertexId = rotationVertexId === vertexId ? null : vertexId;
          if (rotationVertexId) emitRecord({ kind: "vertex", value: vertexId, display: vertexId });
          command("transform.select-pivot", { objectId: selectedObject.id, pivotId: vertexId });
        }, "record-key vertex-key");
        vertexButton.setAttribute("aria-label", `记录顶点 ${vertexId}`);
        vertices.append(vertexButton);
      }
    }
    feedback.textContent = solved ? "还原成功" : boardState.attemptState === "failure" ? "还原失败 · 继续尝试" : "先观察图案，再开始操作。";
    submitCard.classList.toggle("success", solved);
    submitCard.classList.toggle("fail", !solved && boardState.attemptState === "failure");
    submitMessage.classList.toggle("show", boardState.attemptState === "success" || boardState.attemptState === "failure");
    submitTitle.textContent = solved ? "提交成功" : boardState.attemptState === "failure" ? "继续尝试" : "";
    submitTime.textContent = solved || boardState.attemptState === "failure" ? timer.textContent : "";
    app.querySelector<HTMLElement>('[data-field="attempt"]')?.replaceChildren(document.createTextNode(solved ? "本次尝试已完成" : running ? "正在操作" : "准备开始"));
    const appendUnique = (parent: HTMLElement, items: ClassroomRecordToken[]): void => {
      const seen = new Set<string>();
      for (const item of items) {
        if (seen.has(item.display)) continue;
        seen.add(item.display);
        tokenButton(parent, item);
      }
    };
    const renderTokenSection = (selector: string, items: ClassroomRecordToken[]): void => {
      const parent = app.querySelector<HTMLElement>(selector);
      if (!parent) return;
      parent.replaceChildren();
      appendUnique(parent, items);
    };
    renderTokenSection('[data-field="keypad"]', (vocabulary.tokens ?? []).filter((item) => item.kind === "word"));
    renderTokenSection('[data-field="direction"]', ["↑", "↓", "←", "→"].map((item) => ({ kind: "direction", value: item, display: item })));
    renderTokenSection('[data-field="rotation"]', [
      ...(vocabulary.tokens ?? []).filter((item) => item.kind === "rotation"),
      ...["顺时针", "逆时针", "↻", "↺"].map((item) => ({ kind: "rotation", value: item, display: item })),
    ]);
    renderTokenSection('[data-field="numbers"]', [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((digit) => ({ kind: "digit", value: String(digit), display: String(digit) })));
    renderTokenSection('[data-field="units"]', (vocabulary.tokens ?? []).filter((item) => item.kind === "unit"));
    renderTokenSection('[data-field="punctuation"]', ["，", "；"].map((item) => ({ kind: "separator", value: item, display: item })));
  };
  svg.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const current = state().objects[drag.objectId];
    if (!current) return;
    const point = svgPointFromEvent(svg, event);
    const start = svgPointFromClient(svg, drag.startX, drag.startY);
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    if (drag.kind === "translate") {
      const axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      svg.dataset.preview = `${drag.objectId}:${axis}:${Math.round(axis === "x" ? dx : dy)}`;
    } else {
      const pivot = objectWorldPoint(current, current.rotationCenter);
      const point = svgPointFromEvent(svg, event);
      const nowAngle = Math.atan2(point.y - pivot.y, point.x - pivot.x);
      drag.previewRotation = drag.startRotation + (nowAngle - drag.startAngle) * 180 / Math.PI;
    }
  });
  const activateVertexFromTarget = (event: Event): void => {
    const target = (event.target as Element | null)?.closest?.(".vertex-handle") as SVGCircleElement | null;
    if (!target) return;
    if (svg.dataset.vertexEventHandled === "1") {
      delete svg.dataset.vertexEventHandled;
      return;
    }
    const objectId = target.dataset.objectId;
    const vertexId = target.dataset.vertexId;
    if (!objectId || !vertexId) return;
    event.preventDefault();
    event.stopPropagation();
    svg.dataset.vertexEventHandled = "1";
    window.setTimeout(() => delete svg.dataset.vertexEventHandled, 0);
    const object = state().objects[objectId];
    if (!object) return;
    const activating = rotationVertexId !== vertexId;
    rotationVertexId = activating ? vertexId : null;
    if (activating) emitRecord({ kind: "vertex", value: vertexId, display: vertexId });
    command("transform.select-pivot", { objectId, pivotId: vertexId });
  };
  svg.addEventListener("pointerdown", activateVertexFromTarget, true);
  svg.addEventListener("click", activateVertexFromTarget, true);
  svg.addEventListener("pointerup", (event) => {
    if (!drag) return;
    const point = svgPointFromEvent(svg, event);
    const start = svgPointFromClient(svg, drag.startX, drag.startY);
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const current = state().objects[drag.objectId];
    if (current) {
      if (drag.kind === "translate") {
        const axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        const distance = Math.round(axis === "x" ? dx : dy);
        if (distance) {
          command("transform.translate", {
            objectId: drag.objectId,
            axis,
            distance,
            direction: axis === "x" ? (distance > 0 ? "right" : "left") : (distance > 0 ? "down" : "up"),
            before: { x: current.x, y: current.y },
            after: { x: current.x + (axis === "x" ? distance : 0), y: current.y + (axis === "y" ? distance : 0) },
          });
        }
      } else if (drag.previewRotation != null) {
        command("transform.rotate", { objectId: drag.objectId, degrees: drag.previewRotation, pivotVertex: rotationVertexId, direction: drag.previewRotation >= current.rotation ? "顺时针" : "逆时针" });
      }
    }
    drag = null;
    svg.dataset.preview = "";
    render();
  });
  app.querySelector<HTMLButtonElement>('[data-action="undo"]')!.addEventListener("click", () => command("transform.undo", {}));
  app.querySelector<HTMLButtonElement>('[data-action="restart"]')!.addEventListener("click", () => {
    recordTokens = [];
    rotationVertexId = null;
    solved = false;
    elapsedBefore = 0;
    startedAt = Date.now();
    running = true;
    command("transform.reset", {});
  });
  app.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", () => {
    const token = recordTokens.at(-1);
    if (!token) return;
    recordTokens = recordTokens.slice(0, -1);
    void client.emitEvent({ appletInstanceId: descriptor.instance.appletInstanceId, appletEventSchemaVersion: 1, streamId, type: "record.token.remove", payload: { index: recordTokens.length, token } });
    void persistProgress();
    render();
  });
  app.querySelector<HTMLButtonElement>('[data-action="clear"]')?.addEventListener("click", () => {
    recordTokens = [];
    void persistProgress();
    render();
  });
  const firstPieceId = () => Object.keys(state().objects)[0] ?? "";
  app.querySelector<HTMLButtonElement>('[data-action="compat-select"]')?.addEventListener("click", () => command("transform.highlight", { objectId: firstPieceId() }));
  app.querySelector<HTMLButtonElement>('[data-action="compat-left"]')?.addEventListener("click", () => command("transform.translate", { objectId: firstPieceId(), axis: "x", distance: -1, direction: "left" }));
  app.querySelector<HTMLButtonElement>('[data-action="compat-right"]')?.addEventListener("click", () => command("transform.translate", { objectId: firstPieceId(), axis: "x", distance: 1, direction: "right" }));
  app.querySelector<HTMLButtonElement>('[data-action="compat-rotate"]')?.addEventListener("click", () => {
    const piece = state().objects[firstPieceId()];
    if (piece) command("transform.rotate", { objectId: piece.id, degrees: piece.rotation + 90 });
  });
  app.querySelector<HTMLButtonElement>('[data-action="compat-mode"]')?.addEventListener("click", () => setNetwork("请直接拖动碎片完成平移；按钮仅用于键盘辅助。"));
  const submitAttempt = async (): Promise<void> => {
    await progressQueue;
    solved = isTransformBoardSolved(state());
    running = !solved;
    const attemptState = solved ? "success" : "failure";
    await runtime.applet.handleCommand({ type: "transform.record.update", payload: { recordTokens, attemptState, timerState: { elapsedBeforeDisconnectMs: elapsedBefore + Date.now() - startedAt, running } } });
    const result = await runtime.applet.submit() as { snapshot: Record<string, unknown>; solved: boolean };
    void client.emitEvent({
      appletInstanceId: descriptor.instance.appletInstanceId,
      appletEventSchemaVersion: 1,
      streamId,
      type: "attempt.submit",
      payload: { recordTokens: structuredClone(recordTokens), objectCount: Object.keys(state().objects).length, solved: result.solved },
    });
    const ack = await client.submit({
      submissionVersion: 1,
      sessionId: current.sessionId,
      activityId: current.activity.activityId,
      appletInstanceId: descriptor.instance.appletInstanceId,
      snapshot: result.snapshot,
      recordTokens: structuredClone(recordTokens),
      recordText: recordTokens.map((token) => token.display).join(""),
      operationSummary: { objectCount: Object.keys(state().objects).length },
      solved: result.solved,
      puzzleVersion: "lesson-package-authoritative",
    });
    feedback.textContent = solved ? "还原成功 · 路径已记录" : "还原失败 · 继续尝试";
    setNetwork(ack.accepted ? "提交已被课堂服务确认" : "已保存到待发送队列");
    recordSubmitStatus.textContent = ack.accepted ? "记录已由课堂服务确认" : "待发送，恢复连接后自动重试";
    render();
  };
  app.querySelector<HTMLButtonElement>('[data-action="submit"]')?.addEventListener("click", () => void submitAttempt());
  app.querySelector<HTMLButtonElement>('[data-action="submit-record"]')?.addEventListener("click", () => void submitAttempt());
  const updateTimer = (): void => {
    const elapsed = elapsedBefore + (running ? Date.now() - startedAt : 0);
    const seconds = Math.floor(elapsed / 1000);
    timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  window.setInterval(updateTimer, 250);
  client.onMessage((message) => {
    if (message.type === "client.outbox" && Number(message.pendingCount) > 0) setNetwork(`待发送 · ${message.pendingCount} 项`);
    if ((message.type === "event.ack" || message.type === "snapshot.ack" || message.type === "submission.ack") && message.ok === true) setNetwork("课堂服务已确认最近操作");
  });
  void runtime.start().then(() => {
    runtimeReady = true;
    render();
  }).catch((error) => setNetwork(error instanceof Error ? error.message : "Applet 启动失败"));
  render();
}

function mountClassroomTransformBoard(root: HTMLElement, client: ClassroomClient, current: ClassroomCurrentActivity, descriptor: ClassroomAppletDescriptor): void {
  const grant = client.grant;
  const serverHello = client.state.serverHello;
  if (!grant || !serverHello) throw new Error("classroom-connection-context-missing");
  const registry = new AppletRegistry();
  registry.register(TRANSFORM_BOARD_MANIFEST, createTransformBoardAppletFactory);
  const existingSnapshot = client.state.snapshots[descriptor.instance.appletInstanceId];
  const config = activityConfig(descriptor);
  const recordVocabulary = recordVocabularyFrom(config);
  let snapshotRevision = existingSnapshot?.revision ?? 0;
  let liveSeq = 0;
  let recordTokens: ClassroomRecordToken[] = [];
  const streamId = `stream:${descriptor.instance.appletInstanceId}:${grant.participantId}`;
  const host: AppletHost = {
    emitEvent: (intent) =>
      client.emitEvent({
        appletInstanceId: descriptor.instance.appletInstanceId,
        appletEventSchemaVersion: 1,
        streamId,
        type: intent.type,
        payload: intent.payload,
      }),
    publishLiveState: (payload) =>
      client.publishLiveState({
        sessionId: current.sessionId,
        activityId: current.activity.activityId,
        appletInstanceId: descriptor.instance.appletInstanceId,
        scope: { type: "participant", id: grant.participantId },
        streamId: `live:${descriptor.instance.appletInstanceId}:${grant.participantId}`,
        seq: ++liveSeq,
        payload,
      }),
    requestAction: async () => {
      throw new Error("classroom-action-not-supported-in-student-slice");
    },
    saveSnapshot: async (state) => {
      const next = {
        sessionId: current.sessionId,
        activityId: current.activity.activityId,
        appletInstanceId: descriptor.instance.appletInstanceId,
        scope: { type: "participant" as const, id: grant.participantId },
        stateSchemaVersion: 1,
        revision: ++snapshotRevision,
        state,
        capturedAt: new Date().toISOString(),
      };
      await client.queueSnapshot({ snapshot: next });
    },
    getAsset: async (assetId) => {
      const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`);
      if (!response.ok) throw new Error(`asset-not-found:${assetId}`);
      return response.text();
    },
  };
  const runtime = new AppletHostRuntime({
    registry,
    instance: descriptor.instance,
    config,
    context: {
      viewer: { participantId: grant.participantId, role: "student", connectionId: serverHello.connectionId },
      subject: { type: "participant", id: grant.participantId },
      accessMode: "interactive",
      sessionId: current.sessionId,
      lessonId: current.lessonId,
      activityId: current.activity.activityId,
      appletInstanceId: descriptor.instance.appletInstanceId,
      appletTypeId: descriptor.instance.appletTypeId,
      configRef: descriptor.instance.configRef,
    },
    host,
    availableCapabilities: new Set(["pointer-events", "indexeddb", "websocket", ...descriptor.instance.requiredCapabilities]),
    snapshot: existingSnapshot ? { stateSchemaVersion: existingSnapshot.stateSchemaVersion, state: existingSnapshot.state } : null,
  });
  const state = () => runtime.applet.getState() as TransformBoardState;
  const statusText = document.createElement("span");
  statusText.className = "classroom-runtime-status";
  statusText.textContent = `课堂已连接 · ${current.activity.activityId}`;
  const setStatus = (text: string) => {
    statusText.textContent = text;
  };
  client.onMessage((message) => {
    if (message.type === "client.outbox" && typeof message.pendingCount === "number" && message.pendingCount > 0) {
      setStatus(`有 ${message.pendingCount} 项操作待发送，恢复连接后自动重试`);
    }
    if (message.type === "event.ack" || message.type === "snapshot.ack" || message.type === "submission.ack") {
      setStatus(message.ok === true ? "课堂服务已确认最近操作" : "操作仍在待发送队列，恢复连接后自动重试");
    }
  });
  const hosted = document.createElement("div");
  hosted.className = "student-app";
  hosted.innerHTML = '<header class="student-header"><div><span class="eyebrow">CLASSCORE · CLASSROOM</span><h1></h1></div><div class="header-status"><span class="status-dot"></span></div></header>';
  const title = hosted.querySelector("h1");
  if (title) title.textContent = current.lessonTitle ?? "课堂";
  const headerStatus = hosted.querySelector(".header-status");
  const self = client.state.self;
  if (self) headerStatus?.append(iconLabel(`${self.displayName}${self.seatNo ? ` · ${self.seatNo}` : ""}`, "classroom-self"));
  headerStatus?.append(statusText);
  const layout = document.createElement("main");
  layout.className = "student-layout";
  const side = document.createElement("aside");
  side.className = "student-brief";
  side.innerHTML =
    '<span class="step-mark">课堂 Activity</span><h2>先观察，再记录<br>你的变换路径。</h2><p>课堂中的身份、Activity、Snapshot 与提交状态由服务端确认。指针预览可以丢失，但已完成的操作会进入可靠发送队列。</p><div class="target-card"><div class="target-title">当前 Activity</div><div class="target-caption"></div></div>';
  side.querySelector(".target-caption")!.textContent = current.activity.activityId;
  layout.append(side);
  const workspace = document.createElement("section");
  workspace.className = "student-workspace";
  const toolbar = document.createElement("div");
  toolbar.className = "board-toolbar";
  const modeLabel = document.createElement("span");
  modeLabel.className = "toolbar-label";
  toolbar.append(modeLabel);
  const toolbarActions = document.createElement("div");
  toolbarActions.className = "toolbar-actions";
  toolbarActions.append(button("重置", () => {
    command("transform.reset", {});
  }, "quiet-button"));
  const submitButton = button("提交答案", async () => {
    submitButton.disabled = true;
    try {
      const submissionResult = await runtime.applet.submit() as { snapshot: Record<string, unknown>; objectCount: number; solved: boolean };
      void client.emitEvent({
        appletInstanceId: descriptor.instance.appletInstanceId,
        appletEventSchemaVersion: 1,
        streamId,
        type: "attempt.submit",
        payload: { recordTokens: structuredClone(recordTokens), objectCount: submissionResult.objectCount, solved: submissionResult.solved },
      });
      const ack = await client.submit({
        submissionVersion: 1,
        sessionId: current.sessionId,
        activityId: current.activity.activityId,
        appletInstanceId: descriptor.instance.appletInstanceId,
        snapshot: submissionResult.snapshot,
        recordTokens: structuredClone(recordTokens),
        recordText: recordTokens.map((token) => token.display).join(""),
        operationSummary: { objectCount: submissionResult.objectCount },
        solved: submissionResult.solved,
        puzzleVersion: "lesson-package-authoritative",
      });
      setStatus(ack.accepted ? "提交已被课堂服务确认" : "已保存到待发送队列，恢复连接后自动重试");
    } catch (error) {
      setStatus(error instanceof Error ? `提交失败：${error.message}` : "提交失败");
    } finally {
      submitButton.disabled = false;
    }
  }, "primary-button");
  toolbarActions.append(submitButton);
  toolbar.append(toolbarActions);
  workspace.append(toolbar);
  const boardFrame = document.createElement("div");
  boardFrame.className = "board-frame";
  const board = document.createElement("div");
  board.className = "transform-board";
  boardFrame.append(board);
  workspace.append(boardFrame);
  const selectionBar = document.createElement("div");
  selectionBar.className = "selection-bar";
  workspace.append(selectionBar);
  const recordBar = document.createElement("div");
  recordBar.className = "classroom-record-bar";
  workspace.append(recordBar);
  layout.append(workspace);
  hosted.append(layout);
  root.replaceChildren(hosted);

  const emitRecordEvent = (type: "record.token.append" | "record.token.remove", payload: Record<string, unknown>): void => {
    void client.emitEvent({ appletInstanceId: descriptor.instance.appletInstanceId, appletEventSchemaVersion: 1, streamId, type, payload }).then((ack) => {
      if (!ack.accepted) setStatus("记录已保存到待发送队列，恢复连接后自动重试");
    }).catch((error) => setStatus(error instanceof Error ? `记录发送失败：${error.message}` : "记录发送失败"));
  };
  const recordButton = (token: ClassroomRecordToken) =>
    button(token.display, () => {
      const index = recordTokens.length;
      recordTokens = [...recordTokens, token];
      emitRecordEvent("record.token.append", { index, token });
      render();
    }, "quiet-button");
  function command(type: string, payload: Record<string, unknown>): void {
    void Promise.resolve(runtime.applet.handleCommand({ type, payload })).then(render).catch((error: unknown) => setStatus(error instanceof Error ? `操作失败：${error.message}` : "操作失败"));
  }
  function render(): void {
    const currentState = state();
    const selected = currentState.selectedObjectId ? currentState.objects[currentState.selectedObjectId] : null;
    modeLabel.textContent = selected ? `已选择对象 ${selected.label}` : "选择一个对象开始";
    board.replaceChildren();
    for (const object of Object.values(currentState.objects).sort((a, b) => a.zIndex - b.zIndex)) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `fragment fragment-${object.shape}${selected?.id === object.id ? " selected" : ""}`;
      element.style.left = `${object.x * 38}px`;
      element.style.top = `${object.y * 38}px`;
      element.style.width = `${object.width * 38}px`;
      element.style.height = `${object.height * 38}px`;
      element.style.zIndex = String(object.zIndex);
      element.style.background = object.visual?.color ?? "#5575b8";
      element.style.clipPath = object.visual?.clipPath ?? "none";
      element.style.transform = `rotate(${object.rotation}deg)`;
      element.setAttribute("aria-label", `对象 ${object.label}`);
      element.append(iconLabel(object.label, "fragment-label"));
      element.addEventListener("click", () => command("transform.highlight", { objectId: object.id }));
      board.append(element);
    }
    selectionBar.replaceChildren();
    if (selected) {
      selectionBar.append(iconLabel(`对象 ${selected.label} · ${Math.round(selected.rotation)}°`, "selected-name"));
      for (const [label, axis, distance] of [["← 1格", "x", -1], ["→ 1格", "x", 1], ["↑ 1格", "y", -1], ["↓ 1格", "y", 1]] as const) {
        selectionBar.append(button(label, () => command("transform.translate", { objectId: selected.id, axis, distance }), "rotate-button"));
      }
      selectionBar.append(button("↻ 90°", () => command("transform.rotate", { objectId: selected.id, degrees: selected.rotation + 90 }), "rotate-button"));
      for (const pivotId of Object.keys(selected.pivots)) {
        selectionBar.append(button(`中心 ${pivotId}`, () => command("transform.select-pivot", { objectId: selected.id, pivotId }), "rotate-button"));
      }
    }
    const contextualTokens: ClassroomRecordToken[] = [];
    if (selected && recordVocabulary.figurePrefix) contextualTokens.push({ kind: "figure", value: selected.label, display: `${recordVocabulary.figurePrefix}${selected.label}` });
    if (selected?.selectedPivotId && recordVocabulary.vertexPrefix) contextualTokens.push({ kind: "vertex", value: selected.selectedPivotId, display: `${recordVocabulary.vertexPrefix}${selected.selectedPivotId}` });
    recordBar.replaceChildren(
      iconLabel(recordVocabulary.label ?? "记录：", "selected-name"),
      ...contextualTokens.map(recordButton),
      ...(recordVocabulary.tokens ?? []).map(recordButton),
    );
    if (recordTokens.length) {
      recordBar.append(iconLabel(`已记录：${recordTokens.map((token) => token.display).join("")}`, "record-history"));
      recordBar.append(button("清空", () => {
        for (let index = recordTokens.length - 1; index >= 0; index -= 1) emitRecordEvent("record.token.remove", { index, token: recordTokens[index] });
        recordTokens = [];
        render();
      }, "quiet-button"));
    }
  }
  void runtime.start().then(render).catch((error) => setStatus(error instanceof Error ? `Applet 启动失败：${error.message}` : "Applet 启动失败"));
}

export function mountStudentClassroom(root: HTMLElement, options: StudentClassroomOptions = {}): void {
  const client = options.client ?? new ClassroomClient();
  const urlParams = new URLSearchParams(globalThis.location?.search ?? "");
  const qrSessionLocator = urlParams.get("session")?.trim() ?? "";
  const qrCredential = urlParams.get("code")?.trim() ?? "";
  const qrJoin = Boolean(qrSessionLocator && qrCredential);
  root.replaceChildren();
  const app = document.createElement("main");
  app.className = "student-classroom-shell";
  app.innerHTML = [
    '<div class="student-classroom-card">',
    '<span class="eyebrow">CLASSCORE · CLASSROOM</span>',
    "<h1>加入课堂</h1>",
    '<p class="classroom-copy" data-field="join-copy">输入教师提供的课堂码。身份由课堂服务分配，学生端不会自行创建学号。</p>',
    '<form class="classroom-join-form">',
    '<label data-field="session-label"><span>课堂地址</span><input name="sessionLocator" autocomplete="off" required></label>',
    '<label data-field="credential-label"><span>课堂码</span><input name="credential" autocomplete="one-time-code" required></label>',
    '<label data-field="student-label" hidden><span>学号</span><input name="participantHint" inputmode="numeric" autocomplete="username" placeholder="输入你的学号"></label>',
    '<button class="primary-button" type="submit">加入课堂</button>',
    "</form>",
    '<p class="classroom-status" role="status">尚未连接</p>',
    "</div>",
  ].join("");
  root.append(app);
  const form = app.querySelector<HTMLFormElement>("form");
  const status = app.querySelector<HTMLElement>(".classroom-status");
  const sessionInput = app.querySelector<HTMLInputElement>('input[name="sessionLocator"]');
  const credentialInput = app.querySelector<HTMLInputElement>('input[name="credential"]');
  const sessionLabel = app.querySelector<HTMLElement>('[data-field="session-label"]');
  const credentialLabel = app.querySelector<HTMLElement>('[data-field="credential-label"]');
  const studentLabel = app.querySelector<HTMLElement>('[data-field="student-label"]');
  const studentHintInput = app.querySelector<HTMLInputElement>('input[name="participantHint"]');
  const joinCopy = app.querySelector<HTMLElement>('[data-field="join-copy"]');
  if (!form || !status || !sessionInput || !credentialInput || !sessionLabel || !credentialLabel || !studentLabel || !studentHintInput || !joinCopy) return;
  let mountedActivityKey: string | null = null;
  const renderCurrentActivity = (): void => {
    const current = client.state.currentActivity;
    if (!current) return;
    const descriptor = current.applets.find((item) => item.instance.appletTypeId === "applet:transform-board");
    if (!descriptor) {
      status.textContent = `当前 Activity ${current.activity.activityId} 暂无可用 Student Applet`;
      return;
    }
    const activityKey = `${current.sessionId}:${current.activity.activityId}:${descriptor.instance.appletInstanceId}`;
    if (mountedActivityKey === activityKey) return;
    mountedActivityKey = activityKey;
    try {
      mountReferenceClassroomTransformBoard(root, client, current, descriptor);
    } catch (error) {
      mountedActivityKey = null;
      status.textContent = error instanceof Error ? `Applet 挂载失败：${error.message}` : "Applet 挂载失败";
    }
  };
  client.onMessage((message) => {
    if (message.type === "activity.current" || message.type === "classroom.activity" || message.type === "applet.snapshot" || message.type === "snapshot.state") renderCurrentActivity();
  });
  sessionInput.value = options.defaultSessionLocator ?? qrSessionLocator;
  if (qrJoin) {
    sessionInput.readOnly = true;
    credentialInput.value = qrCredential;
    credentialLabel.hidden = true;
    studentLabel.hidden = false;
    studentHintInput.required = true;
    joinCopy.textContent = "已通过二维码锁定当前课堂，只需输入学号即可加入。";
    sessionLabel.querySelector("span")?.replaceChildren(document.createTextNode("当前课堂"));
    status.textContent = "请先输入学号，再加入课堂";
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const sessionLocator = String(data.get("sessionLocator") ?? "").trim();
    const credential = qrJoin ? qrCredential : String(data.get("credential") ?? "").trim();
    const participantHint = qrJoin ? String(data.get("participantHint") ?? "").trim() : "";
    if (!sessionLocator || !credential || (qrJoin && !participantHint)) return;
    if (qrJoin && !/^\d+$/.test(participantHint)) {
      status.textContent = "学号需填写数字";
      return;
    }
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    status.textContent = "正在向课堂服务申请成员资格…";
    try {
      await client.join({
        joinRequestId: `join:${Date.now()}`,
        runtimeApiVersion: 1,
        sessionLocator,
        requestedRole: "student",
        ...(participantHint ? { participantHint } : {}),
        credential: { type: "class-code", value: credential },
      });
      await client.connect();
      status.textContent = client.state.currentActivity ? "课堂已连接，正在挂载当前 Activity…" : "课堂已连接，正在等待当前 Activity…";
      renderCurrentActivity();
    } catch (error) {
      status.textContent = error instanceof Error ? `加入失败：${error.message}` : "加入失败，请稍后重试";
      if (submit) submit.disabled = false;
    }
  });
  if (client.state.connection === "offline") {
    void client.restoreSession().then((hello) => {
      if (!hello) return;
      status.textContent = client.state.currentActivity ? "课堂已恢复，正在挂载当前 Activity…" : "课堂已恢复，正在等待当前 Activity…";
      renderCurrentActivity();
    }).catch((error) => {
      status.textContent = error instanceof Error ? `恢复失败：${error.message}` : "恢复失败，请重新加入课堂";
    });
  }
}

export function mountStudent(root: HTMLElement, options: StudentClassroomOptions = {}): void {
  const mode = new URL(globalThis.location?.href ?? "http://classroom.local").searchParams.get("mode");
  if (mode === "classroom") mountStudentClassroom(root, options);
  else mountStudentPractice(root);
}
