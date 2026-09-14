import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
import type { PresentationEngineAdapter } from '@classroom/presentation';
import { transitionDirections } from '@web-ppt/edit-core';
import type { EditAnimationStep, ElementId, ElementRecord, SlideId } from '@web-ppt/edit-core';
import type { VectorFill } from '@web-ppt/edit-core';
import { textBodyEditText } from '@web-ppt/edit-core';
import {
    createWebPptAdapter,
    WebPptPresentationEngineAdapter,
    createWebPptAssetFromBytes,
    buildWebPptCompatibilityReport,
    type WebPptPresentationAsset,
} from '@classroom/presentation-webppt-adapter';
import type { StudioCommand, StudioMenuItem } from './command-surface.js';
import type { IconId } from './icons/index.js';

type CommandSurfaceModule = typeof import('./command-surface.js');
let commandSurface: CommandSurfaceModule | null = null;

export const surface = getSurfaceDescriptor('authoring-studio');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS['authoring-studio'];

// Contract harness retained for lesson fixtures. Production Studio uses web-ppt.
export type StudioElementKind = 'text' | 'shape' | 'image' | 'svg';
export interface StudioElement { id: string;
 kind: StudioElementKind;
 x: number;
 y: number;
 width: number;
 height: number;
 zIndex: number;
 text?: string;
 color?: string;
 shape?: 'rectangle' | 'circle';
 src?: string;
 svgVariant?: 'burst' | 'grid';
 }
export interface StudioScene { id: string;
 title: string;
 elements: StudioElement[];
 steps: number;
 }
export interface StudioDocument { format: 'classcore-scene-studio-v1';
 scenes: StudioScene[];
 }
export function createBlankStudioDocument(title = '未命名公开课'): StudioDocument {
    return {
        format: 'classcore-scene-studio-v1',
        scenes: [{
            id: 'scene-1',
            title: title || '第一页',
            steps: 1,
            elements: [
                { id: 'element-title', kind: 'text', x: 72, y: 66, width: 760, height: 80, zIndex: 1, text: '标题', color: '#24324b' },
                { id: 'element-subtitle', kind: 'text', x: 76, y: 156, width: 620, height: 42, zIndex: 2, text: '副标题', color: '#697386' },
                { id: 'element-shape', kind: 'shape', shape: 'circle', x: 618, y: 268, width: 160, height: 160, zIndex: 3, color: '#897e70' },
            ],
        }],
    };
}
export function cloneScene(document: StudioDocument, sceneId: string): StudioDocument { const scene = document.scenes.find(item => item.id === sceneId);
 if (!scene) return document;
 const copy = structuredClone(scene);
 copy.id = nextId('scene');
 copy.title = `${scene.title} 副本`;
 copy.elements = copy.elements.map(element => ({ ...element, id: nextId('element') }));
 const index = document.scenes.findIndex(item => item.id === sceneId);
 return { ...document, scenes: [...document.scenes.slice(0, index + 1), copy, ...document.scenes.slice(index + 1)] };
 }
export function addScene(document: StudioDocument): StudioDocument { return { ...document, scenes: [...document.scenes, { id: nextId('scene'), title: `第 ${document.scenes.length + 1} 页`, elements: [], steps: 1 }] };
 }
export function removeScene(document: StudioDocument, sceneId: string): StudioDocument { return document.scenes.length <= 1 ? document : { ...document, scenes: document.scenes.filter(scene => scene.id !== sceneId) };
 }
export function moveScene(document: StudioDocument, sceneId: string, direction: -1 | 1): StudioDocument { const index = document.scenes.findIndex(scene => scene.id === sceneId);
 const target = index + direction;
 if (index < 0 || target < 0 || target >= document.scenes.length) return document;
 const scenes = [...document.scenes];
 [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
 return { ...document, scenes };
 }
export function addElement(document: StudioDocument, sceneId: string, element: Omit<StudioElement, 'id' | 'zIndex'>): StudioDocument { return mapScene(document, sceneId, scene => ({ ...scene, elements: [...scene.elements, { ...element, id: nextId('element'), zIndex: scene.elements.length + 1 }] }));
 }
export function updateElement(document: StudioDocument, sceneId: string, elementId: string, patch: Partial<StudioElement>): StudioDocument { return mapScene(document, sceneId, current => ({ ...current, elements: current.elements.map(element => element.id === elementId ? { ...element, ...patch } : element) }));
 }
export function moveElementLayer(document: StudioDocument, sceneId: string, elementId: string, direction: -1 | 1): StudioDocument { return mapScene(document, sceneId, scene => { const index = scene.elements.findIndex(element => element.id === elementId);
 const target = index + direction;
 if (index < 0 || target < 0 || target >= scene.elements.length) return scene;
 const elements = [...scene.elements];
 [elements[index], elements[target]] = [elements[target], elements[index]];
 return { ...scene, elements: elements.map((element, elementIndex) => ({ ...element, zIndex: elementIndex + 1 })) };
 });
 }
function mapScene(document: StudioDocument, sceneId: string, mapper: (scene: StudioScene) => StudioScene): StudioDocument { return { ...document, scenes: document.scenes.map(scene => scene.id === sceneId ? mapper(scene) : scene) };
 }
function nextId(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
 }

interface PublishedPresentationRecord { version: 1;
 deckId: string;
 title: string;
 fingerprint: string;
 publishedAt: string;
 runtimeIndex: Awaited<ReturnType<PresentationEngineAdapter['buildRuntimeIndex']>>;
 bytes: Uint8Array;
 }
const DRAFT_DB = 'classcore-presentation-drafts-v1';
const DRAFT_STORE = 'assets';
const PUBLISHED_STORE = 'published';
const DRAFT_META_PREFIX = 'classcore.presentation.draft.meta.v1';
const DRAFT_CURRENT_KEY = `${DRAFT_META_PREFIX}:current`;
const PUBLISHED_META_PREFIX = 'classcore.presentation.published.meta.v1';
const SERVER_META_PREFIX = 'classcore.presentation.server.meta.v1';
const SERVER_CURRENT_KEY = `${SERVER_META_PREFIX}:current`;
const PENDING_SYNC_META_KEY = 'classcore.presentation.pending-sync.meta.v1';

function scopedStorageKey(prefix: string, identity: string): string {
 return `${prefix}:${encodeURIComponent(identity)}`;
}

function openDraftDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DRAFT_DB, 2);
 request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DRAFT_STORE)) request.result.createObjectStore(DRAFT_STORE, { keyPath: 'deckId' });
 if (!request.result.objectStoreNames.contains(PUBLISHED_STORE)) request.result.createObjectStore(PUBLISHED_STORE, { keyPath: 'deckId' });
 };
 request.onsuccess = () => resolve(request.result);
 request.onerror = () => reject(request.error ?? new Error('presentation-draft-db-open-failed'));
 });
 }
interface StoredDraftMetadata { presentationSchemaVersion: 1;
 presentationId?: string;
 deckId: string;
 title: string;
 engine: WebPptPresentationAsset['engine'];
 document: WebPptPresentationAsset['document'];
 classroomBindings: WebPptPresentationAsset['classroomBindings'];
 createdAt: string;
 updatedAt: string;
 source: { kind: 'bytes';
 mimeType: string;
 sha256?: string };
 }

interface ServerProjectMetadata { presentationId: string; currentDraftRevision: number; }
interface PendingSyncMetadata {
 presentationId: string;
 baseDraftRevision: number;
 deckId: string;
 title: string;
 document: WebPptPresentationAsset['document'];
 savedAt: string;
}
function loadServerProjectMetadata(presentationId?: string): ServerProjectMetadata | null {
 try {
  const id = presentationId ?? localStorage.getItem(SERVER_CURRENT_KEY);
  return id ? JSON.parse(localStorage.getItem(scopedStorageKey(SERVER_META_PREFIX, id)) ?? 'null') as ServerProjectMetadata | null : null;
 } catch { return null; }
}
function saveServerProjectMetadata(value: ServerProjectMetadata): void {
 localStorage.setItem(scopedStorageKey(SERVER_META_PREFIX, value.presentationId), JSON.stringify(value));
 localStorage.setItem(SERVER_CURRENT_KEY, value.presentationId);
}
function clearServerProjectMetadata(presentationId?: string): void {
 const id = presentationId ?? localStorage.getItem(SERVER_CURRENT_KEY);
 if (!id) return;
 localStorage.removeItem(scopedStorageKey(SERVER_META_PREFIX, id));
 if (localStorage.getItem(SERVER_CURRENT_KEY) === id) localStorage.removeItem(SERVER_CURRENT_KEY);
}
type PendingSyncIndex = Record<string, PendingSyncMetadata>;
function loadPendingSyncIndex(): PendingSyncIndex {
 try { return JSON.parse(localStorage.getItem(PENDING_SYNC_META_KEY) ?? '{}') as PendingSyncIndex; } catch { return {}; }
}
function loadPendingSyncMetadata(presentationId?: string): PendingSyncMetadata | null {
 const index = loadPendingSyncIndex();
 return presentationId ? index[presentationId] ?? null : Object.values(index)[0] ?? null;
}
function savePendingSyncMetadata(asset: WebPptPresentationAsset, project: ServerProjectMetadata): void {
 const index = loadPendingSyncIndex();
 index[project.presentationId] = { presentationId: project.presentationId, baseDraftRevision: project.currentDraftRevision, deckId: asset.deckId, title: asset.title, document: asset.document, savedAt: asset.updatedAt } satisfies PendingSyncMetadata;
 localStorage.setItem(PENDING_SYNC_META_KEY, JSON.stringify(index));
}
function clearPendingSyncMetadata(presentationId?: string): void {
 const index = loadPendingSyncIndex();
 if (!presentationId) return;
 delete index[presentationId];
 localStorage.setItem(PENDING_SYNC_META_KEY, JSON.stringify(index));
}
function bytesToBase64(bytes: Uint8Array): string {
 let binary = '';
 for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
 return btoa(binary);
}
function serverHeaders(extra: Record<string, string> = {}): HeadersInit { return { 'x-classcore-user-id': 'demo-teacher', ...extra }; }
async function serverJson(path: string, init: RequestInit = {}): Promise<any> {
 const response = await fetch(path, { ...init, headers: { ...serverHeaders(), ...(init.headers ?? {}) } });
 if (!response.ok) throw new Error(`presentation-server-http-${response.status}`);
 return response.json();
}
async function persistWebPptDraft(asset: WebPptPresentationAsset, presentationId?: string): Promise<void> { if (!asset.source) throw new Error('presentation-source-required-for-save');
 const identity = presentationId ?? asset.deckId;
 const metadata: StoredDraftMetadata = {
  presentationSchemaVersion: 1,
  presentationId,
  deckId: asset.deckId,
  title: asset.title,
  engine: asset.engine,
  document: asset.document,
  classroomBindings: asset.classroomBindings,
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
  source: { kind: 'bytes', mimeType: asset.source.mimeType, sha256: asset.source.sha256 },
 };
 localStorage.setItem(scopedStorageKey(DRAFT_META_PREFIX, identity), JSON.stringify(metadata));
 localStorage.setItem(DRAFT_CURRENT_KEY, identity);
 const db = await openDraftDb();
 await new Promise<void>((resolve, reject) => { const request = db.transaction(DRAFT_STORE, 'readwrite').objectStore(DRAFT_STORE).put({ deckId: asset.deckId, bytes: asset.source!.bytes });
 request.onsuccess = () => resolve();
 request.onerror = () => reject(request.error ?? new Error('presentation-draft-save-failed'));
 });
 db.close();
 }
async function loadWebPptDraft(presentationId?: string): Promise<WebPptPresentationAsset | null> { try {
 const identity = presentationId ?? localStorage.getItem(DRAFT_CURRENT_KEY);
 const metadata = identity ? JSON.parse(localStorage.getItem(scopedStorageKey(DRAFT_META_PREFIX, identity)) ?? 'null') as StoredDraftMetadata | null : null;
 if (!metadata || metadata.engine.engineId !== 'web-ppt') return null;
 const db = await openDraftDb();
 const row = await new Promise<{ bytes: Uint8Array } | undefined>((resolve, reject) => { const request = db.transaction(DRAFT_STORE, 'readonly').objectStore(DRAFT_STORE).get(metadata.deckId);
 request.onsuccess = () => resolve(request.result as { bytes: Uint8Array } | undefined);
 request.onerror = () => reject(request.error ?? new Error('presentation-draft-load-failed'));
 });
 db.close();
 return row?.bytes ? { ...metadata, source: { ...metadata.source, bytes: new Uint8Array(row.bytes) } } : null;
 } catch { return null;
 } }
async function persistPublished(record: PublishedPresentationRecord): Promise<void> { localStorage.setItem(scopedStorageKey(PUBLISHED_META_PREFIX, record.deckId), JSON.stringify({ deckId: record.deckId, title: record.title, fingerprint: record.fingerprint, publishedAt: record.publishedAt, runtimeIndex: record.runtimeIndex }));
 const db = await openDraftDb();
 await new Promise<void>((resolve, reject) => { const request = db.transaction(PUBLISHED_STORE, 'readwrite').objectStore(PUBLISHED_STORE).put(record);
 request.onsuccess = () => resolve();
 request.onerror = () => reject(request.error ?? new Error('presentation-published-save-failed'));
 });
 db.close();
 }

function button(label: string, action: () => void | Promise<void>, className = '', title = label, icon?: IconId): HTMLButtonElement {
 return commandSurface!.createCommandButton({ id: `command:${label}`, label, icon, tooltip: title, execute: action }, 'compact', className) as HTMLButtonElement;
 }
function input(label: string, value: string, onChange: (value: string) => void, type = 'text'): HTMLInputElement { const control = document.createElement('input');
 control.type = type;
 control.value = value;
 control.setAttribute('aria-label', label);
 control.addEventListener('change', () => onChange(control.value));
 return control;
 }
function selectControl(label: string, value: string, options: readonly [string, string][], onChange: (value: string) => void): HTMLSelectElement {
 const control = document.createElement('select');
 control.className = 'toolbar-select';
 control.setAttribute('aria-label', label);
 options.forEach(([optionValue, optionLabel]) => { const option = document.createElement('option'); option.value = optionValue; option.textContent = optionLabel; control.append(option); });
 control.value = value;
 control.addEventListener('change', () => onChange(control.value));
 return control;
 }
function escapeText(value: string): string {
    return value
        .replaceAll('&', '&' + 'amp;')
        .replaceAll('<', '&' + 'lt;')
        .replaceAll('>', '&' + 'gt;')
        .replaceAll('"', '&' + 'quot;')
        .replaceAll("'", '&' + '#39;');
}
function textOfEffective(element: { text?: Parameters<typeof textBodyEditText>[0] } | null): string { return element?.text ? textBodyEditText(element.text) : ''; }
function solid(color: string): VectorFill { return { type: 'solid', color };
 }
function rgb(hex: string): string { const value = hex.replace('#', '');
 return `rgb(${Number.parseInt(value.slice(0, 2), 16)},${Number.parseInt(value.slice(2, 4), 16)},${Number.parseInt(value.slice(4, 6), 16)})`;
 }

export function mountPresentationStudio(root: HTMLElement): void {
    void mountPresentationStudioAsync(root);
}

/** Derive the editor's presentation-pixel zoom from the responsive stage host. */
export function computeStageFitZoom(viewportWidth: number, viewportHeight: number, presentationWidth: number, presentationHeight: number): number {
    if (![viewportWidth, viewportHeight, presentationWidth, presentationHeight].every(Number.isFinite)
        || viewportWidth <= 0 || viewportHeight <= 0 || presentationWidth <= 0 || presentationHeight <= 0) return 1;
    return Math.min(viewportWidth / presentationWidth, viewportHeight / presentationHeight);
}

export interface StageViewportLayout {
    contentWidth: number;
    contentHeight: number;
    stageLeft: number;
    stageTop: number;
}

export interface StageViewportFrame {
    width: number;
    height: number;
}

