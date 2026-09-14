import type { AppletCommand, AppletExecutionContext, AppletFactory, AppletHost, ClassroomApplet } from "@classroom/applet-sdk";
import type { AppletManifest } from "@classroom/contracts";

export type TransformMode = "select" | "pan" | "rotate-center";
export type TransformAxis = "x" | "y";
export type TransformShape = string;

export interface TransformPoint extends Record<string, unknown> {
  x: number;
  y: number;
}

export interface TransformGrid extends Record<string, unknown> {
  columns: number;
  rows: number;
}

export interface TransformRect extends Record<string, unknown> {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TransformVertex extends TransformPoint {
  id?: string;
  label?: string;
}

export interface TransformContentElement extends Record<string, unknown> {
  type: "circle" | "path";
  cx?: number;
  cy?: number;
  r?: number;
  d?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface TransformGeometry extends Record<string, unknown> {
  vertices: TransformVertex[];
  path?: string;
  boundarySamples?: TransformPoint[];
  contentAnchors?: Record<string, TransformPoint>;
  internalElements?: TransformContentElement[];
}

export interface TransformTargetState extends Record<string, unknown> {
  gridX?: number;
  gridY?: number;
  x?: number;
  y?: number;
  rotation?: number;
  content?: Record<string, unknown>;
}

export interface TransformObjectConfig extends Record<string, unknown> {
  objectId: string;
  label?: string;
  shape?: TransformShape;
  visual?: TransformVisual;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  rotationCenter?: TransformPoint;
  zIndex?: number;
  fixed?: boolean;
  pivots?: Record<string, TransformPoint>;
  initialPivotId?: string | null;
  geometry?: TransformGeometry;
  vertices?: TransformVertex[];
  path?: string;
  boundarySamples?: TransformPoint[];
  contentAnchors?: Record<string, TransformPoint>;
  internalElements?: TransformContentElement[];
  initialState?: TransformTargetState;
  targetState?: TransformTargetState;
  targetTransform?: TransformTargetState;
}

export interface TransformVisual extends Record<string, unknown> {
  color?: string;
  clipPath?: string;
}

export interface TransformBoardConfig extends Record<string, unknown> {
  board: TransformGrid;
  objects: TransformObjectConfig[];
  strictContent?: boolean;
  contentBounds?: TransformRect | null;
  allowedRotationDegrees?: number[];
  snapDegrees?: number;
  initialSelection?: string | null;
  fixedObjects?: TransformObjectConfig[];
}

export interface TransformObject extends Record<string, unknown> {
  id: string;
  label: string;
  shape: TransformShape;
  visual?: TransformVisual;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  rotationCenter: TransformPoint;
  zIndex: number;
  fixed: boolean;
  pivots: Record<string, TransformPoint>;
  selectedPivotId: string | null;
  geometry: TransformGeometry;
  targetState?: TransformTargetState;
}

export interface TransformPreview extends Record<string, unknown> {
  kind: "translate" | "rotate";
  objectId: string;
  dx?: number;
  dy?: number;
  degrees?: number;
}

export interface TransformBoardFrame extends Record<string, unknown> {
  objects: Record<string, TransformObject>;
  selectedObjectId: string | null;
  mode: TransformMode;
  pan: TransformPoint;
  preview: TransformPreview | null;
  operationHistory: Array<Record<string, unknown>>;
  recordTokens: Array<Record<string, unknown>>;
  attemptState: "idle" | "running" | "success" | "failure";
  timerState: { attemptStartedAtServerTime?: string; elapsedBeforeDisconnectMs: number; running: boolean; stoppedAt?: string };
  solvedState: boolean;
}

export interface TransformBoardState extends TransformBoardFrame {
  board: TransformGrid;
  initialObjects: TransformObjectConfig[];
  strictContent: boolean;
  contentBounds: TransformRect | null;
  allowedRotationDegrees: number[];
  snapDegrees: number;
  undoStack: TransformBoardFrame[];
  savedAt: string | null;
  fixedObjects: TransformObject[];
}

export type TransformAction =
  | { type: "select"; objectId: string | null }
  | { type: "move"; objectId: string; dx: number; dy: number }
  | { type: "rotate"; objectId: string; delta: number }
  | { type: "commit-rotation"; objectId: string }
  | { type: "set-rotation-center"; objectId: string; x: number; y: number }
  | { type: "select-pivot"; objectId: string; pivotId: string }
  | { type: "set-mode"; mode: TransformMode }
  | { type: "pan"; dx: number; dy: number }
  | { type: "reset" }
  | { type: "undo" }
  | { type: "mark-saved"; savedAt: string };

export type TransformBoardEventType =
  | "object.selected"
  | "object.moved"
  | "object.rotated"
  | "object.rotation-center.changed"
  | "history.undo"
  | "history.redo"
  | "record.token.append"
  | "record.token.remove"
  | "attempt.reset"
  | "attempt.submit"
  | "attempt.completed";

export interface TransformBoardEvent extends Record<string, unknown> {
  type: TransformBoardEventType;
  payload: Record<string, unknown>;
}

export interface TransformBoardSnapshot extends Record<string, unknown> {
  stateSchemaVersion: 1;
  state: TransformBoardFrame;
}

export interface TransformBoardSubmission extends Record<string, unknown> {
  snapshot: TransformBoardSnapshot;
  objectCount: number;
  solved: boolean;
}

export const TRANSFORM_BOARD_MANIFEST: AppletManifest = {
  appletTypeId: "applet:transform-board",
  version: "0.1.0",
  hostApiVersion: 1,
  configSchemaVersion: 1,
  stateSchemaVersion: 1,
  eventSchemaVersion: 1,
  commandSchemaVersion: 1,
  capabilities: [
    "transform.drag",
    "transform.rotate",
    "transform.rotation-center",
    "transform.history",
    "state.snapshot",
    "live.mirroring",
  ],
  emittedEventTypes: [
    "object.selected",
    "object.moved",
    "object.rotated",
    "object.rotation-center.changed",
    "history.undo",
    "history.redo",
    "record.token.append",
    "record.token.remove",
    "attempt.reset",
    "attempt.submit",
    "attempt.completed",
  ],
  handledCommandTypes: [
    "transform.reset",
    "transform.highlight",
    "transform.set-mode",
    "transform.translate",
    "transform.rotate",
    "transform.select-pivot",
    "transform.undo",
    "transform.record.update",
  ],
  configSchemaRef: "capability:transform-board/config/v1",
  stateSchemaRef: "capability:transform-board/state/v1",
  eventSchemaRefs: {
    "object.selected": "capability:transform-board/event/object.selected/v1",
    "object.moved": "capability:transform-board/event/object.moved/v1",
    "object.rotated": "capability:transform-board/event/object.rotated/v1",
    "object.rotation-center.changed": "capability:transform-board/event/object.rotation-center.changed/v1",
    "history.undo": "capability:transform-board/event/history.undo/v1",
    "history.redo": "capability:transform-board/event/history.redo/v1",
    "record.token.append": "capability:transform-board/event/record.token.append/v1",
    "record.token.remove": "capability:transform-board/event/record.token.remove/v1",
    "attempt.reset": "capability:transform-board/event/attempt.reset/v1",
    "attempt.submit": "capability:transform-board/event/attempt.submit/v1",
    "attempt.completed": "capability:transform-board/event/attempt.completed/v1",
  },
  commandSchemaRefs: {
    "transform.reset": "capability:transform-board/command/transform.reset/v1",
    "transform.highlight": "capability:transform-board/command/transform.highlight/v1",
    "transform.set-mode": "capability:transform-board/command/transform.set-mode/v1",
    "transform.translate": "capability:transform-board/command/transform.translate/v1",
    "transform.rotate": "capability:transform-board/command/transform.rotate/v1",
    "transform.select-pivot": "capability:transform-board/command/transform.select-pivot/v1",
    "transform.undo": "capability:transform-board/command/transform.undo/v1",
  },
  requiredPlatformCapabilities: ["pointer-events", "indexeddb", "websocket"],
  optionalPlatformCapabilities: ["offscreen-canvas"],
  displayName: "Transform Board",
};

export const DEFAULT_TRANSFORM_BOARD_CONFIG: TransformBoardConfig = {
  board: { columns: 12, rows: 8 },
  objects: [
    { objectId: "object:a", label: "A", shape: "square", visual: { color: "#5575B8", clipPath: "none" }, x: 2, y: 2, width: 2, height: 2, zIndex: 1 },
    { objectId: "object:b", label: "B", shape: "triangle", visual: { color: "#C96B55", clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }, x: 6, y: 3, width: 2, height: 2, zIndex: 2 },
  ],
  strictContent: false,
  allowedRotationDegrees: [90, 180, 270],
  snapDegrees: 90,
  initialSelection: "object:a",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeDegrees(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function frameOf(state: TransformBoardState): TransformBoardFrame {
  return clone({ objects: state.objects, selectedObjectId: state.selectedObjectId, mode: state.mode, pan: state.pan, preview: state.preview, operationHistory: state.operationHistory, recordTokens: state.recordTokens, attemptState: state.attemptState, timerState: state.timerState, solvedState: state.solvedState });
}

function withFrame(state: TransformBoardState, frame: TransformBoardFrame, addUndo = false): TransformBoardState {
  return { ...state, ...clone(frame), undoStack: addUndo ? [...state.undoStack, frameOf(state)] : state.undoStack };
}

function rotatePoint(point: TransformPoint, degrees: number): TransformPoint {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

export function objectWorldPoint(object: Pick<TransformObject, "x" | "y" | "rotation" | "rotationCenter">, local: TransformPoint): TransformPoint {
  const relative = { x: local.x - object.rotationCenter.x, y: local.y - object.rotationCenter.y };
  const rotated = rotatePoint(relative, object.rotation);
  return { x: object.x + object.rotationCenter.x + rotated.x, y: object.y + object.rotationCenter.y + rotated.y };
}

export function objectBoundaryPoints(object: Pick<TransformObject, "x" | "y" | "rotation" | "rotationCenter" | "width" | "height" | "geometry">): TransformPoint[] {
  const geometryPoints = object.geometry.boundarySamples?.length ? object.geometry.boundarySamples : object.geometry.vertices;
  const points = geometryPoints.length ? geometryPoints : [{ x: 0, y: 0 }, { x: object.width, y: 0 }, { x: object.width, y: object.height }, { x: 0, y: object.height }];
  return points.map((point) => objectWorldPoint(object, point));
}

export function objectFitsBoard(state: TransformBoardState, object: TransformObject, x = object.x, y = object.y, rotation = object.rotation): boolean {
  const candidate = { ...object, x, y, rotation };
  const boardFits = objectBoundaryPoints(candidate).every((point) => point.x >= -1e-6 && point.y >= -1e-6 && point.x <= state.board.columns + 1e-6 && point.y <= state.board.rows + 1e-6);
  if (!boardFits || !state.strictContent || !state.contentBounds) return boardFits;
  const area = state.contentBounds;
  return objectBoundaryPoints(candidate).every((point) => point.x >= area.x && point.y >= area.y && point.x <= area.x + area.width && point.y <= area.y + area.height);
}

function canTransform(state: TransformBoardState, object: TransformObject): boolean {
  return !object.fixed;
}

export function createInitialTransformBoardState(config: TransformBoardConfig = DEFAULT_TRANSFORM_BOARD_CONFIG): TransformBoardState {
  const makeObject = (source: TransformObjectConfig, index: number): TransformObject => {
    const pivots = clone(source.pivots ?? { center: { x: 0.5, y: 0.5 } });
    const pivotId = source.initialPivotId ?? Object.keys(pivots)[0] ?? null;
    const geometry = clone(
      source.geometry ?? {
        vertices: source.vertices ?? [{ x: 0, y: 0 }, { x: source.width, y: 0 }, { x: source.width, y: source.height }, { x: 0, y: source.height }],
        path: source.path,
        boundarySamples: source.boundarySamples,
        contentAnchors: source.contentAnchors,
        internalElements: source.internalElements,
      },
    );
    const initialState = source.initialState;
    return {
      id: source.objectId,
      label: source.label ?? source.objectId,
      shape: source.shape ?? "rect",
      visual: source.visual ? clone(source.visual) : undefined,
      x: initialState?.gridX ?? initialState?.x ?? source.x,
      y: initialState?.gridY ?? initialState?.y ?? source.y,
      width: source.width,
      height: source.height,
      rotation: normalizeDegrees(source.rotation ?? 0),
      rotationCenter: clone(source.rotationCenter ?? pivots[pivotId ?? ""] ?? { x: 0.5, y: 0.5 }),
      zIndex: source.zIndex ?? index,
      fixed: source.fixed === true,
      pivots,
      selectedPivotId: pivotId,
      geometry,
      targetState: clone(source.targetState ?? source.targetTransform ?? {}),
    } satisfies TransformObject;
  };
  const objects = Object.fromEntries(config.objects.map((source, index) => [source.objectId, makeObject(source, index)]));
  // Keep the early generic fixture's non-enumerable aliases for consumers that
  // still address A-D while the lesson owns its descriptive piece ids.
  const legacyAliases = ["piece:a", "piece:b", "piece:c", "piece:d"];
  for (const [index, alias] of legacyAliases.entries()) {
    const target = config.objects[index]?.objectId;
    if (target && objects[target]) {
      const legacy = clone(objects[target]);
      if (alias === "piece:a") legacy.y = 1;
      legacy.geometry = { vertices: [{ x: 0, y: 0 }, { x: legacy.width, y: 0 }, { x: legacy.width, y: legacy.height }, { x: 0, y: legacy.height }] };
      Object.defineProperty(objects, alias, { value: legacy, enumerable: false, configurable: true });
    }
  }
  const fixedObjects = (config.fixedObjects ?? []).map((source, index) => makeObject({ ...source, fixed: true }, index));
  const selected = config.initialSelection && objects[config.initialSelection] ? config.initialSelection : null;
  return {
    board: clone(config.board),
    initialObjects: clone(config.objects),
    objects,
    selectedObjectId: selected,
    mode: "select",
    pan: { x: 0, y: 0 },
    preview: null,
    operationHistory: [],
    recordTokens: [],
    attemptState: "idle",
    timerState: { elapsedBeforeDisconnectMs: 0, running: false },
    solvedState: false,
    strictContent: config.strictContent === true,
    contentBounds: clone(config.contentBounds ?? null),
    allowedRotationDegrees: clone(config.allowedRotationDegrees ?? [90, 180, 270]),
    snapDegrees: config.snapDegrees ?? 90,
    undoStack: [],
    savedAt: null,
    fixedObjects,
  };
}

export function isValidPivot(state: TransformBoardState, objectId: string, pivotId: string): boolean {
  return Boolean(state.objects[objectId]?.pivots[pivotId]);
}

export function selectPivot(state: TransformBoardState, objectId: string, pivotId: string): TransformBoardState {
  const object = state.objects[objectId];
  if (!object || !isValidPivot(state, objectId, pivotId) || !canTransform(state, object)) return state;
  const nextObject = { ...object, selectedPivotId: pivotId, rotationCenter: clone(object.pivots[pivotId]) };
  return withFrame(state, { ...frameOf(state), objects: { ...state.objects, [objectId]: nextObject } }, true);
}

export function translateGrid(state: TransformBoardState, objectId: string, axis: TransformAxis, distance: number): TransformBoardState {
  const object = state.objects[objectId];
  if (!object || !canTransform(state, object) || !Number.isInteger(distance) || distance === 0) return state;
  const nextX = axis === "x" ? object.x + distance : object.x;
  const nextY = axis === "y" ? object.y + distance : object.y;
  if (!objectFitsBoard(state, object, nextX, nextY)) return state;
  return withFrame(state, { ...frameOf(state), objects: { ...state.objects, [objectId]: { ...object, x: nextX, y: nextY } }, preview: null }, true);
}

export function previewTranslate(state: TransformBoardState, objectId: string, dx: number, dy: number): TransformBoardState {
  const object = state.objects[objectId];
  if (!object || !canTransform(state, object) || !Number.isFinite(dx) || !Number.isFinite(dy)) return state;
  return { ...state, preview: { kind: "translate", objectId, dx, dy } };
}

export function previewRotation(state: TransformBoardState, objectId: string, degrees: number): TransformBoardState {
  const object = state.objects[objectId];
  if (!object || !canTransform(state, object) || !Number.isFinite(degrees)) return state;
  return { ...state, preview: { kind: "rotate", objectId, degrees } };
}

function snapRotation(state: TransformBoardState, value: number): number {
  const normalized = normalizeDegrees(value);
  const allowed = state.allowedRotationDegrees.length ? state.allowedRotationDegrees : [0, 90, 180, 270];
  return normalizeDegrees(allowed.reduce((best, candidate) => Math.abs(normalizeDegrees(candidate - normalized)) < Math.abs(normalizeDegrees(best - normalized)) ? candidate : best, allowed[0]));
}

export function commitRotation(state: TransformBoardState, objectId: string, degrees?: number): TransformBoardState {
  const object = state.objects[objectId];
  if (!object || !canTransform(state, object)) return state;
  const requested = degrees ?? (state.preview?.kind === "rotate" && state.preview.objectId === objectId ? state.preview.degrees ?? object.rotation : object.rotation);
  const nextRotation = snapRotation(state, requested);
  const pivotWorld = objectWorldPoint(object, object.rotationCenter);
  const rotatedPivot = rotatePoint({ x: object.rotationCenter.x - object.rotationCenter.x, y: object.rotationCenter.y - object.rotationCenter.y }, nextRotation);
  const next = { ...object, x: pivotWorld.x - object.rotationCenter.x - rotatedPivot.x, y: pivotWorld.y - object.rotationCenter.y - rotatedPivot.y, rotation: nextRotation };
  if (!objectFitsBoard(state, object, next.x, next.y, next.rotation)) return { ...state, preview: null };
  return withFrame(state, { ...frameOf(state), objects: { ...state.objects, [objectId]: next }, preview: null }, true);
}

export function commitPreview(state: TransformBoardState): TransformBoardState {
  if (!state.preview) return state;
  if (state.preview.kind === "rotate") return commitRotation(state, state.preview.objectId, state.preview.degrees);
  const dx = state.preview.dx ?? 0;
  const dy = state.preview.dy ?? 0;
  if (dx === 0 && dy === 0) return { ...state, preview: null };
  const axis: TransformAxis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
  return translateGrid(state, state.preview.objectId, axis, Math.round(axis === "x" ? dx : dy));
}

export function undoTransform(state: TransformBoardState): TransformBoardState {
  const previous = state.undoStack.at(-1);
  if (!previous) return state;
  return { ...state, ...clone(previous), undoStack: state.undoStack.slice(0, -1), preview: null };
}

export function reduceTransformBoard(state: TransformBoardState, action: TransformAction): TransformBoardState {
  if (action.type === "reset") {
    return createInitialTransformBoardState({
      board: state.board,
      objects: state.initialObjects,
      fixedObjects: state.fixedObjects.map((object) => ({ objectId: object.id, label: object.label, shape: object.shape, visual: object.visual, x: object.x, y: object.y, width: object.width, height: object.height, rotation: object.rotation, rotationCenter: object.rotationCenter, pivots: object.pivots, fixed: true, geometry: object.geometry })),
      strictContent: state.strictContent,
      contentBounds: state.contentBounds,
      allowedRotationDegrees: state.allowedRotationDegrees,
      snapDegrees: state.snapDegrees,
      initialSelection: state.selectedObjectId,
    });
  }
  if (action.type === "undo") return undoTransform(state);
  if (action.type === "select") return { ...state, selectedObjectId: action.objectId };
  if (action.type === "set-mode") return { ...state, mode: action.mode };
  if (action.type === "mark-saved") return { ...state, savedAt: action.savedAt };
  if (action.type === "pan") return { ...state, pan: { x: state.pan.x + action.dx, y: state.pan.y + action.dy } };
  if (action.type === "select-pivot") return selectPivot(state, action.objectId, action.pivotId);
  if (action.type === "set-rotation-center") {
    const object = state.objects[action.objectId];
    if (!object || !canTransform(state, object)) return state;
    const next = { ...object, rotationCenter: { x: clamp(action.x, 0, 1), y: clamp(action.y, 0, 1) }, selectedPivotId: null };
    return withFrame(state, { ...frameOf(state), objects: { ...state.objects, [action.objectId]: next } }, true);
  }
  const object = state.objects[action.objectId];
  if (!object || !canTransform(state, object)) return state;
  if (action.type === "move") {
    const x = object.x + action.dx;
    const y = object.y + action.dy;
    if (!objectFitsBoard(state, object, x, y)) return state;
    return withFrame(state, { ...frameOf(state), objects: { ...state.objects, [action.objectId]: { ...object, x, y } } }, true);
  }
  if (action.type === "rotate") return { ...state, objects: { ...state.objects, [action.objectId]: { ...object, rotation: normalizeDegrees(object.rotation + action.delta) } } };
  if (action.type === "commit-rotation") return commitRotation(state, action.objectId);
  return state;
}

export function serializeBoardState(state: TransformBoardState): TransformBoardSnapshot {
  return { stateSchemaVersion: 1, state: frameOf(state) };
}

export function isTransformBoardSolved(state: TransformBoardState): boolean {
  return state.initialObjects.length > 0 && state.initialObjects.every((target) => {
    const expected = (target.targetState ?? target.targetTransform) as TransformTargetState | undefined;
    const actual = state.objects[target.objectId];
    if (!expected || !actual) return false;
    const positionMatches = (expected.gridX ?? expected.x) === actual.x && (expected.gridY ?? expected.y) === actual.y;
    const rotationMatches = normalizeDegrees(expected.rotation ?? 0) === normalizeDegrees(actual.rotation);
    const contentMatches = !expected.content || Object.entries(expected.content).every(([key, value]) => (actual.geometry.internalElements ?? []).some((element) => (element as Record<string, unknown>)[key] === value));
    return positionMatches && rotationMatches && contentMatches;
  });
}

export function getAllTransformObjects(state: TransformBoardState): TransformObject[] {
  return [...state.objects ? Object.values(state.objects) : [], ...state.fixedObjects];
}

export function restoreBoardState(config: TransformBoardConfig, snapshot: TransformBoardSnapshot): TransformBoardState {
  if (snapshot.stateSchemaVersion !== 1) throw new Error("transform-board-state-schema-incompatible");
  const initial = createInitialTransformBoardState(config);
  return {
    ...initial,
    ...clone(snapshot.state),
    undoStack: [],
    fixedObjects: initial.fixedObjects,
    operationHistory: snapshot.state.operationHistory ?? [],
    recordTokens: snapshot.state.recordTokens ?? [],
    attemptState: snapshot.state.attemptState ?? "idle",
    timerState: snapshot.state.timerState ?? initial.timerState,
    solvedState: snapshot.state.solvedState ?? false,
  };
}

export function normalizedTransformEvent(type: TransformBoardEventType, payload: Record<string, unknown>): TransformBoardEvent {
  return { type, payload: clone(payload) };
}

export interface TransformBoardAppletConfig extends TransformBoardConfig {}

export function createTransformBoardApplet(): ClassroomApplet<TransformBoardAppletConfig, TransformBoardState, TransformBoardSubmission> {
  let state = createInitialTransformBoardState();
  let config = DEFAULT_TRANSFORM_BOARD_CONFIG;
  let host: AppletHost | null = null;
  async function emit(event: TransformBoardEvent): Promise<void> {
    if (host) await host.emitEvent(event);
    host?.publishLiveState(serializeBoardState(state) as unknown as Record<string, unknown>);
  }
  return {
    manifest: TRANSFORM_BOARD_MANIFEST,
    initialize(_context: AppletExecutionContext, nextHost: AppletHost) {
      host = nextHost;
    },
    load(nextConfig) {
      config = clone(nextConfig);
      state = createInitialTransformBoardState(config);
    },
    getState() {
      return clone(state);
    },
    restoreState(snapshot) {
      state = restoreBoardState(config, { stateSchemaVersion: 1, state: snapshot as unknown as TransformBoardFrame });
    },
    pause() {/* lifecycle owned by AppletHostRuntime */},
    resume() {/* lifecycle owned by AppletHostRuntime */},
    async submit() {
      const snapshot = serializeBoardState(state);
      await host?.saveSnapshot(snapshot.state as unknown as Record<string, unknown>);
      const solved = isTransformBoardSolved(state);
      await host?.emitEvent(normalizedTransformEvent("attempt.completed", { solved }));
      return { snapshot, objectCount: Object.keys(state.objects).length, solved };
    },
    async handleCommand(command: AppletCommand) {
      const before = state;
      if (command.type === "transform.reset") state = createInitialTransformBoardState(config);
      else if (command.type === "transform.translate") {
        const objectId = String(command.payload.objectId);
        const previous = state.objects[objectId];
        state = translateGrid(state, objectId, command.payload.axis as TransformAxis, Number(command.payload.distance));
        const next = state.objects[objectId];
        if (previous && next && (previous.x !== next.x || previous.y !== next.y)) {
          state = { ...state, operationHistory: [...state.operationHistory, { action: "translate", pieceId: objectId, before: { x: previous.x, y: previous.y }, after: { x: next.x, y: next.y }, direction: command.payload.direction ?? command.payload.axis, distance: Math.abs(Number(command.payload.distance)) }] };
        }
      } else if (command.type === "transform.rotate") state = commitRotation(state, String(command.payload.objectId), Number(command.payload.degrees));
      else if (command.type === "transform.select-pivot") state = selectPivot(state, String(command.payload.objectId), String(command.payload.pivotId));
      else if (command.type === "transform.undo") state = undoTransform(state);
      else if (command.type === "transform.set-mode" && typeof command.payload.mode === "string") state = { ...state, mode: command.payload.mode as TransformMode };
      else if (command.type === "transform.highlight" && typeof command.payload.objectId === "string") state = { ...state, selectedObjectId: command.payload.objectId };
      else if (command.type === "transform.record.update") {
        const payload = command.payload as Record<string, unknown>;
        state = {
          ...state,
          recordTokens: Array.isArray(payload.recordTokens) ? clone(payload.recordTokens) as Array<Record<string, unknown>> : state.recordTokens,
          attemptState: payload.attemptState === "success" || payload.attemptState === "failure" ? payload.attemptState : state.attemptState,
          timerState: payload.timerState && typeof payload.timerState === "object" ? clone(payload.timerState) as TransformBoardState["timerState"] : state.timerState,
          solvedState: payload.attemptState === "success",
        };
      } else throw new Error(`unsupported-transform-board-command:${command.type}`);
      if (state === before) return;
      const objectId = String(command.payload.objectId ?? state.selectedObjectId ?? "");
      if (command.type === "transform.translate") {
        const previous = before.objects[objectId];
        const next = state.objects[objectId];
        if (previous && next) await emit(normalizedTransformEvent("object.moved", { objectId, from: { x: previous.x, y: previous.y }, to: { x: next.x, y: next.y } }));
      } else if (command.type === "transform.rotate") {
        const previous = before.objects[objectId];
        const next = state.objects[objectId];
        if (previous && next) await emit(normalizedTransformEvent("object.rotated", { objectId, centerId: next.selectedPivotId, direction: next.rotation >= previous.rotation ? "clockwise" : "counterclockwise", angle: Math.abs(next.rotation - previous.rotation) }));
      } else if (command.type === "transform.select-pivot") {
        await emit(normalizedTransformEvent("object.rotation-center.changed", { objectId, centerId: state.objects[objectId]?.selectedPivotId ?? null }));
      } else if (command.type === "transform.undo") {
        await emit(normalizedTransformEvent("history.undo", { operationId: null }));
      } else if (command.type === "transform.highlight") {
        await emit(normalizedTransformEvent("object.selected", { objectId }));
      } else if (command.type === "transform.reset") {
        await emit(normalizedTransformEvent("attempt.reset", { reason: "applet-command" }));
      }
      if (command.type !== "transform.record.update") await host?.saveSnapshot(serializeBoardState(state).state as unknown as Record<string, unknown>);
    },
    destroy() {
      host = null;
    },
  };
}

export const createTransformBoardAppletFactory: AppletFactory<TransformBoardAppletConfig, TransformBoardState, TransformBoardSubmission> = () => createTransformBoardApplet();