/** Let the viewport hug the stage until it reaches the available editing area. */
export function computeStageViewportFrame(
    availableWidth: number,
    availableHeight: number,
    presentationWidth: number,
    presentationHeight: number,
    zoom: number,
    borderWidth = 0,
    borderHeight = 0,
    padding = 0,
): StageViewportFrame {
    const safeAvailableWidth = Math.max(0, Number.isFinite(availableWidth) ? availableWidth : 0);
    const safeAvailableHeight = Math.max(0, Number.isFinite(availableHeight) ? availableHeight : 0);
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const safeBorderWidth = Math.max(0, Number.isFinite(borderWidth) ? borderWidth : 0);
    const safeBorderHeight = Math.max(0, Number.isFinite(borderHeight) ? borderHeight : 0);
    const safePadding = Math.max(0, Number.isFinite(padding) ? padding : 0);
    return {
        width: Math.min(safeAvailableWidth, presentationWidth * safeZoom + safePadding * 2 + safeBorderWidth),
        height: Math.min(safeAvailableHeight, presentationHeight * safeZoom + safePadding * 2 + safeBorderHeight),
    };
}

/** Keep a zoomed presentation fully reachable while centering it on axes that still fit. */
export function computeStageViewportLayout(
    viewportWidth: number,
    viewportHeight: number,
    presentationWidth: number,
    presentationHeight: number,
    zoom: number,
    padding = 20,
): StageViewportLayout {
    const safeViewportWidth = Math.max(0, Number.isFinite(viewportWidth) ? viewportWidth : 0);
    const safeViewportHeight = Math.max(0, Number.isFinite(viewportHeight) ? viewportHeight : 0);
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const safePadding = Math.max(0, Number.isFinite(padding) ? padding : 0);
    const scaledWidth = Math.max(0, presentationWidth * safeZoom);
    const scaledHeight = Math.max(0, presentationHeight * safeZoom);
    const contentWidth = Math.max(safeViewportWidth, scaledWidth + safePadding * 2);
    const contentHeight = Math.max(safeViewportHeight, scaledHeight + safePadding * 2);
    return {
        contentWidth,
        contentHeight,
        stageLeft: (contentWidth - scaledWidth) / 2,
        stageTop: (contentHeight - scaledHeight) / 2,
    };
}

async function mountPresentationStudioAsync(root: HTMLElement): Promise<void> {
 commandSurface = await import('./command-surface.js');
 const { createCommandButton, createDropdown, createGallery, createGalleryDropdown, createSplitButton } = commandSurface;
    const { PresentationStudioController } = await import('./controller.js');
    const templateUrl = '/assets/presentation-webppt-blank.pptx';
    const engine = new WebPptPresentationEngineAdapter(async () => { const response = await fetch(templateUrl);
 if (!response.ok) throw new Error(`presentation-template-http-${response.status}`);
 return new Uint8Array(await response.arrayBuffer());
 });
    const webPpt = createWebPptAdapter();
 const controller = new PresentationStudioController(webPpt);
    let asset: WebPptPresentationAsset | null = null;
 let preview: { root: HTMLElement;
 session: Awaited<ReturnType<typeof engine.mountPlayer>> } | null = null;
 let published: PublishedPresentationRecord | null = null;
 let busy = false;
 let serverProject: ServerProjectMetadata | null = loadServerProjectMetadata();
 const authoringParams = new URLSearchParams(window.location.search);
 const courseIdContext = authoringParams.get('courseId')?.trim() ?? '';
 const courseTitleContext = authoringParams.get('courseTitle')?.trim() ?? '';
 let serverSyncPending = false;
 let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
 let thumbnailRefreshTimer: ReturnType<typeof setTimeout> | null = null;
 let savePromise: Promise<void> | null = null;
 let editGeneration = 0;
 let savedGeneration = 0;
 let autosaveSuspended = true;
 let inspectorTab: 'object' | 'page' | 'animation' = 'object';
 let notesExpanded = false;
 let animationTrigger: 'click' | 'withPrev' | 'afterPrev' = 'click';
 let animationDurationMs = 300;
 let ribbonTab = 'start';
 let thumbnailGeneration = 0;
 let thumbnailAsset: WebPptPresentationAsset | null = null;
 let conflictOpen = false;
 let imageInputMode: 'insert' | 'replace' = 'insert';
 let fitZoom = 1;
 let stageZoomFactor = 1;
 const stageViewportPadding = 20;
 let canvasTextInput: { id: ElementId; element: HTMLTextAreaElement; reposition: () => void } | null = null;
 let canvasTextCommitPending = false;
    const thumbnailSessions = new Map<string, Awaited<ReturnType<typeof engine.mountPlayer>>>();
    root.replaceChildren();
 const app = document.createElement('div');
 app.className = 'studio-app';
 root.append(app);
    const header = document.createElement('header');
 header.className = 'studio-header';
 const brand = document.createElement('div');
 brand.className = 'studio-brand';
 brand.innerHTML = '<span class="brand-square">C</span><div><h1>课堂课件工作台</h1><span class="brand-meta">Authoring Studio · web-ppt</span></div>';
 const documentBar = document.createElement('div');
 documentBar.className = 'document-bar';
 const titleInput = document.createElement('input');
 titleInput.className = 'deck-title';
 titleInput.value = '未命名公开课';
 titleInput.setAttribute('aria-label', '课件标题');
 const saveState = document.createElement('span');
 saveState.className = 'save-state';
 const headerActions = document.createElement('div');
 headerActions.className = 'header-actions';
 const quickAccess = document.createElement('div');
 quickAccess.className = 'quick-access';
 quickAccess.setAttribute('aria-label', '快速访问工具栏');
 const quickCommand = (id: string, label: string, icon: IconId, execute: () => void | Promise<void>, shortcut: string): HTMLButtonElement => createCommandButton({ id, label, icon, shortcut, execute }, 'icon-only');
 quickAccess.append(quickCommand('save', '保存', 'save', () => persist(), '⌘/Ctrl+S'), quickCommand('undo', '撤销', 'undo', () => { controller.undo(); renderAll(); }, '⌘/Ctrl+Z'), quickCommand('redo', '重做', 'redo', () => { controller.redo(); renderAll(); }, '⌘/Ctrl+Shift+Z'));
 documentBar.append(quickAccess, titleInput, saveState);
 if (courseIdContext) {
  const courseContext = document.createElement('a');
  courseContext.className = 'studio-course-context';
  courseContext.href = '/backstage';
  courseContext.textContent = `课程：${courseTitleContext || courseIdContext} · 返回准备台`;
  courseContext.title = `当前课程 ${courseIdContext}`;
  documentBar.append(courseContext);
 }
 header.append(brand, documentBar, headerActions);
 app.append(header);
 const toolbar = document.createElement('nav');
 toolbar.className = 'context-toolbar';
 toolbar.setAttribute('aria-label', '课件编辑工具');
 const ribbonTabs = document.createElement('nav');
 ribbonTabs.className = 'ribbon-tabs';
 ribbonTabs.setAttribute('aria-label', '功能区选项卡');
 app.append(ribbonTabs, toolbar);
 const layout = document.createElement('main');
 layout.className = 'studio-layout';
 const scenePanel = document.createElement('aside');
 scenePanel.className = 'scene-panel';
 const stagePanel = document.createElement('section');
 stagePanel.className = 'stage-panel';
 const inspector = document.createElement('aside');
 inspector.className = 'inspector-panel';
 const inspectorBody = document.createElement('div');
 inspectorBody.className = 'inspector-body';
 const selectionPaneHost = document.createElement('div');
 selectionPaneHost.className = 'selection-pane-host';
 selectionPaneHost.setAttribute('aria-label', '选择窗格');
 const syncSelectionPaneIcons = (): void => {
  selectionPaneHost.querySelectorAll<HTMLElement>('[data-pane-element]').forEach(row => {
   const id = row.dataset.paneElement as ElementId | undefined;
   if (!id) return;
   const displayName = objectDisplayName(id);
   const name = row.querySelector<HTMLElement>('[data-pane-name]');
   if (name && name.textContent !== displayName) name.textContent = displayName;
   const rowLabel = row.getAttribute('aria-label') ?? '';
   if (rowLabel) {
    const parts = rowLabel.split('，');
    if (parts.length >= 2) row.setAttribute('aria-label', [displayName, displayName, ...parts.slice(2)].join('，'));
   }
   row.querySelectorAll<HTMLButtonElement>('button[aria-label]').forEach(button => {
   const label = button.getAttribute('aria-label') ?? '';
   const action = label.split('：')[0];
   const iconId: IconId | null = action === '隐藏对象' ? 'hide' : action === '显示对象' ? 'show' : action === '锁定对象' ? 'lock' : action === '解锁对象' ? 'unlock' : null;
   if (!iconId) return;
   const nextLabel = `${action}：${displayName}`;
   if (label !== nextLabel) {
    button.setAttribute('aria-label', nextLabel);
    button.title = nextLabel;
   }
   const expectedClass = `studio-icon-${iconId}`;
   if (button.querySelector(`.${expectedClass}`)) return;
   button.replaceChildren(commandSurface!.createIcon(iconId, nextLabel));
   button.classList.add('selection-pane-icon-button');
   button.title = nextLabel;
   });
  });
 };
 const selectionPaneObserver = new MutationObserver(syncSelectionPaneIcons);
 selectionPaneObserver.observe(selectionPaneHost, { childList: true, subtree: true });
 inspector.append(inspectorBody, selectionPaneHost);
 layout.append(scenePanel, stagePanel, inspector);
 app.append(layout);
 const statusBar = document.createElement('footer');
 statusBar.className = 'status-bar';
 app.append(statusBar);
    const sceneList = document.createElement('div');
 sceneList.className = 'scene-list';
 const stageTitle = document.createElement('div');
 stageTitle.className = 'stage-titlebar';
 const stageViewportSlot = document.createElement('div');
 stageViewportSlot.className = 'stage-viewport-slot';
 const editorHost = document.createElement('div');
 editorHost.className = 'studio-stage web-ppt-stage';
 editorHost.tabIndex = 0;
 editorHost.setAttribute('aria-label', '课件画布，可使用滚轮或触控板浏览放大的页面');
 stageViewportSlot.append(editorHost);
 const stageFooter = document.createElement('div');
 stageFooter.className = 'stage-footer';
 stagePanel.append(stageTitle, stageViewportSlot, stageFooter);
 const notesPane = document.createElement('section');
 notesPane.className = 'notes-pane';
 const notesHeader = document.createElement('div');
 notesHeader.className = 'notes-header';
 const notesTitle = document.createElement('strong');
 notesTitle.textContent = '备注';
 const notesMeta = document.createElement('span');
 notesMeta.className = 'notes-meta';
 notesMeta.textContent = '仅备课可见';
 const notesHeading = document.createElement('div');
 notesHeading.className = 'notes-heading';
 notesHeading.append(notesTitle, notesMeta);
 const notesToggle = document.createElement('button');
 notesToggle.type = 'button';
 notesToggle.className = 'notes-toggle';
 notesToggle.setAttribute('aria-label', '展开或收起备注');
 notesToggle.addEventListener('click', () => { notesExpanded = !notesExpanded; renderAll(false); });
 notesHeader.append(notesHeading, notesToggle);
 const notesEditor = document.createElement('textarea');
 notesEditor.className = 'notes-editor';
 notesEditor.setAttribute('aria-label', '当前页面备注');
 notesEditor.placeholder = '记录讲解提示、提问或板书安排';
 notesEditor.addEventListener('change', () => { const id = currentSlide(); if (id) controller.setNotes(id, notesEditor.value); renderAll(false); });
 notesPane.append(notesHeader, notesEditor);
 stagePanel.append(notesPane);
 const floatingToolbar = document.createElement('div');
 floatingToolbar.className = 'floating-toolbar';
 floatingToolbar.setAttribute('aria-label', '对象快捷工具栏');
 stagePanel.append(floatingToolbar);
 const contextMenu = document.createElement('div');
 contextMenu.className = 'stage-context-menu';
 contextMenu.setAttribute('role', 'menu');
 contextMenu.hidden = true;
 document.body.append(contextMenu);
 const dismissContextMenu = () => { contextMenu.hidden = true; };
 document.addEventListener('pointerdown', event => { if (!contextMenu.contains(event.target as Node)) dismissContextMenu(); });
 editorHost.addEventListener('contextmenu', event => {
  event.preventDefault();
  contextMenu.replaceChildren();
  const ids = selectedIds();
  const selectedRecord = ids.length === 1 ? controller.element(ids[0]) : null;
  const menuItems: Array<[string, IconId, () => void]> = ids.length ? [
   ['复制', 'copy', () => controller.copy()],
   ['删除', 'delete', () => controller.removeSelected()],
   ['置于顶层', 'arrange', () => controller.setLayerMany(ids, 'front')],
   ['组合', 'group', () => controller.group(ids)],
   ...(selectedRecord?.src.kind === 'image' ? [['裁剪图片', 'crop', () => controller.startImageCrop(ids[0])] as [string, IconId, () => void]] : []),
   ...(selectedRecord?.src.kind === 'table' ? [['插入行', 'table', () => controller.execute({ type: 'InsertRow', id: ids[0] })] as [string, IconId, () => void]] : []),
  ] : [
   ['新建幻灯片', 'new-slide', () => { const id = controller.addSlide(); if (id) webPpt.setView({ slideId: id, mode: 'edit' }); }],
   ['复制页面', 'duplicate', () => { const id = currentSlide(); if (id) { const copy = controller.duplicateSlide(id); if (copy) webPpt.setView({ slideId: copy, mode: 'edit' }); } }],
   ['删除页面', 'delete', () => { const id = currentSlide(); if (id) controller.removeSlide(id); }],
   ['备注', 'notes', () => { notesExpanded = true; notesEditor.focus(); }],
  ];
  menuItems.forEach(([label, icon, action]) => { const item = createCommandButton({ id: `context:${label}`, label, icon, execute: () => { action(); dismissContextMenu(); renderAll(); } }, 'compact'); item.setAttribute('role', 'menuitem'); contextMenu.append(item); });
  contextMenu.hidden = false;
  const target = event as MouseEvent;
  contextMenu.style.left = `${Math.max(8, Math.min(target.clientX, window.innerWidth - 210))}px`;
  contextMenu.style.top = `${Math.max(8, Math.min(target.clientY, window.innerHeight - 260))}px`;
 });
 editorHost.addEventListener('dblclick', event => {
  const directTarget = (event.target as Element | null)?.closest<SVGGraphicsElement>('[data-edit-id]');
  const target = directTarget ?? document.elementsFromPoint(event.clientX, event.clientY)
   .map(element => element.closest<SVGGraphicsElement>('[data-edit-id]'))
   .find((element): element is SVGGraphicsElement => Boolean(element));
  const id = target?.dataset.editId;
  const effective = id ? currentSession()?.editor.effectiveElement(id) : null;
  if (!id || effective?.kind !== 'shape' || !effective.text) return;
  event.preventDefault();
  event.stopPropagation();
  controller.select({ kind: 'elements', ids: [id], enteredGroup: null });
  renderAll(false);
  beginCanvasTextInput(id);
 }, true);
 let stageZoomFrame: number | null = null;
 const scheduleStageZoom = (): void => {
  if (stageZoomFrame !== null) cancelAnimationFrame(stageZoomFrame);
  stageZoomFrame = requestAnimationFrame(() => {
   stageZoomFrame = null;
   applyStageZoom();
  });
 };
 const stageResizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleStageZoom);
 stageResizeObserver?.observe(stageViewportSlot);
    function currentSession() { return controller.session;
 } function currentSlide(): SlideId | null { return controller.slideId ?? currentSession()?.editor.doc.slideOrder[0] ?? null;
 } function selectedIds() { return controller.selectedIds();
 } function selectedId(): ElementId | undefined { return selectedIds()[0];
 } function closeCanvasTextInput(commit = true): void {
  const active = canvasTextInput;
  if (!active) return;
  canvasTextInput = null;
  window.removeEventListener('resize', active.reposition);
  editorHost.removeEventListener('scroll', active.reposition);
  const value = active.element.value;
  active.element.remove();
  if (!commit || !currentSession()?.editor.doc.elements[active.id]) return;
  canvasTextCommitPending = true;
  controller.editText(active.id, value);
  setTimeout(() => {
   canvasTextCommitPending = false;
   renderAll(false);
  }, 0);
 } function beginCanvasTextInput(id: ElementId): boolean {
  closeCanvasTextInput();
  webPpt.snapshot.view?.releaseTextEditing();
  const editor = currentSession()?.editor;
  const target = webPpt.snapshot.view?.element.querySelector<SVGGraphicsElement>(`[data-edit-id="${CSS.escape(id)}"]`);
  const effective = editor?.effectiveElement(id);
  if (!target || !effective || effective.kind !== 'shape' || !effective.text) return false;
  const textInput = document.createElement('textarea');
  textInput.className = 'studio-canvas-text-input';
  textInput.value = textOfEffective(effective);
  textInput.setAttribute('aria-label', '编辑文本框内容');
  textInput.setAttribute('autocomplete', 'off');
  textInput.spellcheck = false;
  const reposition = (): void => {
   if (!textInput.isConnected || !target.isConnected) return;
   const hostRect = editorHost.getBoundingClientRect();
   const targetRect = target.getBoundingClientRect();
   textInput.style.left = `${targetRect.left - hostRect.left + editorHost.scrollLeft}px`;
   textInput.style.top = `${targetRect.top - hostRect.top + editorHost.scrollTop}px`;
   textInput.style.width = `${Math.max(80, targetRect.width)}px`;
   textInput.style.height = `${Math.max(36, targetRect.height)}px`;
   textInput.style.fontSize = `${Math.max(16, 32 * controller.snapshot.zoom)}px`;
  };
  canvasTextInput = { id, element: textInput, reposition };
  textInput.addEventListener('keydown', event => {
   event.stopPropagation();
   if (event.isComposing) return;
   if (event.key === 'Escape') {
    event.preventDefault();
    closeCanvasTextInput();
   } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    closeCanvasTextInput();
    setTimeout(() => { void persist(); }, 0);
   }
  });
  textInput.addEventListener('blur', () => closeCanvasTextInput());
  editorHost.append(textInput);
  reposition();
  window.addEventListener('resize', reposition);
  editorHost.addEventListener('scroll', reposition);
  textInput.focus({ preventScroll: true });
  textInput.select();
  return true;
 } function setStatus(message: string, error = false): void { saveState.textContent = message;
 saveState.className = `save-state${error ? ' status-error' : ''}`;
 }
 function readStageBoxMetrics(element: HTMLElement): { width: number; height: number; borderWidth: number; borderHeight: number } {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const borderWidth = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
  const borderHeight = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
  return { width: rect.width, height: rect.height, borderWidth, borderHeight };
 }
 function readStageViewportSize(): { width: number; height: number } {
  const { width, height, borderWidth, borderHeight } = readStageBoxMetrics(editorHost);
  return { width: width - borderWidth, height: height - borderHeight };
 }
 function readStageFitZoom(): number {
  const meta = currentSession()?.editor.doc.meta;
  if (!meta) return 1;
  const slot = readStageBoxMetrics(stageViewportSlot);
  const host = readStageBoxMetrics(editorHost);
  return computeStageFitZoom(
   slot.width - host.borderWidth,
   slot.height - host.borderHeight,
   meta.width,
   meta.height,
  );
 }
 function sizeStageViewport(zoom: number): void {
  const meta = currentSession()?.editor.doc.meta;
  if (!meta) return;
  const slot = readStageBoxMetrics(stageViewportSlot);
  const host = readStageBoxMetrics(editorHost);
  const isOverflowing = zoom > fitZoom + .001;
  const padding = isOverflowing ? stageViewportPadding : 0;
  const frame = computeStageViewportFrame(
   slot.width,
   slot.height,
   meta.width,
   meta.height,
   zoom,
   host.borderWidth,
   host.borderHeight,
   padding,
  );
  editorHost.style.width = `${frame.width}px`;
  editorHost.style.height = `${frame.height}px`;
  editorHost.classList.toggle('is-overflowing', isOverflowing);
 }
 function captureStageViewportAnchor(): { x: number; y: number } | null {
  const viewElement = webPpt.snapshot.view?.element;
  const stage = viewElement?.querySelector<HTMLElement>('[data-ppt-stage]');
  const zoom = webPpt.snapshot.zoom;
  if (!viewElement || !stage || !Number.isFinite(zoom) || zoom <= 0) return null;
  return {
   x: (editorHost.scrollLeft + editorHost.clientWidth / 2 - (Number.parseFloat(stage.style.left) || 0)) / zoom,
   y: (editorHost.scrollTop + editorHost.clientHeight / 2 - (Number.parseFloat(stage.style.top) || 0)) / zoom,
  };
 }
 function layoutStageViewport(zoom: number, anchor: { x: number; y: number } | null = null): void {
  const meta = currentSession()?.editor.doc.meta;
  const viewElement = webPpt.snapshot.view?.element;
  const stage = viewElement?.querySelector<HTMLElement>('[data-ppt-stage]');
  if (!meta || !viewElement || !stage) return;
  const viewportPadding = zoom > fitZoom + .001 ? stageViewportPadding : 0;
  const viewport = readStageViewportSize();
  const layout = computeStageViewportLayout(
   viewport.width,
   viewport.height,
   meta.width,
   meta.height,
   zoom,
   viewportPadding,
  );
  viewElement.style.width = `${layout.contentWidth}px`;
  viewElement.style.height = `${layout.contentHeight}px`;
  viewElement.style.overflow = 'visible';
  stage.style.position = 'absolute';
  stage.style.left = `${layout.stageLeft}px`;
  stage.style.top = `${layout.stageTop}px`;
  if (anchor) {
   editorHost.scrollLeft = layout.stageLeft + anchor.x * zoom - editorHost.clientWidth / 2;
   editorHost.scrollTop = layout.stageTop + anchor.y * zoom - editorHost.clientHeight / 2;
  }
 }
 function applyStageZoom(resetFactor = false): void {
  if (resetFactor) stageZoomFactor = 1;
  const anchor = resetFactor ? null : captureStageViewportAnchor();
  fitZoom = readStageFitZoom();
  const nextZoom = Math.min(2, Math.max(.1, fitZoom * stageZoomFactor));
  if (!webPpt.snapshot.view) return;
  if (Math.abs(webPpt.snapshot.zoom - nextZoom) >= .001) {
   controller.setZoom(nextZoom);
   renderAll(false);
  }
  sizeStageViewport(nextZoom);
  layoutStageViewport(nextZoom, anchor);
  if (resetFactor) {
   editorHost.scrollLeft = 0;
   editorHost.scrollTop = 0;
  }
 }
 function changeStageZoom(delta: number): void {
  fitZoom = readStageFitZoom();
  const currentZoom = controller.snapshot.zoom;
  const nextZoom = Math.min(2, Math.max(.1, currentZoom + delta));
  stageZoomFactor = nextZoom / Math.max(.01, fitZoom);
  if (Math.abs(currentZoom - nextZoom) < .001) return;
  const anchor = captureStageViewportAnchor();
  controller.setZoom(nextZoom);
  sizeStageViewport(nextZoom);
  layoutStageViewport(nextZoom, anchor);
 }
 function renderRibbonTabs(): void {
  ribbonTabs.replaceChildren();
  const tabs: Array<[string, string]> = [['file', '文件'], ['start', '开始'], ['insert', '插入'], ['design', '设计'], ['transition', '切换'], ['animation', '动画'], ['show', '幻灯片放映'], ['view', '视图']];
  const selected = selectedIds()[0];
  const selectedRecord = selected ? controller.element(selected) : null;
  if (selectedRecord?.src.kind === 'shape' || selectedRecord?.src.kind === 'table') tabs.push(['text-format', '文本格式']);
  if (selectedRecord?.src.kind === 'image') tabs.push(['image-format', '图片格式']);
  if (selectedRecord?.src.kind === 'shape') tabs.push(['shape-format', '形状格式']);
  if (selectedRecord?.src.kind === 'table') tabs.push(['table-design', '表格设计'], ['table-layout', '表格布局']);
  if (!tabs.some(([id]) => id === ribbonTab)) ribbonTab = 'start';
  tabs.forEach(([id, label]) => {
   const tab = button(label, () => { ribbonTab = id; renderRibbonTabs(); renderToolbar(); }, `ribbon-tab${ribbonTab === id ? ' active' : ''}`, label);
   tab.setAttribute('role', 'tab');
   tab.setAttribute('aria-selected', String(ribbonTab === id));
   ribbonTabs.append(tab);
  });
  ribbonTabs.setAttribute('role', 'tablist');
 }
 function showConflictDialog(): void {
  if (conflictOpen || !serverProject) return;
  conflictOpen = true;
  const dialog = document.createElement('dialog'); dialog.className = 'conflict-dialog';
  const heading = document.createElement('h2'); heading.textContent = '此课件已在其他窗口修改';
  const note = document.createElement('p'); note.textContent = '重新加载服务器版本会放弃当前未同步改动；另存为副本会保留当前课件。';
  const actions = document.createElement('div'); actions.className = 'dialog-actions';
  const reload = button('重新加载服务器版本', async () => {
   const remote = await loadRemotePresentation(serverProject!.presentationId);
   await openAsset(remote); serverSyncPending = false; setStatus('已加载服务器版本'); dialog.close();
  }, 'card-secondary', '重新加载服务器版本', 'replace');
  const duplicate = button('另存为副本', async () => {
   const localAsset = asset;
   if (!localAsset?.source) throw new Error('本地冲突内容不可用');
   const result = await serverJson(`/api/presentations/${encodeURIComponent(serverProject!.presentationId)}/duplicate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: `${localAsset.title} 副本`, bytesBase64: bytesToBase64(localAsset.source.bytes), mimeType: localAsset.source.mimeType, document: { ...localAsset.document, deckId: localAsset.deckId } }),
   });
   clearPendingSyncMetadata(serverProject?.presentationId);
   dialog.close(); window.location.href = `/authoring?presentationId=${encodeURIComponent(result.presentation.presentationId)}`;
  }, 'primary-button', '另存为副本', 'duplicate');
  actions.append(reload, duplicate); dialog.append(heading, note, actions); document.body.append(dialog);
  dialog.addEventListener('close', () => { conflictOpen = false; dialog.remove(); }); dialog.showModal();
 } function wrapAction(action: () => void | Promise<void>): () => void { return () => { try { const result = action();
 if (result instanceof Promise) void result.catch(error => setStatus(error instanceof Error ? error.message : String(error), true));
 } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true);
 } };
 }
 async function loadRemotePresentation(presentationId: string): Promise<WebPptPresentationAsset> {
  const result = await serverJson(`/api/presentations/${encodeURIComponent(presentationId)}`);
  const project = result.presentation;
  const response = await fetch(`/api/presentations/${encodeURIComponent(presentationId)}/draft?download=1`, { headers: serverHeaders() });
  if (!response.ok) throw new Error(`presentation-server-http-${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const document = project.currentDraftDocument as WebPptPresentationAsset['document'];
  if (!document?.idPrefix) throw new Error('presentation-server-document-metadata-missing');
  serverProject = { presentationId, currentDraftRevision: project.currentDraftRevision };
  saveServerProjectMetadata(serverProject);
  return createWebPptAssetFromBytes(project.title, bytes, document.idPrefix).then(next => ({ ...next, document, updatedAt: project.updatedAt }));
 }

 async function syncServerDraft(next: WebPptPresentationAsset): Promise<void> {
  if (!next.source) throw new Error('presentation-source-required-for-save');
  if (!serverProject) {
   const uploaded = await fetch('/api/presentation-assets', { method: 'POST', headers: serverHeaders({ 'content-type': next.source.mimeType }), body: next.source.bytes as unknown as BodyInit });
   if (!uploaded.ok) throw new Error(`presentation-server-http-${uploaded.status}`);
   const { asset: uploadedAsset } = await uploaded.json();
   const created = await serverJson('/api/presentations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: next.title, assetId: uploadedAsset.assetId, document: { ...next.document, deckId: next.deckId } }) });
   serverProject = { presentationId: created.presentation.presentationId, currentDraftRevision: created.presentation.currentDraftRevision };
   saveServerProjectMetadata(serverProject);
   return;
  }
  const response = await fetch(`/api/presentations/${encodeURIComponent(serverProject.presentationId)}/draft`, {
   method: 'PUT',
   headers: serverHeaders({
    'content-type': next.source.mimeType,
    'if-match': String(serverProject.currentDraftRevision),
    'x-presentation-document': JSON.stringify({ ...next.document, deckId: next.deckId }),
   }),
   body: next.source.bytes as unknown as BodyInit,
  });
  if (response.status === 409) throw new Error('draft-conflict');
  if (!response.ok) throw new Error(`presentation-server-http-${response.status}`);
  const result = await response.json();
 serverProject.currentDraftRevision = result.presentation.currentDraftRevision;
 saveServerProjectMetadata(serverProject);
 }
 async function currentPresentationBytes(): Promise<{ bytes: Uint8Array; mimeType: string; title: string; document: WebPptPresentationAsset['document']; deckId: string } | null> {
  if (!asset?.source) { setStatus('当前没有可用的课件', true); return null; }
  const bytes = await controller.save();
  return { bytes, mimeType: asset.source.mimeType, title: titleInput.value.trim() || asset.title || '课件', document: asset.document, deckId: asset.deckId };
 }
 function downloadBytes(bytes: Uint8Array, mimeType: string, title: string): void {
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}.pptx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
 }
 async function exportCurrentPresentation(): Promise<void> {
  const current = await currentPresentationBytes();
  if (!current) return;
  downloadBytes(current.bytes, current.mimeType, current.title);
  setStatus('已导出当前编辑状态 PPTX');
 }
 async function duplicateCurrentPresentation(): Promise<void> {
  const current = await currentPresentationBytes();
  if (!current) return;
  if (!serverProject) {
   const uploaded = await fetch('/api/presentation-assets', { method: 'POST', headers: serverHeaders({ 'content-type': current.mimeType }), body: current.bytes as unknown as BodyInit });
   if (!uploaded.ok) throw new Error(`presentation-server-http-${uploaded.status}`);
   const { asset: uploadedAsset } = await uploaded.json();
   const created = await serverJson('/api/presentations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: `${current.title} 副本`, assetId: uploadedAsset.assetId, document: { ...current.document, deckId: current.deckId } }),
   });
   window.location.href = `/authoring?presentationId=${encodeURIComponent(created.presentation.presentationId)}`;
   return;
  }
  const result = await serverJson(`/api/presentations/${encodeURIComponent(serverProject.presentationId)}/duplicate`, {
   method: 'POST',
   headers: { 'content-type': 'application/json' },
   body: JSON.stringify({ title: `${current.title} 副本`, bytesBase64: bytesToBase64(current.bytes), mimeType: current.mimeType, document: { ...current.document, deckId: current.deckId } }),
  });
  window.location.href = `/authoring?presentationId=${encodeURIComponent(result.presentation.presentationId)}`;
 }
    async function syncThumbnails(): Promise<void> { const generation = ++thumbnailGeneration;
 for (const session of thumbnailSessions.values()) session.dispose();
 thumbnailSessions.clear();
 if (!thumbnailAsset) return;
 const hosts = [...sceneList.querySelectorAll<HTMLElement>('[data-thumbnail-host]')];
 const slideIds = [...(currentSession()?.editor.doc.slideOrder ?? [])];
 const targets = new Map<string, HTMLElement>();
 for (const host of hosts) {
  const slideId = host.dataset.thumbnailHost;
  if (slideId && slideIds.includes(slideId)) targets.set(slideId, host);
 }
 try {
  const sessions = await engine.mountThumbnailViews(targets, thumbnailAsset);
  if (generation !== thumbnailGeneration) {
   for (const session of sessions.values()) session.dispose();
   return;
  }
  for (const [slideId, session] of sessions) thumbnailSessions.set(slideId, session);
 } catch {
  for (const host of hosts) host.textContent = '缩略图不可用';
 } }
    function renderScenePanel(updateThumbnails = true): void { const editor = currentSession()?.editor;
 const slides = editor?.doc.slideOrder ?? [];
 const slideRatio = editor?.doc.meta ? `${editor.doc.meta.width} / ${editor.doc.meta.height}` : '16 / 9';
 const active = currentSlide();
 scenePanel.replaceChildren();
 const heading = document.createElement('div');
 heading.className = 'panel-heading scene-panel-heading';
 const headingTitle = document.createElement('span');
 headingTitle.textContent = '页面';
 const count = document.createElement('span');
 count.className = 'count-pill';
 count.textContent = `${slides.length} 页`;
 count.setAttribute('aria-label', `${slides.length} 个页面`);
 heading.append(headingTitle, count);
 const intro = document.createElement('p');
 intro.className = 'scene-panel-intro';
 intro.textContent = '选择页面，快速调整顺序和内容。';
 scenePanel.append(heading, intro, sceneList);
 sceneList.replaceChildren();
 slides.forEach((slideId: SlideId, index: number) => { const item = document.createElement('button');
 item.type = 'button';
 item.className = `scene-thumb${slideId === active ? ' active' : ''}`;
 item.setAttribute('aria-label', `第 ${index + 1} 页`);
 item.setAttribute('aria-current', slideId === active ? 'page' : 'false');
 item.addEventListener('click', () => { webPpt.setView({ slideId, mode: 'edit' });
 renderAll();
 });
 const number = document.createElement('span');
 number.className = 'scene-number';
 number.textContent = String(index + 1).padStart(2, '0');
 const thumb = document.createElement('span');
 thumb.className = 'scene-mini-canvas';
 thumb.style.aspectRatio = slideRatio;
 thumb.dataset.thumbnailHost = slideId;
 const thumbContent = document.createElement('span');
 thumbContent.className = 'scene-thumb-content';
 const caption = document.createElement('span');
 caption.className = 'scene-thumb-caption';
 const label = document.createElement('span');
 label.className = 'scene-thumb-label';
 label.textContent = `第 ${index + 1} 页`;
 caption.append(label);
 if (slideId === active) {
  const state = document.createElement('span');
  state.className = 'scene-thumb-state';
  state.textContent = '当前';
  caption.append(state);
 }
 thumbContent.append(thumb, caption);
 item.append(number, thumbContent);
 sceneList.append(item);
 });
 const actions = document.createElement('div');
 actions.className = 'scene-actions';
 actions.append(button('新建页面', wrapAction(() => { const id = controller.addSlide();
 if (id) webPpt.setView({ slideId: id, mode: 'edit' });
 renderAll();
 }), 'primary-button', '新建页面', 'new-slide'), button('复制页面', wrapAction(() => { const id = currentSlide();
 if (!id) return;
 const copy = controller.duplicateSlide(id);
 if (copy) webPpt.setView({ slideId: copy, mode: 'edit' });
 renderAll();
 }), 'small-button', '复制页面', 'copy'));
 const reorder = document.createElement('div');
 reorder.className = 'scene-reorder';
 const reorderTitle = document.createElement('span');
 reorderTitle.className = 'scene-reorder-title';
 reorderTitle.textContent = '页面顺序';
 const reorderActions = document.createElement('div');
 reorderActions.className = 'scene-reorder-actions';
 reorderActions.append(button('上移', wrapAction(() => { const id = currentSlide();
 if (id) controller.moveSlide(id, -1);
 renderAll();
 }), 'small-button', '上移页面', 'arrange'), button('下移', wrapAction(() => { const id = currentSlide();
 if (id) controller.moveSlide(id, 1);
 renderAll();
 }), 'small-button', '下移页面', 'arrange'));
 const deletePage = button('删除页面', wrapAction(() => { const id = currentSlide();
 if (id) controller.removeSlide(id);
 renderAll();
 }), 'danger-button', slides.length <= 1 ? '至少保留一个页面' : '删除页面', 'delete');
 deletePage.disabled = slides.length <= 1;
 reorderActions.append(deletePage);
 reorder.append(reorderTitle, reorderActions);
 scenePanel.append(actions, reorder);
 if (updateThumbnails) void syncThumbnails();
 }
    function renderToolbar(): void { toolbar.replaceChildren();
 const renderOfficeToolbar = (): void => {
  const group = (label: string, controls: HTMLElement[], extraClass = ''): void => {
   const section = document.createElement('div');
   section.className = `toolbar-group${extraClass ? ` ${extraClass}` : ''}`;
   section.setAttribute('aria-label', label);
   section.append(...controls);
   toolbar.append(section);
  };
  const command = (id: string, label: string, icon: IconId, execute: () => void | Promise<void>, shortcut?: string, disabled = false): StudioCommand => ({ id, label, icon, shortcut, disabled, execute: wrapAction(execute) });
  const selectionIds = selectedIds();
  const selectedRecord = selectionIds.length === 1 ? controller.element(selectionIds[0]) : null;
  const divider = (id: string): StudioMenuItem => ({ id, label: '', separator: true, execute: () => undefined });
  const arrange: StudioMenuItem[] = [
   command('layer-front', '置于顶层', 'bring-front', () => { controller.setLayerMany(selectedIds(), 'front'); renderAll(); }),
   command('layer-forward', '上移一层', 'bring-forward', () => { controller.setLayerMany(selectedIds(), 'forward'); renderAll(); }),
   command('layer-backward', '下移一层', 'send-backward', () => { controller.setLayerMany(selectedIds(), 'backward'); renderAll(); }),
   command('layer-back', '置于底层', 'send-back', () => { controller.setLayerMany(selectedIds(), 'back'); renderAll(); }),
   divider('layer-divider'),
   { ...command('align', '对齐', 'align', () => undefined), submenu: [
    command('align-left', '左对齐', 'align-left', () => { controller.align(selectedIds(), 'left'); renderAll(); }),
    command('align-center', '水平居中', 'align-center-horizontal', () => { controller.align(selectedIds(), 'center'); renderAll(); }),
    command('align-right', '右对齐', 'align-right', () => { controller.align(selectedIds(), 'right'); renderAll(); }),
    command('align-top', '顶端对齐', 'align-top', () => { controller.align(selectedIds(), 'top'); renderAll(); }),
    command('align-middle', '垂直居中', 'align-middle', () => { controller.align(selectedIds(), 'middle'); renderAll(); }),
    command('align-bottom', '底端对齐', 'align-bottom', () => { controller.align(selectedIds(), 'bottom'); renderAll(); }),
   ] },
   { ...command('distribute', '分布', 'distribute', () => undefined), submenu: [
    command('distribute-horizontal', '水平分布', 'distribute-horizontal', () => { controller.distributeHorizontal(selectedIds()); renderAll(); }, undefined, selectedIds().length < 3),
    command('distribute-vertical', '垂直分布', 'distribute-vertical', () => { controller.distributeVertical(selectedIds()); renderAll(); }, undefined, selectedIds().length < 3),
   ] },
   { ...command('group-menu', '组合', 'group', () => undefined), submenu: [
    command('group', '组合', 'group', () => { controller.group(selectedIds()); renderAll(); }, '⌘/Ctrl+G', selectionIds.length < 2),
    command('ungroup', '取消组合', 'ungroup', () => { if (selectionIds[0]) controller.ungroup(selectionIds[0]); renderAll(); }, '⌘/Ctrl+Shift+G', selectedRecord?.src.kind !== 'group'),
   ] },
   { ...command('rotate', '旋转', 'rotate', () => undefined), submenu: [
    command('rotate-right', '向右旋转 90°', 'rotate-right', () => { controller.rotateMany(selectedIds(), 90); renderAll(); }),
    command('rotate-left', '向左旋转 90°', 'rotate-left', () => { controller.rotateMany(selectedIds(), -90); renderAll(); }),
    command('flip-h', '水平翻转', 'flip-horizontal', () => { controller.setFlipMany(selectedIds(), true); renderAll(); }),
    command('flip-v', '垂直翻转', 'flip-vertical', () => { controller.setFlipMany(selectedIds(), undefined, true); renderAll(); }),
   ] },
   divider('transform-divider'),
   command('lock', selectedRecord?.meta.locked ? '解锁' : '锁定', selectedRecord?.meta.locked ? 'unlock' : 'lock', () => { selectedIds().forEach(id => controller.setLocked(id, !(controller.element(id)?.meta.locked === true))); renderAll(); }, undefined, !selectionIds.length),
   command('visibility', selectedRecord?.meta.hiddenByUser ? '显示' : '隐藏', selectedRecord?.meta.hiddenByUser ? 'show' : 'hide', () => { selectedIds().forEach(id => controller.setHidden(id, !(controller.element(id)?.meta.hiddenByUser === true))); renderAll(); }, undefined, !selectionIds.length),
   command('selection-pane', '选择窗格', 'selection-pane', () => { inspectorTab = 'object'; renderAll(); }),
  ];
  const addNewSlide = (layoutId?: string): void => { const id = layoutId ? controller.addSlideWithLayout(layoutId) : controller.addSlide(); if (id) webPpt.setView({ slideId: id, mode: 'edit' }); renderAll(); };
  const addShape = (preset: string): void => { controller.addShape(preset); renderAll(); };
  if (ribbonTab === 'file') group('文件', [createDropdown(command('file', '文件', 'save', () => undefined), [
   command('new', '新建', 'new-slide', () => newDeck()),
   command('open', '打开 PPTX', 'image', () => fileInput.click()),
   command('save', '保存', 'save', () => persist(), '⌘/Ctrl+S'),
   command('save-copy', '另存为副本', 'duplicate', () => duplicateCurrentPresentation()),
   command('export-pptx', '导出 PPTX', 'publish', () => exportCurrentPresentation()),
   command('rehearse', '试课', 'rehearse', () => rehearse()),
   command('publish', '发布课堂版本', 'publish', () => publish()),
  ])]);
  if (ribbonTab === 'start') {
   group('剪贴板', [
    commandSurface!.createCommandButton({ id: 'paste', label: '粘贴', icon: 'paste', shortcut: '⌘/Ctrl+V', execute: () => { controller.paste(); renderAll(); } }, 'compact', 'tool-button'),
    button('剪切', wrapAction(() => { controller.cut(); }), 'tool-button', '剪切', 'cut'),
    button('复制', wrapAction(() => { controller.copy(); }), 'tool-button', '复制', 'copy'),
    button('格式刷', wrapAction(() => { controller.startFormatPainter(); }), 'tool-button', '格式刷', 'format-painter'),
   ]);
   group('幻灯片', [
    createSplitButton(command('new-slide', '新建幻灯片', 'new-slide', addNewSlide), [
     ...(currentSession()?.editor.doc.layoutOrder ?? []).map((layoutId: string) => command(`layout:${layoutId}`, currentSession()!.editor.doc.layouts[layoutId]?.name ?? '版式', 'new-slide', () => addNewSlide(layoutId))),
    ]),
    button('复制', wrapAction(() => { const id = currentSlide(); if (id) { const copy = controller.duplicateSlide(id); if (copy) webPpt.setView({ slideId: copy, mode: 'edit' }); renderAll(); } }), 'tool-button', '复制', 'copy'),
    button('删除', wrapAction(() => { const id = currentSlide(); if (id) controller.removeSlide(id); renderAll(); }), 'danger-button', '删除', 'delete'),
   ]);
   group('排列', [createDropdown(command('arrange', '排列', 'arrange', () => undefined), arrange)]);
   group('编辑', [
    button('查找', wrapAction(() => controller.openTextSearch({ mode: 'find' })), 'tool-button', '查找', 'search'),
    button('替换', wrapAction(() => controller.openTextSearch({ mode: 'replace' })), 'tool-button', '替换', 'replace'),
    createDropdown(command('select', '选择', 'selection-pane', () => undefined), [
     command('select-all', '全选', 'selection-pane', () => controller.selectAll()),
     command('selection-pane', '选择窗格', 'selection-pane', () => { inspectorTab = 'object'; renderAll(); }),
    ]),
   ]);
  }
  if (ribbonTab === 'insert') {
   group('文本', [button('文本框', wrapAction(() => { const id = controller.addTextBox(); if (!id) { setStatus('无法创建文本框', true); return; } controller.select({ kind: 'elements', ids: [id], enteredGroup: null }); renderAll(); if (!beginCanvasTextInput(id)) setStatus('文本框编辑器暂时不可用，请重新选择文本框', true); }), 'tool-button', '文本框', 'text')]);
   group('图片', [createSplitButton(command('image', '图片', 'image', () => chooseImage('insert')), [
    command('replace-image', '替换图片', 'replace-image', () => chooseImage('replace')),
    command('image-options', '图片选项', 'image', () => { inspectorTab = 'object'; renderAll(); }),
   ])]);
   const shapeItems = [
    { ...command('shape-rect', '矩形', 'shape', () => addShape('rect')), preview: 'preview-rect' },
    { ...command('shape-roundrect', '圆角矩形', 'shape', () => addShape('roundRect')), preview: 'preview-roundrect' },
    { ...command('shape-ellipse', '椭圆', 'shape', () => addShape('ellipse')), preview: 'preview-ellipse' },
    { ...command('shape-diamond', '菱形', 'shape', () => addShape('diamond')), preview: 'preview-diamond' },
    { ...command('shape-triangle', '三角形', 'shape', () => addShape('triangle')), preview: 'preview-triangle' },
    { ...command('shape-pentagon', '五边形', 'shape', () => addShape('pentagon')), preview: 'preview-pentagon' },
    { ...command('shape-hexagon', '六边形', 'shape', () => addShape('hexagon')), preview: 'preview-hexagon' },
    { ...command('shape-heart', '心形', 'shape', () => addShape('heart')), preview: 'preview-heart' },
    { ...command('shape-cloud', '云形', 'shape', () => addShape('cloud')), preview: 'preview-cloud' },
    { ...command('shape-arrow', '下箭头', 'shape', () => addShape('downArrow')), preview: 'preview-arrow' },
    { ...command('shape-line', '直线', 'shape', () => addShape('line')), preview: 'preview-line' },
   ];
   const tableItems = Array.from({ length: 16 }, (_unused, index) => {
    const rows = Math.floor(index / 4) + 1;
    const cols = index % 4 + 1;
    return { ...command(`table:${rows}x${cols}`, `${rows} × ${cols}`, 'table', () => { controller.addTable(rows, cols); renderAll(); }), preview: `preview-table-${rows}-${cols}` };
   });
   group('形状', [createGalleryDropdown(command('shape-picker', '形状', 'shape', () => undefined), shapeItems, 3)]);
   group('表格', [createGalleryDropdown(command('table-picker', '表格', 'table', () => undefined), tableItems, 4), button('插入表格', wrapAction(() => {
    const rows = Number.parseInt(globalThis.prompt?.('行数', '3') ?? '3', 10);
    const cols = Number.parseInt(globalThis.prompt?.('列数', '3') ?? '3', 10);
    if (Number.isFinite(rows) && Number.isFinite(cols)) controller.addTable(Math.max(1, Math.min(10, rows)), Math.max(1, Math.min(10, cols)));
    renderAll();
   }), 'tool-button', '插入表格', 'table')]);
  }
  if (ribbonTab === 'design') group('设计', [
   button('页面背景', wrapAction(() => backgroundInput.click()), 'tool-button', '页面背景', 'background'),
   button('背景图片', wrapAction(() => backgroundInput.click()), 'tool-button', '背景图片', 'image'),
  ]);
  if (ribbonTab === 'transition') {
   const transitionState = controller.queryTransition();
   const currentTransition = transitionState?.value;
   const transitionType = currentTransition?.type ?? 'fade';
   const transitionDirs: readonly string[] = transitionDirections(transitionType);
   const transitionDir = currentTransition?.dir ?? transitionDirs[0];
   const transitionTiming = (): { durationMs: number; dir?: string; advanceAfterMs?: number } => ({
    durationMs: currentTransition?.durationMs ?? 750,
    ...(transitionDir ? { dir: transitionDir } : {}),
    ...(currentTransition?.advanceAfterMs === undefined ? {} : { advanceAfterMs: currentTransition.advanceAfterMs }),
   });
   const transitionAdvance = input('自动换页毫秒', currentTransition?.advanceAfterMs === undefined ? '' : String(currentTransition.advanceAfterMs), value => {
    const advanceAfterMs = value.trim() === '' ? undefined : Number(value);
    if (advanceAfterMs === undefined || (Number.isFinite(advanceAfterMs) && advanceAfterMs >= 0)) {
     controller.setTransition({ type: transitionType, ...transitionTiming(), advanceAfterMs });
     renderAll(false);
    }
   }, 'number');
   transitionAdvance.placeholder = '手动换页';
   transitionAdvance.className = 'toolbar-select';
   const transitionDuration = input('切换时长毫秒', String(currentTransition?.durationMs ?? 750), value => {
    const durationMs = Number(value);
   if (Number.isFinite(durationMs) && durationMs >= 0) {
     controller.setTransition({ type: transitionType, ...transitionTiming(), durationMs });
     renderAll(false);
    }
   }, 'number');
   transitionDuration.className = 'toolbar-select';
   const transitionGallery = createGallery('transition-gallery', '常用切换', [
   { ...command('transition-none', '无', 'transition', () => { controller.setTransition(null); renderAll(false); }), preview: 'preview-none' },
   { ...command('transition-fade', '淡化', 'transition', () => { controller.setTransition({ type: 'fade' }); renderAll(false); }), preview: 'preview-fade' },
   { ...command('transition-push', '推进', 'transition', () => { controller.setTransition({ type: 'push', dir: 'r' }); renderAll(false); }), preview: 'preview-push' },
   { ...command('transition-wipe', '擦除', 'transition', () => { controller.setTransition({ type: 'wipe', dir: 'r' }); renderAll(false); }), preview: 'preview-wipe' },
   { ...command('transition-split', '分割', 'transition', () => { controller.setTransition({ type: 'split', dir: 'horz' }); renderAll(false); }), preview: 'preview-split' },
   { ...command('transition-zoom', '缩放', 'transition', () => { controller.setTransition({ type: 'zoom' }); renderAll(false); }), preview: 'preview-zoom' },
   ], 6);
   const directionLabel: Record<string, string> = { l: '向左', r: '向右', u: '向上', d: '向下', horz: '水平', vert: '垂直', in: '向内', out: '向外' };
   const transitionDirection = transitionDirs.length ? createDropdown(command('transition-direction', '方向', 'arrange', () => undefined), transitionDirs.map((dir: string) => ({
    ...command(`transition-dir:${dir}`, directionLabel[dir] ?? dir, 'arrange', () => {
     controller.setTransition({ type: transitionType, ...transitionTiming(), dir });
     renderAll(false);
    }),
    checked: dir === transitionDir,
   }))) : null;
   const applyAllTransitions = button('应用到全部页面', wrapAction(() => {
    const slides = currentSession()?.editor.doc.slideOrder ?? [];
    controller.setTransitionForSlides(slides, { type: transitionType, ...transitionTiming() });
    renderAll(false);
   }), 'tool-button', '应用到全部页面', 'duplicate');
   group('切换', [transitionGallery, ...(transitionDirection ? [transitionDirection] : []), transitionDuration, transitionAdvance, applyAllTransitions, button('预览切换', wrapAction(() => controller.previewTransition()), 'tool-button', '预览切换', 'preview')]);
  }
  if (ribbonTab === 'animation') {
   const animationGallery = createGallery('animation-gallery', '添加动画', [
    { ...command('animation-appear', '出现', 'animation', () => addAnimation('appear')), preview: 'preview-appear' },
    { ...command('animation-fade', '淡入', 'animation', () => addAnimation('fade')), preview: 'preview-fade' },
    { ...command('animation-fly', '飞入', 'animation', () => addAnimation('fly')), preview: 'preview-fly' },
    { ...command('animation-wipe', '擦除', 'animation', () => addAnimation('wipe')), preview: 'preview-wipe' },
    { ...command('animation-zoom', '缩放', 'animation', () => addAnimation('zoom')), preview: 'preview-zoom' },
    { ...command('animation-spin', '旋转', 'animation', () => addAnimation('spin', 'emphasis')), preview: 'preview-spin' },
   ], 6);
   const galleryLabel = document.createElement('span');
   galleryLabel.className = 'gallery-label';
   galleryLabel.textContent = '添加动画';
   animationGallery.prepend(galleryLabel);
   group('动画', [animationGallery, button('打开动画窗格', wrapAction(() => { inspectorTab = 'animation'; renderAll(); }), 'tool-button', '打开动画窗格', 'animation'), button('预览动画', wrapAction(() => { void controller.previewAnimations(); }), 'tool-button', '预览动画', 'preview')]);
  }
  if (ribbonTab === 'show') group('放映', [button('预览', wrapAction(() => togglePreview()), 'preview-button', '预览', 'preview'), button('试课', wrapAction(() => rehearse()), 'show-rehearse-button', '试课', 'rehearse'), button('发布冻结', wrapAction(() => publish()), 'show-publish-button', '发布冻结', 'publish')], 'show-toolbar-group');
  if (ribbonTab === 'view') group('视图', [
   button('选择窗格', wrapAction(() => { inspectorTab = 'object'; renderAll(); }), 'tool-button', '选择窗格', 'selection-pane'),
   button(controller.snapshot.snapping ? '关闭吸附' : '开启吸附', wrapAction(() => { controller.setSnapping(!controller.snapshot.snapping); renderAll(false); }), 'tool-button', '吸附', 'snapping'),
   button('适应窗口', wrapAction(() => { applyStageZoom(true); renderAll(false); }), 'tool-button', '适应窗口', 'fit'),
   button('备注', wrapAction(() => { notesExpanded = true; renderAll(false); notesEditor.focus(); }), 'tool-button', '备注', 'notes'),
   button('缩小', wrapAction(() => { changeStageZoom(-.1); }), 'tool-button', '缩小', 'zoom-out'),
   button('放大', wrapAction(() => { changeStageZoom(.1); }), 'tool-button', '放大', 'zoom-in'),
  ]);
  if (ribbonTab === 'image-format') group('图片格式', [
   button('替换图片', wrapAction(() => chooseImage('replace')), 'tool-button', '替换图片', 'replace-image'),
   button('裁剪', wrapAction(() => { controller.startImageCrop(); }), 'tool-button', '裁剪', 'crop'),
   button('恢复裁剪', wrapAction(() => { controller.clearImageCrop(); }), 'tool-button', '恢复裁剪', 'crop'),
   createDropdown(command('image-arrange', '排列', 'arrange', () => undefined), arrange),
  ]);
  if (ribbonTab === 'shape-format') group('形状格式', [
   button('形状填充', wrapAction(() => { const id = selectedId(); if (id) controller.setFill(id, solid(rgb('#5575B8'))); renderAll(); }), 'tool-button', '形状填充', 'background'),
   button('形状轮廓', wrapAction(() => { const id = selectedId(); if (id) controller.setStroke(id, { color: rgb('#24324B'), width: 1.5, dash: null, cap: 'butt', join: 'miter', compound: 'sng' }); renderAll(); }), 'tool-button', '形状轮廓', 'shape-outline'),
   createDropdown(command('shape-arrange', '排列', 'arrange', () => undefined), arrange),
  ]);
  if (ribbonTab === 'text-format') {
   const view = webPpt.snapshot.view;
   const textState = controller.queryRunProps();
   const textDisabled = !view || !textState;
   group('字体', [
    selectControl('字体', textState?.font.value ?? '', [['', '字体'], ['Aptos', 'Aptos'], ['Arial', 'Arial'], ['Calibri', 'Calibri'], ['Times New Roman', 'Times New Roman'], ['Microsoft YaHei', '微软雅黑']], value => { controller.setFont(value || null); renderAll(false); }),
    selectControl('字号', String(textState?.size.value ?? 18), [['12', '12'], ['14', '14'], ['16', '16'], ['18', '18'], ['20', '20'], ['24', '24'], ['28', '28'], ['32', '32'], ['40', '40'], ['48', '48']], value => { controller.setFontSize(Number(value)); renderAll(false); }),
    commandSurface!.createCommandButton({ id: 'text-bold', label: '加粗', icon: 'bold', checked: textState?.b.value === true, disabled: textDisabled, execute: () => { controller.toggleBold(); renderAll(false); } }, 'compact'),
    commandSurface!.createCommandButton({ id: 'text-italic', label: '斜体', icon: 'italic', checked: textState?.i.value === true, disabled: textDisabled, execute: () => { controller.toggleItalic(); renderAll(false); } }, 'compact'),
    commandSurface!.createCommandButton({ id: 'text-underline', label: '下划线', icon: 'underline', checked: textState?.u.value === true, disabled: textDisabled, execute: () => { controller.toggleUnderline(); renderAll(false); } }, 'compact'),
    commandSurface!.createCommandButton({ id: 'text-strike', label: '删除线', icon: 'strike', checked: textState?.strike.value === true, disabled: textDisabled, execute: () => { controller.setTextStyle(selectedRecord ? selectedRecord.id : '', { strike: textState?.strike.mixed || textState?.strike.value !== true }); renderAll(false); } }, 'compact'),
    createDropdown({ id: 'text-color', label: '文字颜色', icon: 'font', disabled: textDisabled, execute: () => undefined }, [
     ...[['墨色', '#24324B'], ['蓝色', '#5575B8'], ['珊瑚', '#C96B55'], ['灰金', '#897E70'], ['白色', '#FFFFFF']].map(([label, color]) => command(`text-color:${color}`, label, 'font', () => { controller.setTextColor(rgb(color)); renderAll(false); })),
     command('text-color-reset', '恢复来源颜色', 'font', () => { controller.setTextColor(null); renderAll(false); }),
    ]),
    commandSurface!.createCommandButton({ id: 'text-smaller', label: '减小字号', icon: 'zoom-out', disabled: textDisabled, execute: () => { controller.adjustFontSize(-2); renderAll(false); } }, 'compact'),
    commandSurface!.createCommandButton({ id: 'text-larger', label: '增大字号', icon: 'zoom-in', disabled: textDisabled, execute: () => { controller.adjustFontSize(2); renderAll(false); } }, 'compact'),
    commandSurface!.createCommandButton({ id: 'text-clear', label: '清除格式', icon: 'font', disabled: textDisabled, execute: () => { controller.clearTextFormat(); renderAll(false); } }, 'compact'),
   ]);
   const paraState = controller.queryParagraphProps();
   const bodyState = controller.queryBodyProps();
   group('段落', [
    commandSurface!.createCommandButton({ id: 'para-left', label: '左对齐', icon: 'align', checked: paraState?.align.value === 'left', disabled: textDisabled, execute: () => { controller.setParagraph({ align: 'left' }); renderAll(false); } }, 'compact'),
    commandSurface!.createCommandButton({ id: 'para-center', label: '居中', icon: 'align', checked: paraState?.align.value === 'center', disabled: textDisabled, execute: () => { controller.setParagraph({ align: 'center' }); renderAll(false); } }, 'compact'),
    commandSurface!.createCommandButton({ id: 'para-right', label: '右对齐', icon: 'align', checked: paraState?.align.value === 'right', disabled: textDisabled, execute: () => { controller.setParagraph({ align: 'right' }); renderAll(false); } }, 'compact'),
    // beta.2 exposes paragraph level/indent but not a bullet/numbering
    // command. Keep the surface honest until the upstream paragraph seam can
    // round-trip bullet and auto-number metadata.
    createDropdown({ id: 'para-spacing', label: '段落间距', icon: 'line-spacing', disabled: textDisabled, execute: () => undefined }, [
     command('para-spacing-tight', '紧凑 1.0', 'line-spacing', () => { controller.setParagraph({ lineHeight: 1 }); renderAll(false); }),
     command('para-spacing-normal', '标准 1.15', 'line-spacing', () => { controller.setParagraph({ lineHeight: 1.15 }); renderAll(false); }),
     command('para-spacing-loose', '宽松 1.5', 'line-spacing', () => { controller.setParagraph({ lineHeight: 1.5 }); renderAll(false); }),
    ]),
    commandSurface!.createCommandButton({ id: 'para-indent', label: '增加缩进', icon: 'indent', disabled: textDisabled, execute: () => { controller.setParagraph({ marginLeft: (paraState?.marginLeft.value ?? 0) + 18 }); renderAll(false); } }, 'compact'),
   ]);
   group('文本框', [
    createDropdown({ id: 'text-anchor', label: '垂直对齐', icon: 'text', checked: bodyState?.anchor === 'middle', disabled: textDisabled, execute: () => undefined }, [
     command('text-anchor-top', '顶部', 'text', () => { controller.setBodyProps({ anchor: 'top' }); renderAll(false); }),
     command('text-anchor-middle', '居中', 'text', () => { controller.setBodyProps({ anchor: 'middle' }); renderAll(false); }),
     command('text-anchor-bottom', '底部', 'text', () => { controller.setBodyProps({ anchor: 'bottom' }); renderAll(false); }),
    ]),
    createDropdown({ id: 'text-autofit', label: '自动调整', icon: 'text', disabled: textDisabled, execute: () => undefined }, [
     command('text-fit-none', '不自动调整', 'text', () => { controller.setBodyProps({ autoFit: 'none' }); renderAll(false); }),
     command('text-fit-shrink', '溢出时缩小文字', 'text', () => { controller.setBodyProps({ autoFit: 'normal' }); renderAll(false); }),
     command('text-fit-shape', '根据文字调整形状', 'text', () => { controller.setBodyProps({ autoFit: 'shape' }); renderAll(false); }),
    ]),
    createDropdown({ id: 'text-direction', label: '文字方向', icon: 'text', disabled: textDisabled, execute: () => undefined }, [
     command('text-horizontal', '横排', 'text', () => { controller.setBodyProps({ vert: 'horz' }); renderAll(false); }),
     command('text-vertical', '竖排', 'text', () => { controller.setBodyProps({ vert: 'vert' }); renderAll(false); }),
    ]),
    createDropdown({ id: 'text-insets', label: '文本边距', icon: 'text', disabled: textDisabled, execute: () => undefined }, [
     command('text-insets-normal', '标准边距', 'text', () => { controller.setBodyProps({ insets: [9, 9, 9, 9] }); renderAll(false); }),
     command('text-insets-none', '无边距', 'text', () => { controller.setBodyProps({ insets: [0, 0, 0, 0] }); renderAll(false); }),
    ]),
    commandSurface!.createCommandButton({ id: 'text-wrap', label: '自动换行', icon: 'text', checked: bodyState?.wrap === true, disabled: textDisabled, execute: () => { controller.setBodyProps({ wrap: bodyState?.wrap !== true }); renderAll(false); } }, 'compact'),
    selectControl('文本列数', String(bodyState?.columns ?? 1), [['1', '单列'], ['2', '两列'], ['3', '三列']], value => { controller.setBodyProps({ columns: Number(value) }); renderAll(false); }),
   ]);
  }
  if (ribbonTab === 'table-design') {
   const id = selectedId();
   const styles = id ? controller.listTableStyles().slice(0, 8) : [];
   const currentStyle = id ? controller.queryTableStyle(id)?.value?.styleId : null;
   const gallery = createGallery('table-design-gallery', '表格样式', styles.map((style: ReturnType<typeof controller.listTableStyles>[number]) => ({
    ...command(`table-style:${style.styleId}`, style.name, 'table', () => { controller.setTableStyle(id!, style.styleId); renderAll(false); }),
    checked: style.styleId === currentStyle,
    preview: `preview-table-style-${style.styleId.replace(/[^a-z0-9-]/gi, '')}`,
   })), 4);
   const reset = button('恢复默认样式', wrapAction(() => { if (id) controller.setTableStyle(id, null); renderAll(false); }), 'tool-button', '恢复默认表格样式', 'table');
   reset.disabled = !id;
   group('表格设计', [gallery, reset]);
  }
  if (ribbonTab === 'table-layout') group('表格布局', [
   button('插入行', wrapAction(() => { const id = selectedId(); if (id) controller.execute({ type: 'InsertRow', id }); renderAll(false); }), 'tool-button', '在末尾插入一行', 'table'),
  ]);
 };
 renderOfficeToolbar();
 return;
 }
    function renderInspector(): void { inspectorBody.replaceChildren();
 selectionPaneHost.hidden = inspectorTab !== 'object';
 const tabs = document.createElement('div');
 tabs.className = 'inspector-tabs';
 (['object', 'page', 'animation'] as const).forEach(tab => { tabs.append(button(tab === 'object' ? '对象' : tab === 'page' ? '页面' : '动画', () => { inspectorTab = tab;
 renderInspector();
 }, `inspector-tab${inspectorTab === tab ? ' active' : ''}`, tab === 'object' ? '对象' : tab === 'page' ? '页面' : '动画', tab === 'object' ? 'selection-pane' : tab === 'page' ? 'background' : 'animation'));
 });
 inspectorBody.append(tabs);
 if (inspectorTab === 'page') { renderPageInspector();
 return;
 } const slideId = currentSlide();
 const editor = currentSession()?.editor;
 if (!slideId || !editor) { inspectorBody.append(emptyInspector('打开一个课件开始编辑'));
 return;
 } if (inspectorTab === 'animation') { renderAnimationInspector(slideId);
 return;
 } const ids = selectedIds();
 if (!ids.length) { inspectorBody.append(emptyInspector('在画布或选择窗格中选择对象'));
 return;
 } const id = ids[0];
 if (ids.length > 1) {
  const heading = document.createElement('div');
  heading.className = 'inspector-heading';
  heading.textContent = `已选择 ${ids.length} 个对象`;
  const intro = document.createElement('p');
  intro.className = 'object-pane-intro';
  intro.textContent = '对齐、组合或置顶，批量调整会在一次撤销事务中完成。';
  inspectorBody.append(heading, intro);
  const multiSection = document.createElement('div');
  multiSection.className = 'inspector-section object-actions-section';
  const multiLabel = document.createElement('span');
  multiLabel.className = 'section-label';
  multiLabel.textContent = '批量操作';
  const multi = document.createElement('div');
  multi.className = 'layer-actions';
  multi.append(
   button('左对齐', wrapAction(() => { controller.align(ids, 'left'); renderAll(false); }), 'small-button', '左对齐', 'align'),
   button('水平居中', wrapAction(() => { controller.align(ids, 'center'); renderAll(false); }), 'small-button', '水平居中', 'align'),
   button('组合', wrapAction(() => { controller.group(ids); renderAll(false); }), 'small-button', '组合', 'group'),
   button('置顶', wrapAction(() => { controller.setLayerMany(ids, 'front'); renderAll(false); }), 'small-button', '置顶', 'arrange'),
  );
  multiSection.append(multiLabel, multi);
  inspectorBody.append(multiSection);
  return;
 }
 const record = controller.element(id);
 const element = editor.effectiveElement(id);
 if (!record || !element) { inspectorBody.append(emptyInspector('对象已失效'));
 return;
 } const objectHeading = document.createElement('div');
 objectHeading.className = 'object-pane-heading';
 const objectTitle = document.createElement('div');
 objectTitle.className = 'object-pane-title';
 const heading = document.createElement('h2');
 heading.className = 'inspector-heading';
 heading.textContent = objectDisplayName(id);
 objectTitle.append(heading);
 const objectMeta = document.createElement('span');
 objectMeta.className = 'object-pane-meta';
 objectMeta.textContent = `对象 ID · ${id.slice(-8)}`;
 objectHeading.append(objectTitle, objectMeta);
 const intro = document.createElement('p');
 intro.className = 'object-pane-intro';
 intro.textContent = '调整这个对象的位置、尺寸和显示方式。';
 inspectorBody.append(objectHeading, intro);
 const objectActions = document.createElement('div');
 objectActions.className = 'object-quick-actions';
 objectActions.append(
  button('复制对象', wrapAction(() => { controller.copy(); renderAll(false); }), 'small-button', '复制对象', 'copy'),
  button('删除对象', wrapAction(() => { controller.removeSelected(); renderAll(false); }), 'danger-button', '删除对象', 'delete'),
 );
 inspectorBody.append(objectActions);
 const transformSection = document.createElement('div');
 transformSection.className = 'inspector-section object-transform-section';
 const transformLabel = document.createElement('span');
 transformLabel.className = 'section-label';
 transformLabel.textContent = '位置与尺寸';
 const grid = document.createElement('div');
 grid.className = 'property-grid';
 for (const [label, key, value] of [['X', 'x', element.x], ['Y', 'y', element.y], ['宽', 'w', element.w], ['高', 'h', element.h], ['旋转', 'rot', element.rot]] as const) { const field = document.createElement('label');
 field.textContent = label;
 field.append(input(label, String(Math.round(value)), next => { const number = Number(next);
 if (Number.isFinite(number)) controller.setTransform(id, { [key]: number });
 renderAll(false);
 }, 'number'));
 grid.append(field);
 } transformSection.append(transformLabel, grid);
 inspectorBody.append(transformSection);
 if (record.src.kind === 'shape') inspectorBody.append(shapeStyleControls(id));
 if (record.src.kind === 'image') inspectorBody.append(imageStyleControls(id));
 if (record.src.kind === 'table') inspectorBody.append(tableStyleControls());
 if (record.src.kind !== 'table') inspectorBody.append(effectStyleControls(id));
 inspectorBody.append(linkControls(id));
 if (record.src.kind === 'shape' || record.src.kind === 'table') { const textSection = document.createElement('div');
 textSection.className = 'inspector-section object-text-section';
 const textLabel = document.createElement('span');
 textLabel.className = 'section-label';
 textLabel.textContent = '文字内容';
 const textArea = document.createElement('textarea');
 textArea.value = textOfEffective(element);
 textArea.placeholder = '输入对象文字';
 textArea.setAttribute('aria-label', '对象文字');
 textArea.addEventListener('change', () => { controller.editText(id, textArea.value);
 renderAll(false);
 });
 textSection.append(textLabel, textArea);
 const textTools = document.createElement('div');
 textTools.className = 'layer-actions';
 const bold = button('加粗', wrapAction(() => { controller.setTextStyle(id, { b: true }); renderAll(false); }), 'small-button', '加粗', 'font');
 const italic = button('斜体', wrapAction(() => { controller.setTextStyle(id, { i: true }); renderAll(false); }), 'small-button', '斜体', 'font');
 const underline = button('下划线', wrapAction(() => { controller.setTextStyle(id, { u: true }); renderAll(false); }), 'small-button', '下划线', 'font');
 textTools.append(bold, italic, underline);
 textSection.append(textTools);
 inspectorBody.append(textSection);
 } inspectorBody.append(layerControls(id));
 }
    function renderPageInspector(): void { const slideId = currentSlide();
 if (!slideId) { inspectorBody.append(emptyInspector('没有可编辑的页面'));
 return;
 } const pageHeading = document.createElement('div');
 pageHeading.className = 'page-pane-heading';
 const title = document.createElement('h2');
 title.textContent = `第 ${(currentSession()?.editor.doc.slideOrder.indexOf(slideId) ?? 0) + 1} 页`;
 const pageMeta = document.createElement('span');
 pageMeta.className = 'page-pane-meta';
 pageMeta.textContent = '页面设置';
 pageHeading.append(title, pageMeta);
 const intro = document.createElement('p');
 intro.className = 'page-pane-intro';
 intro.textContent = '调整当前页面的背景、备课备注和显示状态。';
 inspectorBody.append(pageHeading, intro);
 const colors: Array<[string, string]> = [['纸张', '#F6F3EC'], ['淡蓝', '#E3EAF7'], ['珊瑚', '#FFF8F6'], ['白色', '#FFFFFF']];
 const swatches = document.createElement('div');
 swatches.className = 'swatch-row';
 colors.forEach(([label, color]) => swatches.append(button(label, wrapAction(() => { controller.setSlideBackground(slideId, solid(rgb(color)));
 renderAll();
 }), 'swatch-button')));
 const backgroundSection = document.createElement('section');
 backgroundSection.className = 'inspector-section page-background-section';
 const backgroundLabel = document.createElement('span');
 backgroundLabel.className = 'section-label';
 backgroundLabel.textContent = '页面背景';
 const backgroundHint = document.createElement('p');
 backgroundHint.className = 'page-section-hint';
 backgroundHint.textContent = '快速套用主题色，或输入自定义颜色。';
 backgroundSection.append(backgroundLabel, backgroundHint, swatches);
 const customColor = input('自定义背景色', '#F6F3EC', value => { if (/^#[0-9a-f]{6}$/i.test(value)) { controller.setSlideBackground(slideId, solid(rgb(value))); renderAll(); } });
 customColor.className = 'background-hex';
 backgroundSection.append(labelBlock('自定义颜色', customColor));
 inspectorBody.append(backgroundSection);
 const notesSection = document.createElement('section');
 notesSection.className = 'inspector-section page-notes-section';
 const notesLabel = document.createElement('span');
 notesLabel.className = 'section-label';
 notesLabel.textContent = '教师备注';
 const notesHint = document.createElement('p');
 notesHint.className = 'page-section-hint';
 notesHint.textContent = '仅备课时可见，不会出现在大屏放映中。';
 const notes = document.createElement('textarea');
 notes.value = currentSession()?.editor.toSlide(slideId).notes ?? '';
 notes.placeholder = '记录讲解提示、提问或板书安排';
 notes.setAttribute('aria-label', '教师备注');
 notes.addEventListener('change', () => { controller.setNotes(slideId, notes.value);
 renderAll(false);
 });
 notesSection.append(notesLabel, notesHint, notes);
 inspectorBody.append(notesSection);
 const stateSection = document.createElement('section');
 stateSection.className = 'inspector-section page-state-section';
 const stateLabel = document.createElement('span');
 stateLabel.className = 'section-label';
 stateLabel.textContent = '页面状态';
 const stateHint = document.createElement('p');
 stateHint.className = 'page-section-hint';
 stateHint.textContent = '隐藏后不会出现在放映流程中。';
 stateSection.append(stateLabel, stateHint, button('隐藏页面', wrapAction(() => { controller.execute({ type: 'SetHidden', id: slideId, v: true });
 renderAll();
 }), 'small-button', '隐藏页面', 'hide'));
 inspectorBody.append(stateSection);
 }
    function renderAnimationInspector(slideId: SlideId): void {
 const animationState = webPpt.snapshot.view?.queryAnimations();
 const animations = (animationState?.value ?? []) as readonly { target: ElementId;
 effect?: string;
 kind: 'entrance' | 'exit' | 'emphasis' | 'motion';
 trigger: 'click' | 'withPrev' | 'afterPrev';
 delayMs?: number;
 durationMs?: number;
 dir?: string }[];
 const effectLabels: Record<string, string> = { appear: '出现', fade: '淡入', fly: '飞入', wipe: '擦除', zoom: '缩放', dissolve: '溶解', spin: '旋转', grow: '放大' };
 const kindLabels: Record<string, string> = { entrance: '进入', exit: '退出', emphasis: '强调', motion: '路径' };
 const triggerOptions: readonly [string, string][] = [['click', '单击时'], ['withPrev', '与上一动画同时'], ['afterPrev', '上一动画之后']];
 const selected = selectedIds();
 const readonlySource = Boolean(animationState?.sourceReadonly);
 const pageNumber = (currentSession()?.editor.doc.slideOrder.indexOf(slideId) ?? 0) + 1;
 const headingRow = document.createElement('div');
 headingRow.className = 'animation-pane-heading';
 const heading = document.createElement('h2');
 heading.className = 'inspector-heading';
 heading.textContent = `第 ${pageNumber} 页动画`;
 const count = document.createElement('span');
 count.className = 'animation-count';
 count.textContent = `${animations.length} 个步骤`;
 headingRow.append(heading, count);
 inspectorBody.append(headingRow);
 const intro = document.createElement('p');
 intro.className = 'animation-pane-intro';
 intro.textContent = animations.length ? '按列表顺序播放；调整排序可控制讲解节奏。' : '为对象添加进入或强调效果，让课堂讲解更有节奏。';
 inspectorBody.append(intro);
 if (readonlySource) {
  const readonlyNote = document.createElement('div');
  readonlyNote.className = 'animation-readonly-note';
  readonlyNote.textContent = '当前页面包含复杂原始动画。继续编辑将使用新的动画时间线替换原有动画。';
  inspectorBody.append(readonlyNote);
 }
 const updateStep = (index: number, patch: Record<string, unknown>): void => {
  if (readonlySource) { setStatus('来源动画只读，请先另存为副本', true); return; }
  const next = animations.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
  controller.setAnimations(slideId, next as readonly EditAnimationStep[]);
  renderAll(false);
 };
 const secondsField = (label: string, valueMs: number, onChange: (milliseconds: number) => void): HTMLElement => {
  const field = document.createElement('label');
  field.className = 'animation-field';
  const name = document.createElement('span');
  name.textContent = label;
  const shell = document.createElement('span');
  shell.className = 'animation-number-shell';
  const control = input(label, (Math.max(0, valueMs) / 1000).toFixed(2), value => {
   const seconds = Number(value);
   if (Number.isFinite(seconds) && seconds >= 0) onChange(Math.round(seconds * 1000));
  }, 'number');
  control.className = 'animation-number';
  control.min = '0';
  control.step = '0.05';
  const suffix = document.createElement('span');
  suffix.className = 'animation-unit';
  suffix.textContent = '秒';
  shell.append(control, suffix);
  field.append(name, shell);
  return field;
 };
 const effectOptionsFor = (kind: string, currentEffect: string): [string, string][] => {
  const options: [string, string][] = kind === 'emphasis'
   ? [['spin', '旋转'], ['grow', '放大']]
   : [['appear', '出现'], ['fade', '淡入'], ['fly', '飞入'], ['wipe', '擦除'], ['zoom', '缩放'], ['dissolve', '溶解']];
  if (currentEffect && !options.some(([value]) => value === currentEffect)) options.push([currentEffect, effectLabels[currentEffect] ?? currentEffect]);
  return options;
 };
 const directionOptionsFor = (effect: string): [string, string][] | null => {
  if (effect === 'zoom') return [['in', '放大进入'], ['out', '缩小退出']];
  if (effect === 'fly' || effect === 'wipe') return [['l', '向左'], ['r', '向右'], ['u', '向上'], ['d', '向下']];
  return null;
 };
 const list = document.createElement('div');
 list.className = 'animation-list';
 if (!animations.length) {
  const empty = document.createElement('div');
  empty.className = 'animation-empty';
  const emptyTitle = document.createElement('strong');
  emptyTitle.textContent = '还没有动画步骤';
  const emptyCopy = document.createElement('p');
  emptyCopy.textContent = selected.length ? '从上方动画库选择一个效果，或使用下方默认设置添加。' : '先选择一个对象，再从上方动画库添加效果。';
  empty.append(emptyTitle, emptyCopy);
  if (!selected.length) empty.append(button('先选择对象', () => { inspectorTab = 'object'; renderAll(); }, 'small-button', '先选择对象'));
  list.append(empty);
 }
 animations.forEach((step, index) => {
  const row = document.createElement('article');
  row.className = `animation-row animation-row-${step.kind}`;
  const rowHead = document.createElement('div');
  rowHead.className = 'animation-row-head';
  const order = document.createElement('span');
  order.className = 'animation-order';
  order.textContent = String(index + 1).padStart(2, '0');
  const targetName = objectDisplayName(step.target);
  const target = button(targetName, wrapAction(() => { controller.select({ kind: 'elements', ids: [step.target], enteredGroup: null }); renderAll(false); }), 'animation-target', `选择对象：${targetName}`);
  rowHead.append(order, target);
  const effectLine = document.createElement('div');
  effectLine.className = 'animation-effect-line';
  const kind = document.createElement('span');
  kind.className = 'animation-kind';
  kind.textContent = kindLabels[step.kind] ?? step.kind;
  const effectName = document.createElement('strong');
  effectName.textContent = effectLabels[step.effect ?? ''] ?? step.effect ?? '未知效果';
  effectLine.append(kind, effectName);
  const controls = document.createElement('div');
  controls.className = 'animation-controls';
  const effect = selectControl('效果', step.effect ?? 'fade', effectOptionsFor(step.kind, step.effect ?? ''), value => updateStep(index, { effect: value }));
  const trigger = selectControl('触发方式', step.trigger, triggerOptions, value => updateStep(index, { trigger: value as typeof step.trigger }));
  const duration = secondsField('时长', step.durationMs ?? animationDurationMs, milliseconds => updateStep(index, { durationMs: milliseconds }));
  const delay = secondsField('延迟', step.delayMs ?? 0, milliseconds => updateStep(index, { delayMs: milliseconds }));
  controls.append(labelBlock('效果', effect), labelBlock('触发方式', trigger), duration, delay);
  const directionOptions = directionOptionsFor(step.effect ?? '');
  if (directionOptions) controls.append(labelBlock('方向', selectControl('方向', step.dir ?? directionOptions[0][0], directionOptions, value => updateStep(index, { dir: value }))));
  const actions = document.createElement('div');
  actions.className = 'animation-row-actions';
  const up = button('上移', wrapAction(() => { if (index === 0 || readonlySource) return; const next = [...animations]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; controller.setAnimations(slideId, next as readonly EditAnimationStep[]); renderAll(false); }), 'small-button', '动画上移', 'arrange');
  const down = button('下移', wrapAction(() => { if (index >= animations.length - 1 || readonlySource) return; const next = [...animations]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; controller.setAnimations(slideId, next as readonly EditAnimationStep[]); renderAll(false); }), 'small-button', '动画下移', 'arrange');
  const remove = button('删除', wrapAction(() => { if (readonlySource) { setStatus('来源动画只读，请先另存为副本', true); return; } controller.setAnimations(slideId, animations.filter((_item, itemIndex) => itemIndex !== index) as readonly EditAnimationStep[]); renderAll(false); }), 'danger-button', '删除动画', 'delete');
  actions.append(up, down, remove);
  row.append(rowHead, effectLine, controls, actions);
  list.append(row);
 });
 const defaults = document.createElement('section');
 defaults.className = 'animation-defaults';
 const defaultsTitle = document.createElement('strong');
 defaultsTitle.textContent = '新动画默认设置';
 const defaultsGrid = document.createElement('div');
 defaultsGrid.className = 'animation-defaults-grid';
 const defaultTrigger = selectControl('默认触发方式', animationTrigger, triggerOptions, value => { animationTrigger = value as typeof animationTrigger; });
 const defaultDuration = secondsField('默认时长', animationDurationMs, milliseconds => { animationDurationMs = milliseconds; });
 defaultsGrid.append(labelBlock('触发方式', defaultTrigger), defaultDuration);
 defaults.append(defaultsTitle, defaultsGrid);
 const paneActions = document.createElement('div');
 paneActions.className = 'animation-pane-actions';
 const addButton = button('添加到选中对象', wrapAction(() => addAnimation()), 'primary-button', '添加到选中对象', 'animation');
 const clearButton = button('清除本页动画', wrapAction(() => { if (readonlySource) { setStatus('来源动画只读，请先另存为副本', true); return; } controller.setAnimations(slideId, []); renderAll(); }), 'danger-button', '清除本页动画', 'delete');
 paneActions.append(addButton, clearButton);
 inspectorBody.append(list, defaults, paneActions);
 }
    function addAnimation(effect: 'appear' | 'fade' | 'fly' | 'wipe' | 'zoom' | 'spin' = 'fade', kind: 'entrance' | 'emphasis' = 'entrance'): void { const slideId = currentSlide();
 const id = selectedIds()[0];
 if (!slideId || !id) { setStatus('先选择一个对象再添加动画', true);
 return;
 }
 const hasExistingAnimations = (webPpt.snapshot.view?.queryAnimations().value.length ?? 0) > 0;
 const trigger = hasExistingAnimations ? animationTrigger : 'click';
 const step = kind === 'emphasis'
  ? { target: id, kind: 'emphasis' as const, effect: (effect === 'spin' ? 'spin' : 'grow') as 'spin' | 'grow', trigger, delayMs: 0, durationMs: animationDurationMs }
  : { target: id, kind: 'entrance' as const, effect: effect === 'spin' ? 'fade' as const : effect, trigger, delayMs: 0, durationMs: animationDurationMs };
 controller.appendAnimations(slideId, [step]);
 inspectorTab = 'animation';
 renderAll();
 }
    function shapeStyleControls(id: ElementId): HTMLElement { const group = document.createElement('div');
 group.className = 'inspector-section';
 const label = document.createElement('span');
 label.className = 'section-label';
 label.textContent = '填充与描边';
 const swatches = document.createElement('div');
 swatches.className = 'swatch-row';
 [['蓝', '#5575B8'], ['珊瑚', '#C96B55'], ['灰金', '#897E70'], ['墨', '#24324B'], ['无', '']].forEach(([name, color]) => swatches.append(button(name, wrapAction(() => { controller.setFill(id, color ? solid(rgb(color)) : { type: 'none' });
 renderAll();
 }), 'swatch-button')));
 const strokes = document.createElement('div');
 strokes.className = 'swatch-row';
 strokes.append(button('描边', wrapAction(() => { controller.setStroke(id, { color: rgb('#24324B'), width: 1.5, dash: null, cap: 'butt', join: 'miter', compound: 'sng' }); renderAll(); }), 'swatch-button'), button('无描边', wrapAction(() => { controller.setStroke(id, { type: 'none' }); renderAll(); }), 'swatch-button'));
 group.append(label, swatches, strokes);
 return group;
 }
    function imageStyleControls(id: ElementId): HTMLElement { const group = document.createElement('div');
 group.className = 'inspector-section';
 const label = document.createElement('span');
 label.className = 'section-label';
 label.textContent = '图片格式';
 group.append(button('替换图片', wrapAction(() => chooseImage('replace')), 'small-button', '替换图片', 'replace-image'), button('裁剪', wrapAction(() => { controller.startImageCrop(id); }), 'small-button', '裁剪', 'crop'), button('恢复裁剪', wrapAction(() => controller.clearImageCrop()), 'small-button', '恢复裁剪', 'crop'));
 return group;
 }
    function effectStyleControls(id: ElementId): HTMLElement { const group = document.createElement('div');
 group.className = 'inspector-section';
 const label = document.createElement('span');
 label.className = 'section-label';
 label.textContent = '视觉效果';
 const state = controller.queryEffects([id]);
 const shadow = button('柔和阴影', wrapAction(() => { controller.setEffects(id, { ...state?.value, shadow: { dx: 3, dy: 4, blur: 8, color: 'rgba(36,50,75,.28)' } }); renderAll(false); }), 'small-button', '添加柔和阴影', 'effects');
 const glow = button('外发光', wrapAction(() => { controller.setEffects(id, { ...state?.value, glow: { radius: 6, color: 'rgba(83,117,184,.45)' } }); renderAll(false); }), 'small-button', '添加外发光', 'effects');
 const reset = button('清除效果', wrapAction(() => { controller.setEffects(id, null); renderAll(false); }), 'small-button', '恢复来源效果', 'delete');
 group.append(label, shadow, glow, reset);
 return group;
 }
    function linkControls(id: ElementId): HTMLElement { const group = document.createElement('div');
 group.className = 'inspector-section';
 const label = document.createElement('span');
 label.className = 'section-label';
 label.textContent = '交互链接';
 const state = controller.queryLink([id]);
 const href = state?.value?.kind === 'external' ? state.value.href : '';
 const link = input('超链接地址', href, value => {
  const next = value.trim();
  try {
   controller.setLink(id, next ? { kind: 'external', href: next } : { kind: 'none' });
   renderAll(false);
  } catch (error) { setStatus(error instanceof Error ? error.message : '链接地址无效', true); }
 }, 'url');
 link.placeholder = 'https://example.com';
 group.append(label, link, button('恢复来源链接', wrapAction(() => { controller.setLink(id, null); renderAll(false); }), 'small-button', '恢复来源链接', 'link'));
 return group;
 }
    function tableStyleControls(): HTMLElement { const group = document.createElement('div');
 group.className = 'inspector-section';
 const label = document.createElement('span');
 label.className = 'section-label';
 label.textContent = '表格样式';
 const note = document.createElement('p');
 note.className = 'page-section-hint';
 note.textContent = '表格样式使用 web-ppt 的表格样式命令；单元格底纹与边框细化将在 pinned beta.2 提供公开命令后接入。';
 group.append(label, note, button('打开表格设计', wrapAction(() => { ribbonTab = 'table-design'; renderRibbonTabs(); renderToolbar(); }), 'small-button', '打开表格设计', 'table'));
 return group;
 }
 function layerControls(id: ElementId): HTMLElement { const group = document.createElement('div');
 group.className = 'inspector-section layer-section';
 const label = document.createElement('span');
 label.className = 'section-label';
 label.textContent = '排列与显示';
 const actions = document.createElement('div');
 actions.className = 'layer-actions';
 actions.append(button('上移一层', wrapAction(() => { controller.setLayer(id, 'forward');
 renderAll();
 }), 'small-button', '上移一层', 'arrange'), button('下移一层', wrapAction(() => { controller.setLayer(id, 'backward');
 renderAll();
 }), 'small-button', '下移一层', 'arrange'), button('水平翻转', wrapAction(() => { controller.setFlip(id, true, undefined);
 renderAll();
 }), 'small-button', '水平翻转', 'rotate'), button('垂直翻转', wrapAction(() => { controller.setFlip(id, undefined, true);
 renderAll();
 }), 'small-button', '垂直翻转', 'rotate'));
 actions.append(button('锁定对象', wrapAction(() => { controller.setLocked(id, true); renderAll(false); }), 'small-button', '锁定对象', 'lock'), button('隐藏对象', wrapAction(() => { controller.setHidden(id, true); renderAll(false); }), 'small-button', '隐藏对象', 'hide'));
 group.append(label, actions);
 return group;
 }
    function labelBlock(label: string, child: HTMLElement): HTMLElement { const block = document.createElement('label');
 block.className = 'inspector-block';
 const name = document.createElement('span');
 name.textContent = label;
 block.append(name, child);
 return block;
 }
    function emptyInspector(message: string): HTMLElement { const note = document.createElement('p');
 note.className = 'empty-inspector';
 note.textContent = message;
 return note;
 }
 function kindLabel(record: ElementRecord | null, hasText = false): string { const kind = record?.src.kind;
 return kind === 'shape' ? (hasText ? '文本' : '图形') : kind === 'image' ? '图片' : kind === 'table' ? '表格' : kind === 'group' ? '组合' : '对象';
 }
 function objectDisplayName(id: ElementId): string {
  const record = controller.element(id);
  const element = currentSession()?.editor.effectiveElement(id);
  return kindLabel(record, element?.kind === 'shape' && element.text !== null);
 }
 function isTextElement(id: ElementId): boolean {
  const element = currentSession()?.editor.effectiveElement(id);
  return element?.kind === 'shape' && element.text !== null;
 }
 function renderFloatingToolbar(): void {
  floatingToolbar.replaceChildren();
  const ids = selectedIds();
  if (!ids.length) { floatingToolbar.hidden = true; return; }
  floatingToolbar.hidden = false;
  const textSelection = ids.length === 1 && isTextElement(ids[0]);
  if (textSelection) {
   const paragraphState = controller.queryParagraphProps();
   const runState = controller.queryRunProps();
   const textCommand = (id: string, label: string, icon: IconId, action: () => void, checked?: boolean): StudioMenuItem => ({
    id,
    label,
    icon,
    checked,
    execute: wrapAction(action),
   });
   const textMenuItems: StudioMenuItem[] = [
    textCommand('floating-text-left', '左对齐', 'align-left', () => { controller.setParagraphForElement(ids[0], { align: 'left' }); renderAll(false); }, paragraphState?.align.value === 'left'),
    textCommand('floating-text-center', '居中', 'align-center-horizontal', () => { controller.setParagraphForElement(ids[0], { align: 'center' }); renderAll(false); }, paragraphState?.align.value === 'center'),
    textCommand('floating-text-right', '右对齐', 'align-right', () => { controller.setParagraphForElement(ids[0], { align: 'right' }); renderAll(false); }, paragraphState?.align.value === 'right'),
    { id: 'floating-text-divider', label: '', separator: true, execute: () => undefined },
    textCommand('floating-text-bold', '加粗', 'bold', () => { controller.toggleBold(); renderAll(false); }, runState?.b.value === true),
    textCommand('floating-text-italic', '斜体', 'italic', () => { controller.toggleItalic(); renderAll(false); }, runState?.i.value === true),
    textCommand('floating-text-underline', '下划线', 'underline', () => { controller.toggleUnderline(); renderAll(false); }, runState?.u.value === true),
   ];
   const textSplit = createSplitButton({
    id: 'floating-text-center',
    label: '居中',
    icon: 'align-center-horizontal',
    tooltip: '文本居中',
    execute: wrapAction(() => { controller.setParagraphForElement(ids[0], { align: 'center' }); renderAll(false); }),
   }, textMenuItems);
   floatingToolbar.append(
    textSplit,
   );
  } else {
   floatingToolbar.append(button('左对齐', wrapAction(() => { controller.align(ids, 'left'); renderAll(false); }), 'small-button', '对象左对齐', 'align-left'));
  }
  floatingToolbar.append(
   button('复制', wrapAction(() => { controller.copy(); renderAll(false); }), 'small-button', '复制', 'copy'),
   button('删除', wrapAction(() => { controller.removeSelected(); renderAll(false); }), 'small-button', '删除', 'delete'),
   button('格式刷', wrapAction(() => { controller.startFormatPainter(); }), 'small-button', '格式刷', 'format-painter'),
  );
 }
 function renderAll(thumbnails = true): void { renderRibbonTabs(); renderScenePanel(thumbnails);
 renderToolbar();
 renderInspector();
 renderFloatingToolbar();
 const slideId = currentSlide();
 const documentMeta = currentSession()?.editor.doc.meta;
 editorHost.style.aspectRatio = documentMeta ? `${documentMeta.width} / ${documentMeta.height}` : '16 / 9';
 notesPane.classList.toggle('is-expanded', notesExpanded);
 notesToggle.textContent = notesExpanded ? '收起' : '展开';
 const activeNotes = currentSlide() ? controller.session?.editor.toSlide(currentSlide()!).notes ?? '' : '';
 if (document.activeElement !== notesEditor) notesEditor.value = activeNotes;
 const index = currentSession()?.editor.doc.slideOrder.indexOf(slideId ?? '') ?? 0;
 stageTitle.replaceChildren();
 const title = document.createElement('div');
 title.innerHTML = `<strong>${escapeText(asset?.title ?? '请打开课件')}</strong><span class="stage-meta">正在编辑 · web-ppt / OOXML</span>`;
 const meta = document.createElement('span');
 meta.className = 'format-note';
 meta.textContent = `${documentMeta ? `${(documentMeta.width / documentMeta.height).toFixed(2)}:1` : '16:9'} · 第 ${Math.max(0, index + 1)} / ${currentSession()?.editor.doc.slideOrder.length ?? 0} 页`;
 stageTitle.append(title, meta);
 stageFooter.textContent = `${controller.snapshot.status} · ${controller.snapshot.zoom.toFixed(2)}× · ${currentSession()?.editor.history.undoCount ?? 0} 个可撤销操作${published ? ` · 已发布 ${published.fingerprint.slice(0, 12)}` : ''}`;
 const pageNumber = (currentSession()?.editor.doc.slideOrder.indexOf(currentSlide() ?? '') ?? -1) + 1;
 statusBar.replaceChildren();
 const statusText = document.createElement('span');
 statusText.textContent = `${pageNumber} / ${currentSession()?.editor.doc.slideOrder.length ?? 0} 页 · ${controller.snapshot.snapping ? '吸附开启' : '吸附关闭'}`;
 const zoomLabel = document.createElement('span');
 zoomLabel.className = 'status-zoom-value';
 zoomLabel.textContent = `${Math.round(controller.snapshot.zoom * 100)}%`;
 const zoomSlider = document.createElement('input');
 zoomSlider.type = 'range'; zoomSlider.min = '10'; zoomSlider.max = '200'; zoomSlider.step = '5'; zoomSlider.value = String(Math.round(controller.snapshot.zoom * 100)); zoomSlider.setAttribute('aria-label', '缩放');
 const zoomControls = document.createElement('div');
 zoomControls.className = 'status-zoom-controls';
 const fitButton = commandSurface!.createCommandButton({
  id: 'status-fit-stage',
  label: '恢复默认舞台大小',
  icon: 'fit',
  tooltip: '适应窗口并恢复默认大小',
  disabled: !webPpt.snapshot.view,
  execute: () => { applyStageZoom(true); renderAll(false); },
 }, 'icon-only', 'status-fit-button');
 const syncFitButtonState = (zoom: number): void => {
  const atDefault = Math.abs(zoom - fitZoom) < .01;
  fitButton.classList.toggle('is-default', atDefault);
  fitButton.dataset.atDefault = String(atDefault);
 };
 syncFitButtonState(controller.snapshot.zoom);
 zoomSlider.addEventListener('input', () => {
  const nextZoom = Number(zoomSlider.value) / 100;
  const anchor = captureStageViewportAnchor();
  fitZoom = readStageFitZoom();
  stageZoomFactor = nextZoom / Math.max(.01, fitZoom);
  controller.setZoom(nextZoom);
  sizeStageViewport(nextZoom);
  layoutStageViewport(nextZoom, anchor);
  zoomLabel.textContent = `${zoomSlider.value}%`;
  syncFitButtonState(nextZoom);
 });
 zoomControls.append(zoomSlider, zoomLabel, fitButton);
 statusBar.append(statusText, zoomControls);
 if (!thumbnails) thumbnailGeneration += 1;
 }
    async function persist(): Promise<void> {
 if (!asset || (busy && !savePromise)) return;
 if (savePromise) return savePromise;
 savePromise = (async () => {
  busy = true;
  do {
   const generation = editGeneration;
   const sourceAsset: WebPptPresentationAsset = asset!;
   setStatus('正在保存');
   const bytes = await controller.save();
   const saved = await createWebPptAssetFromBytes(sourceAsset.title, bytes, sourceAsset.document.idPrefix);
   const next: WebPptPresentationAsset = { ...sourceAsset, source: saved.source, updatedAt: new Date().toISOString() };
   asset = next;
   thumbnailAsset = next;
   await persistWebPptDraft(next, serverProject?.presentationId);
   if (serverProject) savePendingSyncMetadata(next, serverProject);
   try {
    await syncServerDraft(next);
    serverSyncPending = false;
   clearPendingSyncMetadata(serverProject?.presentationId);
   } catch (error) {
    serverSyncPending = true;
    if (error instanceof Error && error.message === 'draft-conflict') { setStatus('需要重新加载服务器版本'); showConflictDialog(); }
    else setStatus('等待同步');
   }
   savedGeneration = generation;
   refreshAfterEditorChange();
   if (editGeneration > generation) setStatus('正在保存');
  } while (editGeneration > savedGeneration);
  if (!serverSyncPending) setStatus(`已保存 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
 })().finally(() => {
  busy = false;
  savePromise = null;
  if (editGeneration > savedGeneration) void persist();
 });
 return savePromise;
 }

 function scheduleThumbnailRefresh(): void {
  if (!asset || autosaveSuspended) return;
  if (thumbnailRefreshTimer) clearTimeout(thumbnailRefreshTimer);
  thumbnailRefreshTimer = setTimeout(() => {
   thumbnailRefreshTimer = null;
   const generation = editGeneration;
   void controller.save().then(async bytes => {
    const current = asset;
    if (!current) return;
    const next = await createWebPptAssetFromBytes(current.title, bytes, current.document.idPrefix);
    if (generation !== editGeneration) return;
    thumbnailAsset = next;
    void syncThumbnails();
   }).catch(() => { /* thumbnail refresh must not block editing */ });
 }, 120);
 }
 async function assetForPlayback(): Promise<{ asset: WebPptPresentationAsset; changed: boolean }> {
  if (!asset) throw new Error('presentation-asset-required');
  const title = titleInput.value.trim() || asset.title;
  // A clean imported deck already contains the authoritative original bytes.
  // Do not parse/save it through the editor merely to rehearse or publish.
  if (editGeneration === savedGeneration && !serverSyncPending && asset.source?.sha256)
   return { asset: { ...asset, title }, changed: false };
  const bytes = await controller.save();
  return { asset: await createWebPptAssetFromBytes(title, bytes, asset.document.idPrefix), changed: true };
 }
    async function rehearse(): Promise<void> { if (!asset || busy) return;
 busy = true;
 setStatus('正在准备试课版本');
 try { const prepared = await assetForPlayback();
 const saved = prepared.asset;
 if (prepared.changed) savedGeneration = editGeneration;
 const report = await buildWebPptCompatibilityReport(saved);
 if (report.status === 'blocked') throw new Error(`试课阻断：${report.issues.filter(issue => issue.severity === 'blocker').map(issue => issue.detail).join('、')}`);
 const validation = await engine.validate(saved);
 if (!validation.valid) throw new Error(`试课阻断：${validation.errors.join('、')}`);
 const runtimeIndex = await engine.buildRuntimeIndex(saved);
 if (prepared.changed || !serverProject) {
  await persistWebPptDraft(saved, serverProject?.presentationId);
  await syncServerDraft(saved);
 }
 const response = await serverJson(`/api/presentations/${encodeURIComponent(serverProject!.presentationId)}/rehearsal-session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
 const rehearsal = response.rehearsal;
 setStatus(`试课已准备 · ${runtimeIndex.scenes.length} 页 · session ${rehearsal.session.sessionId} · ${rehearsal.revision.expiresAt ? `有效至 ${new Date(rehearsal.revision.expiresAt).toLocaleString()}` : '临时版本'}`);
 asset = saved; thumbnailAsset = saved; renderAll(false);
 } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
 finally { busy = false; }
 }
    async function publish(): Promise<void> { if (!asset || busy) return;
 busy = true;
 setStatus('正在校验并冻结');
 try { const prepared = await assetForPlayback();
 const saved = prepared.asset;
 if (prepared.changed) savedGeneration = editGeneration;
 const report = await buildWebPptCompatibilityReport(saved);
 if (report.status === 'blocked') throw new Error(`发布阻断：${report.issues.filter(issue => issue.severity === 'blocker').map(issue => issue.detail).join('、')}`);
 if (report.status === 'warnings' && !window.confirm(`课件预检发现 ${report.issues.filter(issue => issue.severity === 'warning').length} 项风险，确认仍要发布吗？`)) throw new Error('已取消发布：请先检查兼容性风险');
 const validation = await engine.validate(saved);
 if (!validation.valid) throw new Error(`发布阻断：${validation.errors.join('、')}`);
 const runtimeIndex = await engine.buildRuntimeIndex(saved);
 if (prepared.changed || !serverProject) {
  await persistWebPptDraft(saved, serverProject?.presentationId);
  await syncServerDraft(saved);
 }
 const publishBody = JSON.stringify({
  engine: saved.engine,
  document: { ...saved.document, deckId: saved.deckId },
  runtimeIndex,
  acknowledgeWarnings: report.status === 'warnings',
 });
 const publishedResponse = await serverJson(`/api/presentations/${encodeURIComponent(serverProject!.presentationId)}/published`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: publishBody,
 });
 const publishedRevision = publishedResponse.revision;
 const record: PublishedPresentationRecord = { version: 1, deckId: saved.deckId, title: saved.title, fingerprint: publishedRevision.fingerprint, publishedAt: publishedRevision.createdAt, runtimeIndex, bytes: saved.source!.bytes };
 asset = saved;
 published = record;
 titleInput.value = saved.title;
 setStatus(`已冻结发布 · ${runtimeIndex.scenes.length} 页 · ${record.fingerprint.slice(0, 12)}`);
 renderAll(false);
 } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true);
 } finally { busy = false;
 } }
    async function openAsset(next: WebPptPresentationAsset): Promise<void> { busy = true;
 setStatus('正在打开课件');
 try { thumbnailGeneration += 1;
 for (const session of thumbnailSessions.values()) session.dispose();
 thumbnailSessions.clear();
 asset = next;
 thumbnailAsset = next;
 stageZoomFactor = 1;
 fitZoom = 1;
 editGeneration = 0;
 savedGeneration = 0;
 titleInput.value = next.title;
 published = null;
 await webPpt.applyBinding({ source: next.source!.bytes, openOptions: { idPrefix: next.document.idPrefix }, mode: 'edit', textMode: 'svg' });
 webPpt.attach(editorHost);
 webPpt.attachSelectionPane(selectionPaneHost);
 syncSelectionPaneIcons();
 webPpt.snapshot.view?.registerTextUi(toolbar);
 applyStageZoom(true);
 controller.attachEditorSubscription();
 renderAll();
 scheduleStageZoom();
 setStatus('已打开 · 编辑状态');
 } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true);
 } finally { busy = false;
 } }
 async function newDeck(): Promise<void> { if (!busy) {
  const title = titleInput.value.trim() || '未命名公开课';
  const created = await serverJson('/api/presentations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
  serverProject = { presentationId: created.presentation.presentationId, currentDraftRevision: created.presentation.currentDraftRevision };
  saveServerProjectMetadata(serverProject);
  await openAsset(await loadRemotePresentation(serverProject.presentationId));
 } }
 async function openFile(file: File): Promise<void> { if (!busy) { serverProject = null; clearServerProjectMetadata(); await openAsset(await createWebPptAssetFromBytes(file.name.replace(/\.pptx?$/i, '') || '本地公开课', new Uint8Array(await file.arrayBuffer()))); }
 }
    async function togglePreview(): Promise<void> { if (!asset || busy) return;
 if (preview) { preview.session.dispose();
 preview.root.remove();
 preview = null;
 renderAll(false);
 return;
 } const overlay = document.createElement('div');
 overlay.className = 'preview-overlay';
 const canvas = document.createElement('div');
 canvas.className = 'preview-canvas web-ppt-preview';
 overlay.append(canvas);
 app.append(overlay);
 const previewBytes = await controller.save();
 const previewAsset = await createWebPptAssetFromBytes(asset.title, previewBytes, asset.document.idPrefix);
 const session = await engine.mountPlayer(canvas, previewAsset, { context: { sessionId: 'local-preview', surface: 'teacher-runtime' } });
 preview = { root: overlay, session };
 const controls = document.createElement('div');
 controls.className = 'preview-controls';
 controls.append(button('上一页', () => { preview?.session.previous?.();
 }, 'preview-nav'), button('下一动画', () => { preview?.session.nextStep?.();
 }, 'preview-nav'), button('完成当前页', () => { preview?.session.finishCurrentSlideAnimations?.();
 }, 'preview-nav'), button('退出预览', () => { void togglePreview();
 }, 'preview-exit'));
 overlay.append(controls);
 }
    const fileInput = document.createElement('input');
 fileInput.type = 'file';
 fileInput.accept = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
 fileInput.hidden = true;
 fileInput.addEventListener('change', () => { const file = fileInput.files?.[0];
 if (file) void openFile(file);
 fileInput.value = '';
 });
 const imageInput = document.createElement('input');
 imageInput.type = 'file';
 imageInput.accept = 'image/png,image/jpeg,image/gif,image/webp';
 imageInput.hidden = true;
 function chooseImage(mode: 'insert' | 'replace'): void { imageInputMode = mode; imageInput.click(); }
 imageInput.addEventListener('change', () => { const file = imageInput.files?.[0];
 if (file) void (async () => { try { const id = imageInputMode === 'replace' ? await controller.replaceImage(file) : await controller.addImage(file);
 controller.select({ kind: 'elements', ids: [id], enteredGroup: null });
 renderAll();
 } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true);
 } })();
 imageInput.value = '';
 });
 const backgroundInput = document.createElement('input');
 backgroundInput.type = 'file';
 backgroundInput.accept = 'image/png,image/jpeg,image/gif,image/webp';
 backgroundInput.hidden = true;
 backgroundInput.addEventListener('change', () => { const file = backgroundInput.files?.[0];
 if (file) void (async () => { try { await controller.setBackgroundImage(file);
 renderAll();
 } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true);
 } })();
 backgroundInput.value = '';
 });
 headerActions.append(button('新建', wrapAction(() => newDeck()), 'small-button', '新建', 'new-slide'), button('打开 PPTX', wrapAction(() => fileInput.click()), 'small-button', '打开 PPTX', 'image'), button('预览', wrapAction(() => togglePreview()), 'preview-button', '预览', 'preview'), fileInput, imageInput, backgroundInput);
 titleInput.addEventListener('change', () => { if (asset) asset = { ...asset, title: titleInput.value.trim() || '未命名公开课' };
 editGeneration += 1;
 scheduleAutosave();
 renderAll(false);
 });
 function scheduleAutosave(): void {
  if (autosaveSuspended || !asset) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  setStatus('正在保存');
  autosaveTimer = setTimeout(() => { autosaveTimer = null; void persist(); }, 1500);
 }
 const nativeTextInputActive = (): boolean => {
  const active = document.activeElement as HTMLElement | null;
  return canvasTextCommitPending
   || active?.closest('.studio-canvas-text-input') === canvasTextInput?.element
   || active?.isContentEditable === true && active.closest('.web-ppt-stage') === editorHost;
 };
 const refreshAfterEditorChange = (): void => {
  // web-ppt owns the native contenteditable during text input. Rebuilding the
  // Studio chrome in the same turn can race IME composition and make the
  // browser drop its active input target. The editor view already updates the
  // canvas and text layer; refresh the outer UI after focus leaves editing.
  if (!nativeTextInputActive()) renderAll(false);
 };
 webPpt.subscribe(() => { editGeneration += 1; refreshAfterEditorChange(); scheduleThumbnailRefresh(); scheduleAutosave(); });
 controller.subscribe(() => { editGeneration += 1; refreshAfterEditorChange(); scheduleThumbnailRefresh(); scheduleAutosave(); });
 window.addEventListener('keydown', event => { const modifier = event.metaKey || event.ctrlKey;
 if (modifier && event.key.toLowerCase() === 's') { event.preventDefault();
 void persist();
 } if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault();
 event.shiftKey ? controller.redo() : controller.undo();
 renderAll();
 } if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); controller.redo(); renderAll();
 } if (modifier && event.key.toLowerCase() === 'x' && !isTypingTarget(event.target)) { event.preventDefault(); controller.cut(); renderAll();
 } if (modifier && event.key.toLowerCase() === 'c' && !isTypingTarget(event.target)) { event.preventDefault();
 controller.copy();
 } if (modifier && event.key.toLowerCase() === 'v' && !isTypingTarget(event.target)) { event.preventDefault();
 controller.paste();
 renderAll();
 } if (modifier && event.key.toLowerCase() === 'd' && !isTypingTarget(event.target)) { event.preventDefault(); if (controller.copy()) controller.paste(); renderAll();
 } if (modifier && event.key.toLowerCase() === 'g' && !isTypingTarget(event.target)) { event.preventDefault(); if (event.shiftKey) { const id = controller.selectedIds()[0]; if (id) controller.ungroup(id); } else controller.group(controller.selectedIds()); renderAll();
 } if (modifier && event.key.toLowerCase() === 'f' && !isTypingTarget(event.target)) { event.preventDefault(); controller.openTextSearch({ mode: 'find' });
 } if (modifier && event.key.toLowerCase() === 'h' && !isTypingTarget(event.target)) { event.preventDefault(); controller.openTextSearch({ mode: 'replace' });
 } if (event.key === 'Escape') { controller.cancelFormatPainter(); controller.closeTextSearch();
 } if ((event.key === 'Delete' || event.key === 'Backspace') && !isTypingTarget(event.target)) { controller.removeSelected();
 renderAll();
 } });
 renderAll();
 void (async () => {
  const remoteId = new URLSearchParams(window.location.search).get('presentationId');
  let draft: WebPptPresentationAsset | null = null;
  try {
   const pending = loadPendingSyncMetadata(remoteId ?? undefined);
   if (remoteId && pending?.presentationId === remoteId) {
    draft = await loadWebPptDraft(pending.presentationId);
    if (draft) { serverProject = { presentationId: pending.presentationId, currentDraftRevision: pending.baseDraftRevision }; saveServerProjectMetadata(serverProject); }
   }
   if (!draft) draft = remoteId ? await loadRemotePresentation(remoteId) : await loadWebPptDraft();
  }
  catch { if (remoteId) { serverProject = null; clearServerProjectMetadata(); setStatus('课件加载失败，请检查课件服务', true); } }
  await openAsset(draft ?? await engine.createBlank('未命名公开课'));
  autosaveSuspended = false;
  if (loadPendingSyncMetadata(remoteId ?? undefined)?.presentationId === remoteId) { serverSyncPending = true; setStatus('等待同步'); }
  window.addEventListener('online', () => { if (serverSyncPending) void persist(); });
 })();
}
function isTypingTarget(target: EventTarget | null): boolean { const element = target as HTMLElement | null;
 return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.isContentEditable === true;
 }
