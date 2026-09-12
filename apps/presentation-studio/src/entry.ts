import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
import type { PresentationEngineAdapter } from '@classroom/presentation';
import type { ElementId, ElementRecord, SlideId } from '@web-ppt/edit-core';
import type { VectorFill } from '@web-ppt/edit-core';
import {
    createWebPptAdapter,
    WebPptPresentationEngineAdapter,
    createWebPptAssetFromBytes,
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
                { id: 'element-subtitle', kind: 'text', x: 76, y: 156, width: 620, height: 42, zIndex: 2, text: '副标题', color: '#6c7483' },
                { id: 'element-shape', kind: 'shape', shape: 'circle', x: 618, y: 268, width: 160, height: 160, zIndex: 3, color: '#e6a23c' },
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
const DRAFT_META_KEY = 'classcore.presentation.draft.meta.v1';
const PUBLISHED_META_KEY = 'classcore.presentation.published.meta.v1';
const SERVER_META_KEY = 'classcore.presentation.server.meta.v1';
const PENDING_SYNC_META_KEY = 'classcore.presentation.pending-sync.meta.v1';

function openDraftDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DRAFT_DB, 2);
 request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DRAFT_STORE)) request.result.createObjectStore(DRAFT_STORE, { keyPath: 'deckId' });
 if (!request.result.objectStoreNames.contains(PUBLISHED_STORE)) request.result.createObjectStore(PUBLISHED_STORE, { keyPath: 'deckId' });
 };
 request.onsuccess = () => resolve(request.result);
 request.onerror = () => reject(request.error ?? new Error('presentation-draft-db-open-failed'));
 });
 }
interface StoredDraftMetadata { presentationSchemaVersion: 1;
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
function loadServerProjectMetadata(): ServerProjectMetadata | null {
 try { return JSON.parse(localStorage.getItem(SERVER_META_KEY) ?? 'null') as ServerProjectMetadata | null; } catch { return null; }
}
function saveServerProjectMetadata(value: ServerProjectMetadata): void { localStorage.setItem(SERVER_META_KEY, JSON.stringify(value)); }
function clearServerProjectMetadata(): void { localStorage.removeItem(SERVER_META_KEY); }
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
async function persistWebPptDraft(asset: WebPptPresentationAsset): Promise<void> { if (!asset.source) throw new Error('presentation-source-required-for-save');
 const metadata: StoredDraftMetadata = { presentationSchemaVersion: 1, deckId: asset.deckId, title: asset.title, engine: asset.engine, document: asset.document, classroomBindings: asset.classroomBindings, createdAt: asset.createdAt, updatedAt: asset.updatedAt, source: { kind: 'bytes', mimeType: asset.source.mimeType, sha256: asset.source.sha256 } };
 localStorage.setItem(DRAFT_META_KEY, JSON.stringify(metadata));
 const db = await openDraftDb();
 await new Promise<void>((resolve, reject) => { const request = db.transaction(DRAFT_STORE, 'readwrite').objectStore(DRAFT_STORE).put({ deckId: asset.deckId, bytes: asset.source!.bytes });
 request.onsuccess = () => resolve();
 request.onerror = () => reject(request.error ?? new Error('presentation-draft-save-failed'));
 });
 db.close();
 }
async function loadWebPptDraft(): Promise<WebPptPresentationAsset | null> { try { const metadata = JSON.parse(localStorage.getItem(DRAFT_META_KEY) ?? 'null') as StoredDraftMetadata | null;
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
async function persistPublished(record: PublishedPresentationRecord): Promise<void> { localStorage.setItem(PUBLISHED_META_KEY, JSON.stringify({ deckId: record.deckId, title: record.title, fingerprint: record.fingerprint, publishedAt: record.publishedAt, runtimeIndex: record.runtimeIndex }));
 const db = await openDraftDb();
 await new Promise<void>((resolve, reject) => { const request = db.transaction(PUBLISHED_STORE, 'readwrite').objectStore(PUBLISHED_STORE).put(record);
 request.onsuccess = () => resolve();
 request.onerror = () => reject(request.error ?? new Error('presentation-published-save-failed'));
 });
 db.close();
 }

const ICON_BY_LABEL: Array<[string, IconId]> = [
 ['保存', 'save'], ['撤销', 'undo'], ['重做', 'redo'], ['复制', 'copy'], ['粘贴', 'paste'], ['剪切', 'cut'], ['删除', 'delete'],
 ['新页面', 'new-slide'], ['文字', 'text'], ['图形', 'shape'], ['表格', 'table'], ['图片', 'image'], ['页面背景', 'background'],
 ['排列', 'arrange'], ['左对齐', 'align'], ['水平居中', 'align'], ['等距分布', 'distribute'], ['置顶', 'arrange'], ['置底', 'arrange'],
 ['缩小', 'zoom-out'], ['放大', 'zoom-in'], ['适应窗口', 'fit'], ['开启吸附', 'snapping'], ['关闭吸附', 'snapping'], ['吸附', 'snapping'], ['淡化', 'transition'], ['无', 'transition'],
 ['预览切换', 'preview'], ['预览', 'preview'], ['动画', 'animation'], ['下一动画', 'animation'], ['查找', 'search'], ['替换', 'replace'], ['替代文字', 'alt-text'], ['试课', 'rehearse'], ['发布冻结', 'publish'],
 ['对象', 'selection-pane'], ['选择窗格', 'selection-pane'], ['页面', 'background'], ['备注', 'notes'], ['格式刷', 'format-painter'], ['加粗', 'font'], ['斜体', 'font'], ['下划线', 'font'],
 ['上移一层', 'arrange'], ['下移一层', 'arrange'], ['水平翻转', 'rotate'], ['垂直翻转', 'rotate'], ['隐藏此页', 'hide'],
];
function iconForLabel(label: string): IconId | undefined { return ICON_BY_LABEL.find(([name]) => label.startsWith(name))?.[1]; }
function button(label: string, action: () => void | Promise<void>, className = '', title = label): HTMLButtonElement {
 return commandSurface!.createCommandButton({ id: `legacy:${label}`, label, icon: iconForLabel(label), tooltip: title, execute: action }, 'compact', className) as HTMLButtonElement;
 }
function input(label: string, value: string, onChange: (value: string) => void, type = 'text'): HTMLInputElement { const control = document.createElement('input');
 control.type = type;
 control.value = value;
 control.setAttribute('aria-label', label);
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
function textOf(record: ElementRecord | null): string { const paragraphs = (record?.src as { text?: { paragraphs?: Array<{ runs?: Array<{ text?: string }> }> } } | undefined)?.text?.paragraphs ?? [];
 return paragraphs.map(paragraph => (paragraph.runs ?? []).map(run => run.text ?? '').join('')).join('\n');
 }
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

async function mountPresentationStudioAsync(root: HTMLElement): Promise<void> {
 commandSurface = await import('./command-surface.js');
 const { createCommandButton, createDropdown, createGallery, createSplitButton } = commandSurface;
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
 let serverSyncPending = false;
 let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
 let thumbnailRefreshTimer: ReturnType<typeof setTimeout> | null = null;
 let savePromise: Promise<void> | null = null;
 let editGeneration = 0;
 let savedGeneration = 0;
 let autosaveSuspended = true;
 let inspectorTab: 'object' | 'page' | 'animation' = 'object';
 let ribbonTab = 'start';
 let thumbnailGeneration = 0;
 let thumbnailAsset: WebPptPresentationAsset | null = null;
 let conflictOpen = false;
 let imageInputMode: 'insert' | 'replace' = 'insert';
 let fitZoom = 1;
 let stageZoomFactor = 1;
    const thumbnailSessions = new Map<string, Awaited<ReturnType<typeof engine.mountPlayer>>>();
    root.replaceChildren();
 const app = document.createElement('div');
 app.className = 'studio-app';
 root.append(app);
    const header = document.createElement('header');
 header.className = 'studio-header';
 const brand = document.createElement('div');
 brand.className = 'studio-brand';
 brand.innerHTML = '<span class="brand-square">C</span><div><span class="eyebrow">Authoring Studio · web-ppt</span><h1>课堂课件工作台</h1></div>';
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
 const editorHost = document.createElement('div');
 editorHost.className = 'studio-stage web-ppt-stage';
 const stageFooter = document.createElement('div');
 stageFooter.className = 'stage-footer';
 stagePanel.append(stageTitle, editorHost, stageFooter);
 const stageResizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { applyStageZoom(); });
 stageResizeObserver?.observe(editorHost);
    function currentSession() { return controller.session;
 } function currentSlide(): SlideId | null { return controller.slideId ?? currentSession()?.editor.doc.slideOrder[0] ?? null;
 } function selectedIds() { return controller.selectedIds();
 } function setStatus(message: string, error = false): void { saveState.textContent = message;
 saveState.className = `save-state${error ? ' status-error' : ''}`;
 }
 function readStageFitZoom(): number {
  const meta = currentSession()?.editor.doc.meta;
  return meta ? computeStageFitZoom(editorHost.clientWidth, editorHost.clientHeight, meta.width, meta.height) : 1;
 }
 function applyStageZoom(resetFactor = false): void {
  if (resetFactor) stageZoomFactor = 1;
  fitZoom = readStageFitZoom();
  const nextZoom = Math.min(2, Math.max(.1, fitZoom * stageZoomFactor));
  if (!webPpt.snapshot.view || Math.abs(webPpt.snapshot.zoom - nextZoom) < .001) return;
  controller.setZoom(nextZoom);
  renderAll(false);
 }
 function changeStageZoom(delta: number): void {
  fitZoom = readStageFitZoom();
  stageZoomFactor = Math.max(.25, Math.min(4, stageZoomFactor + delta));
  applyStageZoom();
 }
 function renderRibbonTabs(): void {
  ribbonTabs.replaceChildren();
  const tabs: Array<[string, string]> = [['file', '文件'], ['start', '开始'], ['insert', '插入'], ['design', '设计'], ['transition', '切换'], ['animation', '动画'], ['show', '幻灯片放映'], ['review', '审阅'], ['view', '视图']];
  const selected = selectedIds()[0];
  const selectedRecord = selected ? controller.element(selected) : null;
  if (selectedRecord?.src.kind === 'image') tabs.push(['image-format', '图片格式']);
  if (selectedRecord?.src.kind === 'shape') tabs.push(['shape-format', '形状格式']);
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
  }, 'card-secondary');
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
  }, 'primary-button');
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
 const active = currentSlide();
 scenePanel.replaceChildren();
 const heading = document.createElement('div');
 heading.className = 'panel-heading';
 heading.innerHTML = `<span>页面</span><span class="count-pill">${slides.length}</span>`;
 scenePanel.append(heading, sceneList);
 sceneList.replaceChildren();
 slides.forEach((slideId: SlideId, index: number) => { const item = document.createElement('button');
 item.type = 'button';
 item.className = `scene-thumb${slideId === active ? ' active' : ''}`;
 item.setAttribute('aria-label', `第 ${index + 1} 页`);
 item.addEventListener('click', () => { webPpt.setView({ slideId, mode: 'edit' });
 renderAll();
 });
 const number = document.createElement('span');
 number.className = 'scene-number';
 number.textContent = String(index + 1).padStart(2, '0');
 const thumb = document.createElement('span');
 thumb.className = 'scene-mini-canvas';
 thumb.dataset.thumbnailHost = slideId;
 item.append(number, thumb);
 sceneList.append(item);
 });
 const actions = document.createElement('div');
 actions.className = 'scene-actions';
 actions.append(button('+ 新页面', wrapAction(() => { const id = controller.addSlide();
 if (id) webPpt.setView({ slideId: id, mode: 'edit' });
 renderAll();
 }), 'primary-button'), button('复制', wrapAction(() => { const id = currentSlide();
 if (!id) return;
 const copy = controller.duplicateSlide(id);
 if (copy) webPpt.setView({ slideId: copy, mode: 'edit' });
 renderAll();
 }), 'small-button'));
 const reorder = document.createElement('div');
 reorder.className = 'scene-reorder';
 reorder.append(button('上移', wrapAction(() => { const id = currentSlide();
 if (id) controller.moveSlide(id, -1);
 renderAll();
 }), 'small-button'), button('下移', wrapAction(() => { const id = currentSlide();
 if (id) controller.moveSlide(id, 1);
 renderAll();
 }), 'small-button'), button('删除页', wrapAction(() => { const id = currentSlide();
 if (id) controller.removeSlide(id);
 renderAll();
 }), 'danger-button'));
 scenePanel.append(actions, reorder);
 if (updateThumbnails) void syncThumbnails();
 }
    function renderToolbar(): void { toolbar.replaceChildren();
 const renderOfficeToolbar = (): void => {
  const group = (_label: string, controls: HTMLElement[], extraClass = ''): void => { const section = document.createElement('div'); section.className = `toolbar-group${extraClass ? ` ${extraClass}` : ''}`; section.append(...controls); toolbar.append(section); };
  const command = (id: string, label: string, icon: IconId, execute: () => void | Promise<void>, shortcut?: string, disabled = false): StudioCommand => ({ id, label, icon, shortcut, disabled, execute: wrapAction(execute) });
  const arrange: StudioMenuItem[] = [
   command('layer-front', '置于顶层', 'arrange', () => { controller.setLayerMany(selectedIds(), 'front'); renderAll(); }),
   command('layer-forward', '上移一层', 'arrange', () => { selectedIds().forEach(id => controller.setLayer(id, 'forward')); renderAll(); }),
   command('layer-backward', '下移一层', 'arrange', () => { selectedIds().forEach(id => controller.setLayer(id, 'backward')); renderAll(); }),
   command('layer-back', '置于底层', 'arrange', () => { controller.setLayerMany(selectedIds(), 'back'); renderAll(); }),
   { ...command('align', '对齐', 'align', () => undefined), submenu: [
    command('align-left', '左对齐', 'align', () => { controller.align(selectedIds(), 'left'); renderAll(); }),
    command('align-center', '水平居中', 'align', () => { controller.align(selectedIds(), 'center'); renderAll(); }),
    command('align-right', '右对齐', 'align', () => { controller.align(selectedIds(), 'right'); renderAll(); }),
    command('align-top', '顶端对齐', 'align', () => { controller.align(selectedIds(), 'top'); renderAll(); }),
    command('align-middle', '垂直居中', 'align', () => { controller.align(selectedIds(), 'middle'); renderAll(); }),
    command('align-bottom', '底端对齐', 'align', () => { controller.align(selectedIds(), 'bottom'); renderAll(); }),
   ] },
   { ...command('distribute', '分布', 'distribute', () => undefined), submenu: [
    command('distribute-horizontal', '水平分布', 'distribute', () => { controller.distributeHorizontal(selectedIds()); renderAll(); }, undefined, selectedIds().length < 3),
    command('distribute-vertical', '垂直分布', 'distribute', () => { controller.distributeVertical(selectedIds()); renderAll(); }, undefined, selectedIds().length < 3),
   ] },
   { ...command('rotate', '旋转', 'rotate', () => undefined), submenu: [
    command('rotate-right', '向右旋转 90°', 'rotate', () => { selectedIds().forEach(id => controller.rotate(id, 90)); renderAll(); }),
    command('rotate-left', '向左旋转 90°', 'rotate', () => { selectedIds().forEach(id => controller.rotate(id, -90)); renderAll(); }),
    command('flip-h', '水平翻转', 'rotate', () => { selectedIds().forEach(id => controller.setFlip(id, true)); renderAll(); }),
    command('flip-v', '垂直翻转', 'rotate', () => { selectedIds().forEach(id => controller.setFlip(id, undefined, true)); renderAll(); }),
   ] },
   command('selection-pane', '选择窗格', 'selection-pane', () => { inspectorTab = 'object'; renderAll(); }),
  ];
  const addNewSlide = (): void => { const id = controller.addSlide(); if (id) webPpt.setView({ slideId: id, mode: 'edit' }); renderAll(); };
  const addShape = (preset: string): void => { controller.addShape(preset); renderAll(); };
  if (ribbonTab === 'file') group('文件', [createDropdown(command('file', '文件', 'save', () => undefined), [
   command('new', '新建', 'new-slide', () => newDeck()),
   command('open', '打开 PPTX', 'image', () => fileInput.click()),
   command('save', '保存', 'save', () => persist(), '⌘/Ctrl+S'),
   command('rehearse', '试课', 'rehearse', () => rehearse()),
   command('publish', '发布课堂版本', 'publish', () => publish()),
  ])]);
  if (ribbonTab === 'start') {
   group('剪贴板', [
    createSplitButton(command('paste', '粘贴', 'paste', () => { controller.paste(); renderAll(); }, '⌘/Ctrl+V'), [command('paste-text', '仅保留文本', 'paste', () => { controller.paste(); renderAll(); })]),
    button('剪切', wrapAction(() => { controller.cut(); }), 'tool-button'),
    button('复制', wrapAction(() => { controller.copy(); }), 'tool-button'),
    button('格式刷', wrapAction(() => { controller.startFormatPainter(); }), 'tool-button'),
   ]);
   group('幻灯片', [
    createSplitButton(command('new-slide', '新建幻灯片', 'new-slide', addNewSlide), [
     command('layout-title', '标题幻灯片', 'new-slide', addNewSlide),
     command('layout-content', '标题和内容', 'new-slide', addNewSlide),
     command('layout-blank', '空白', 'new-slide', addNewSlide),
    ]),
    button('复制', wrapAction(() => { const id = currentSlide(); if (id) { const copy = controller.duplicateSlide(id); if (copy) webPpt.setView({ slideId: copy, mode: 'edit' }); renderAll(); } }), 'tool-button'),
    button('删除', wrapAction(() => { const id = currentSlide(); if (id) controller.removeSlide(id); renderAll(); }), 'danger-button'),
   ]);
   group('排列', [createDropdown(command('arrange', '排列', 'arrange', () => undefined), arrange)]);
   group('编辑', [
    button('查找', wrapAction(() => controller.openTextSearch({ mode: 'find' })), 'tool-button'),
    button('替换', wrapAction(() => controller.openTextSearch({ mode: 'replace' })), 'tool-button'),
    createDropdown(command('select', '选择', 'selection-pane', () => undefined), [
     command('select-all', '全选', 'selection-pane', () => controller.selectAll()),
     command('selection-pane', '选择窗格', 'selection-pane', () => { inspectorTab = 'object'; renderAll(); }),
    ]),
   ]);
  }
  if (ribbonTab === 'insert') {
   group('文本', [button('文字', wrapAction(() => { const id = controller.addShape('rect'); if (id) { controller.editText(id, '输入文字'); controller.select({ kind: 'elements', ids: [id], enteredGroup: null }); } renderAll(); }), 'tool-button')]);
   group('图片', [createSplitButton(command('image', '图片', 'image', () => chooseImage('insert')), [
    command('replace-image', '替换图片', 'replace-image', () => chooseImage('replace')),
    command('image-options', '图片选项', 'image', () => { inspectorTab = 'object'; renderAll(); }),
   ])]);
   group('形状', [createGallery('shape-gallery', '形状库', [
    { ...command('shape-rect', '矩形', 'shape', () => addShape('rect')), preview: 'preview-rect' },
    { ...command('shape-roundrect', '圆角矩形', 'shape', () => addShape('roundRect')), preview: 'preview-roundrect' },
    { ...command('shape-ellipse', '椭圆', 'shape', () => addShape('ellipse')), preview: 'preview-ellipse' },
    { ...command('shape-diamond', '菱形', 'shape', () => addShape('diamond')), preview: 'preview-diamond' },
   ], 4), button('表格', wrapAction(() => {
    const rows = Number.parseInt(globalThis.prompt?.('行数', '3') ?? '3', 10);
    const cols = Number.parseInt(globalThis.prompt?.('列数', '3') ?? '3', 10);
    if (Number.isFinite(rows) && Number.isFinite(cols)) controller.addTable(Math.max(1, Math.min(10, rows)), Math.max(1, Math.min(10, cols)));
    renderAll();
   }), 'tool-button')]);
  }
  if (ribbonTab === 'design') group('设计', [
   button('页面背景', wrapAction(() => backgroundInput.click()), 'tool-button'),
   button('开启吸附', wrapAction(() => { controller.setSnapping(!controller.snapshot.snapping); renderAll(false); }), 'tool-button'),
   button('缩小', wrapAction(() => { changeStageZoom(-.1); }), 'tool-button'),
   button('放大', wrapAction(() => { changeStageZoom(.1); }), 'tool-button'),
  ]);
  if (ribbonTab === 'transition') group('切换', [createGallery('transition-gallery', '常用切换', [
   { ...command('transition-none', '无', 'transition', () => { controller.setTransition(null); renderAll(false); }), preview: 'preview-none' },
   { ...command('transition-fade', '淡化', 'transition', () => { controller.setTransition({ type: 'fade' }); renderAll(false); }), preview: 'preview-fade' },
   { ...command('transition-push', '推进', 'transition', () => { controller.setTransition({ type: 'push', dir: 'r' }); renderAll(false); }), preview: 'preview-push' },
   { ...command('transition-wipe', '擦除', 'transition', () => { controller.setTransition({ type: 'wipe', dir: 'r' }); renderAll(false); }), preview: 'preview-wipe' },
   { ...command('transition-split', '分割', 'transition', () => { controller.setTransition({ type: 'split', dir: 'horz' }); renderAll(false); }), preview: 'preview-split' },
   { ...command('transition-zoom', '缩放', 'transition', () => { controller.setTransition({ type: 'zoom' }); renderAll(false); }), preview: 'preview-zoom' },
  ], 6), button('预览切换', wrapAction(() => controller.previewTransition()), 'tool-button')]);
  if (ribbonTab === 'animation') group('动画', [createGallery('animation-gallery', '动画库', [
   { ...command('animation-appear', '出现', 'animation', () => addAnimation('appear')), preview: 'preview-appear' },
   { ...command('animation-fade', '淡入', 'animation', () => addAnimation('fade')), preview: 'preview-fade' },
   { ...command('animation-fly', '飞入', 'animation', () => addAnimation('fly')), preview: 'preview-fly' },
   { ...command('animation-wipe', '擦除', 'animation', () => addAnimation('wipe')), preview: 'preview-wipe' },
   { ...command('animation-zoom', '缩放', 'animation', () => addAnimation('zoom')), preview: 'preview-zoom' },
   { ...command('animation-spin', '旋转', 'animation', () => addAnimation('spin', 'emphasis')), preview: 'preview-spin' },
  ], 6), button('动画窗格', wrapAction(() => { inspectorTab = 'animation'; renderAll(); }), 'tool-button'), button('预览', wrapAction(() => { void controller.previewAnimations(); }), 'tool-button')]);
  if (ribbonTab === 'show') group('放映', [button('预览', wrapAction(() => togglePreview()), 'preview-button'), button('试课', wrapAction(() => rehearse()), 'show-rehearse-button'), button('发布冻结', wrapAction(() => publish()), 'show-publish-button')], 'show-toolbar-group');
  if (ribbonTab === 'review') group('审阅', [button('查找', wrapAction(() => controller.openTextSearch({ mode: 'find' })), 'tool-button'), button('替换', wrapAction(() => controller.openTextSearch({ mode: 'replace' })), 'tool-button'), button('替代文字', wrapAction(() => setStatus('当前 beta.2 未提供独立 Alt Text seam，先使用选择窗格重命名对象', true)), 'tool-button')]);
  if (ribbonTab === 'view') group('视图', [
   button('选择窗格', wrapAction(() => { inspectorTab = 'object'; renderAll(); }), 'tool-button'),
   button(controller.snapshot.snapping ? '关闭吸附' : '开启吸附', wrapAction(() => { controller.setSnapping(!controller.snapshot.snapping); renderAll(false); }), 'tool-button'),
   button('适应窗口', wrapAction(() => { applyStageZoom(true); renderAll(false); }), 'tool-button'),
   button('备注', wrapAction(() => { inspectorTab = 'page'; renderAll(); }), 'tool-button'),
  ]);
  if (ribbonTab === 'image-format') group('图片格式', [
   button('替换图片', wrapAction(() => chooseImage('replace')), 'tool-button'),
   button('裁剪', wrapAction(() => { controller.startImageCrop(); }), 'tool-button'),
   button('恢复裁剪', wrapAction(() => { controller.clearImageCrop(); }), 'tool-button'),
   createDropdown(command('image-arrange', '排列', 'arrange', () => undefined), arrange),
  ]);
  if (ribbonTab === 'shape-format') group('形状格式', [
   button('形状填充', wrapAction(() => { const id = selectedIds()[0]; if (id) controller.setFill(id, solid(rgb('#5375B8'))); renderAll(); }), 'tool-button'),
   button('形状轮廓', wrapAction(() => { const id = selectedIds()[0]; if (id) controller.setStroke(id, { color: rgb('#24324B'), width: 1.5, dash: null, cap: 'butt', join: 'miter', compound: 'sng' }); renderAll(); }), 'tool-button'),
   createDropdown(command('shape-arrange', '排列', 'arrange', () => undefined), arrange),
  ]);
 };
 renderOfficeToolbar();
 return;
 const group = (label: string, controls: HTMLElement[]): void => { const section = document.createElement('div');
 section.className = 'toolbar-group';
 const name = document.createElement('span');
 name.className = 'toolbar-label';
 name.textContent = label;
 section.append(name, ...controls);
 toolbar.append(section);
 };
 if (ribbonTab === 'start' || ribbonTab === 'file') group('编辑', [button('撤销', wrapAction(() => { controller.undo();
 renderAll();
 }), 'tool-button'), button('重做', wrapAction(() => { controller.redo();
 renderAll();
 }), 'tool-button'), button('复制', wrapAction(() => { controller.copy();
 }), 'tool-button'), button('粘贴', wrapAction(() => { controller.paste();
 renderAll();
 }), 'tool-button'), button('删除', wrapAction(() => { controller.removeSelected();
 renderAll();
 }), 'tool-button')]);
 if (ribbonTab === 'start' || ribbonTab === 'insert') group('插入', [button('文字', wrapAction(() => { const id = controller.addShape('rect');
 if (id) { controller.editText(id, '输入文字');
 controller.select({ kind: 'elements', ids: [id], enteredGroup: null });
 } renderAll();
 }), 'tool-button'), button('图形', wrapAction(() => { controller.addShape('roundRect');
 renderAll();
 }), 'tool-button'), button('表格', wrapAction(() => { const rows = Number.parseInt(globalThis.prompt?.('行数', '3') ?? '3', 10);
 const cols = Number.parseInt(globalThis.prompt?.('列数', '3') ?? '3', 10);
 if (Number.isFinite(rows) && Number.isFinite(cols)) controller.addTable(Math.max(1, Math.min(10, rows)), Math.max(1, Math.min(10, cols)));
 renderAll();
 }), 'tool-button'), button('图片', wrapAction(() => imageInput.click()), 'tool-button'), button('页面背景', wrapAction(() => backgroundInput.click()), 'tool-button')]);
 if (ribbonTab === 'start') group('排列', [button('左对齐', wrapAction(() => { controller.align(selectedIds(), 'left');
 renderAll();
 }), 'tool-button'), button('水平居中', wrapAction(() => { controller.align(selectedIds(), 'center');
 renderAll();
 }), 'tool-button'), button('置顶', wrapAction(() => { controller.setLayerMany(selectedIds(), 'front');
 renderAll();
 }), 'tool-button'), button('等距分布', wrapAction(() => { controller.distributeHorizontal(selectedIds()); renderAll(); }), 'tool-button'), button('置底', wrapAction(() => { controller.setLayerMany(selectedIds(), 'back');
 renderAll();
 }), 'tool-button')]);
 if (ribbonTab === 'start' || ribbonTab === 'file') group('课堂动作', [button('下一动画', wrapAction(() => { if (preview) void preview.session.nextStep?.();
 else addAnimation();
 }), 'tool-button'), button('保存', wrapAction(() => persist()), 'tool-button'), button('开始试课', wrapAction(() => rehearse()), 'tool-button'), button('发布冻结', wrapAction(() => publish()), 'signal-button')]);
 if (ribbonTab === 'design') group('设计', [
  button('页面背景', wrapAction(() => backgroundInput.click()), 'tool-button'),
  button(controller.snapshot.snapping ? '关闭吸附' : '开启吸附', wrapAction(() => { controller.setSnapping(!controller.snapshot.snapping); renderAll(false); }), 'tool-button'),
  button('缩小', wrapAction(() => { changeStageZoom(-.1); }), 'tool-button'),
  button('放大', wrapAction(() => { changeStageZoom(.1); }), 'tool-button'),
 ]);
 if (ribbonTab === 'transition') group('切换', [button('淡化', wrapAction(() => { controller.setTransition({ type: 'fade' }); renderAll(false); }), 'tool-button'), button('无', wrapAction(() => { controller.setTransition(null); renderAll(false); }), 'tool-button'), button('预览切换', wrapAction(() => controller.previewTransition()), 'tool-button')]);
 if (ribbonTab === 'animation') group('动画', [button('给选中对象加入淡入', wrapAction(() => addAnimation()), 'tool-button'), button('下一动画', wrapAction(() => { if (preview) void preview.session.nextStep?.(); }), 'tool-button')]);
 if (ribbonTab === 'show') group('放映', [button('预览', wrapAction(() => togglePreview()), 'preview-button')]);
 if (ribbonTab === 'review') group('审阅', [button('查找', wrapAction(() => { controller.openTextSearch({ mode: 'find' }); }), 'tool-button'), button('替换', wrapAction(() => { controller.openTextSearch({ mode: 'replace' }); }), 'tool-button')]);
 if (ribbonTab === 'view') group('视图', [button(controller.snapshot.snapping ? '关闭吸附' : '开启吸附', wrapAction(() => { controller.setSnapping(!controller.snapshot.snapping); renderAll(false); }), 'tool-button'), button('适应窗口', wrapAction(() => { applyStageZoom(true); renderAll(false); }), 'tool-button')]);
 }
    function renderInspector(): void { inspectorBody.replaceChildren();
 selectionPaneHost.hidden = inspectorTab !== 'object';
 const tabs = document.createElement('div');
 tabs.className = 'inspector-tabs';
 (['object', 'page', 'animation'] as const).forEach(tab => { tabs.append(button(tab === 'object' ? '对象' : tab === 'page' ? '页面' : '动画', () => { inspectorTab = tab;
 renderInspector();
 }, `inspector-tab${inspectorTab === tab ? ' active' : ''}`));
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
 const record = controller.element(id);
 const element = editor.effectiveElement(id);
 if (!record || !element) { inspectorBody.append(emptyInspector('对象已失效'));
 return;
 } const heading = document.createElement('div');
 heading.className = 'inspector-heading';
 heading.textContent = `${kindLabel(record)} · ${id.slice(-8)}`;
 inspectorBody.append(heading);
 const grid = document.createElement('div');
 grid.className = 'property-grid';
 for (const [label, key, value] of [['X', 'x', element.x], ['Y', 'y', element.y], ['宽', 'w', element.w], ['高', 'h', element.h], ['旋转', 'rot', element.rot]] as const) { const field = document.createElement('label');
 field.textContent = label;
 field.append(input(label, String(Math.round(value)), next => { const number = Number(next);
 if (Number.isFinite(number)) controller.setTransform(id, { [key]: number });
 renderAll(false);
 }, 'number'));
 grid.append(field);
 } inspectorBody.append(grid);
 if (record.src.kind === 'shape' || record.src.kind === 'image' || record.src.kind === 'table') inspectorBody.append(styleControls(id));
 if (record.src.kind === 'shape' || record.src.kind === 'table') { const textArea = document.createElement('textarea');
 textArea.value = textOf(record);
 textArea.placeholder = '输入对象文字';
 textArea.setAttribute('aria-label', '对象文字');
 textArea.addEventListener('change', () => { controller.editText(id, textArea.value);
 renderAll(false);
 });
 inspectorBody.append(labelBlock('文字', textArea));
 const textTools = document.createElement('div');
 textTools.className = 'layer-actions';
 textTools.append(button('加粗', wrapAction(() => { controller.setTextStyle(id, { b: true }); renderAll(false); }), 'small-button'), button('斜体', wrapAction(() => { controller.setTextStyle(id, { i: true }); renderAll(false); }), 'small-button'), button('下划线', wrapAction(() => { controller.setTextStyle(id, { u: true }); renderAll(false); }), 'small-button'));
 inspectorBody.append(textTools);
 } if (record.src.kind === 'shape' || record.src.kind === 'image') inspectorBody.append(layerControls(id));
 }
    function renderPageInspector(): void { const slideId = currentSlide();
 if (!slideId) { inspectorBody.append(emptyInspector('没有可编辑的页面'));
 return;
 } const title = document.createElement('h2');
 title.textContent = `第 ${(currentSession()?.editor.doc.slideOrder.indexOf(slideId) ?? 0) + 1} 页`;
 inspectorBody.append(title);
 const colors: Array<[string, string]> = [['纸张', '#F7F4EE'], ['蓝灰', '#E7ECF7'], ['珊瑚', '#F4E1DA'], ['白色', '#FFFFFF']];
 const swatches = document.createElement('div');
 swatches.className = 'swatch-row';
 colors.forEach(([label, color]) => swatches.append(button(label, wrapAction(() => { controller.setSlideBackground(slideId, solid(rgb(color)));
 renderAll();
 }), 'swatch-button')));
 inspectorBody.append(labelBlock('页面背景', swatches));
 const customColor = input('自定义背景色', '#F7F4EE', value => { if (/^#[0-9a-f]{6}$/i.test(value)) { controller.setSlideBackground(slideId, solid(rgb(value))); renderAll(); } });
 customColor.className = 'background-hex';
 inspectorBody.append(labelBlock('十六进制颜色', customColor));
 const notes = document.createElement('textarea');
 notes.value = currentSession()?.editor.toSlide(slideId).notes ?? '';
 notes.placeholder = '教师备注不会出现在大屏';
 notes.addEventListener('change', () => { controller.setNotes(slideId, notes.value);
 renderAll(false);
 });
 inspectorBody.append(labelBlock('教师备注', notes));
 inspectorBody.append(button('隐藏此页', wrapAction(() => { controller.execute({ type: 'SetHidden', id: slideId, v: true });
 renderAll();
 }), 'small-button'));
 }
    function renderAnimationInspector(slideId: SlideId): void { const animations = (webPpt.snapshot.view?.queryAnimations().value ?? []) as readonly { effect?: string;
 kind: string;
 trigger: string }[];
 const heading = document.createElement('div');
 heading.className = 'inspector-heading';
 heading.textContent = `第 ${(currentSession()?.editor.doc.slideOrder.indexOf(slideId) ?? 0) + 1} 页动画`;
 inspectorBody.append(heading);
 const list = document.createElement('div');
 list.className = 'animation-list';
 if (!animations.length) list.append(emptyInspector('当前页面暂无动画'));
 animations.forEach((step, index) => { const row = document.createElement('div');
 row.className = 'animation-row';
 row.textContent = `${index + 1}. ${step.effect ?? step.kind} · ${step.trigger}`;
 list.append(row);
 });
 inspectorBody.append(list, button('给选中对象加入淡入', wrapAction(() => addAnimation()), 'primary-button'), button('清除本页动画', wrapAction(() => { controller.setAnimations(slideId, []);
 renderAll();
 }), 'danger-button'));
 }
    function addAnimation(effect: 'appear' | 'fade' | 'fly' | 'wipe' | 'zoom' | 'spin' = 'fade', kind: 'entrance' | 'emphasis' = 'entrance'): void { const slideId = currentSlide();
 const id = selectedIds()[0];
 if (!slideId || !id) { setStatus('先选择一个对象再添加动画', true);
 return;
 } const step = kind === 'emphasis'
  ? { target: id, kind: 'emphasis' as const, effect: (effect === 'spin' ? 'spin' : 'grow') as 'spin' | 'grow', trigger: 'click' as const, delayMs: 0, durationMs: 300 }
  : { target: id, kind: 'entrance' as const, effect: effect === 'spin' ? 'fade' as const : effect, trigger: 'click' as const, delayMs: 0, durationMs: 300 };
 controller.appendAnimations(slideId, [step]);
 renderAll();
 }
    function styleControls(id: ElementId): HTMLElement { const group = document.createElement('div');
 group.className = 'inspector-section';
 const label = document.createElement('span');
 label.className = 'section-label';
 label.textContent = '样式';
 const swatches = document.createElement('div');
 swatches.className = 'swatch-row';
 [['蓝', '#5375B8'], ['珊瑚', '#D66B52'], ['金', '#E6A23C'], ['墨', '#24324B'], ['无', '']].forEach(([name, color]) => swatches.append(button(name, wrapAction(() => { controller.setFill(id, color ? solid(rgb(color)) : { type: 'none' });
 renderAll();
 }), 'swatch-button')));
 const strokes = document.createElement('div');
 strokes.className = 'swatch-row';
 strokes.append(button('描边', wrapAction(() => { controller.setStroke(id, { color: rgb('#24324B'), width: 1.5, dash: null, cap: 'butt', join: 'miter', compound: 'sng' }); renderAll(); }), 'swatch-button'), button('无描边', wrapAction(() => { controller.setStroke(id, { type: 'none' }); renderAll(); }), 'swatch-button'));
 group.append(label, swatches, strokes);
 return group;
 }
    function layerControls(id: ElementId): HTMLElement { const group = document.createElement('div');
 group.className = 'layer-actions';
 group.append(button('上移一层', wrapAction(() => { controller.setLayer(id, 'forward');
 renderAll();
 }), 'small-button'), button('下移一层', wrapAction(() => { controller.setLayer(id, 'backward');
 renderAll();
 }), 'small-button'), button('水平翻转', wrapAction(() => { controller.setFlip(id, true, undefined);
 renderAll();
 }), 'small-button'), button('垂直翻转', wrapAction(() => { controller.setFlip(id, undefined, true);
 renderAll();
 }), 'small-button'));
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
    function kindLabel(record: ElementRecord | null): string { const kind = record?.src.kind;
 return kind === 'shape' ? '图形' : kind === 'image' ? '图片' : kind === 'table' ? '表格' : kind === 'group' ? '组合' : '对象';
 }
    function renderAll(thumbnails = true): void { renderRibbonTabs(); renderScenePanel(thumbnails);
 renderToolbar();
 renderInspector();
 const slideId = currentSlide();
 const index = currentSession()?.editor.doc.slideOrder.indexOf(slideId ?? '') ?? 0;
 stageTitle.replaceChildren();
 const title = document.createElement('div');
 title.innerHTML = `<span class="eyebrow">正在编辑 · web-ppt / OOXML</span><strong>${escapeText(asset?.title ?? '请打开课件')}</strong>`;
 const meta = document.createElement('span');
 meta.className = 'format-note';
 meta.textContent = `16:9 · 第 ${Math.max(0, index + 1)} / ${currentSession()?.editor.doc.slideOrder.length ?? 0} 页`;
 stageTitle.append(title, meta);
 stageFooter.textContent = `${controller.snapshot.status} · ${controller.snapshot.zoom.toFixed(2)}× · ${currentSession()?.editor.history.undoCount ?? 0} 个可撤销操作${published ? ` · 已发布 ${published.fingerprint.slice(0, 12)}` : ''}`;
 const pageNumber = (currentSession()?.editor.doc.slideOrder.indexOf(currentSlide() ?? '') ?? -1) + 1;
 statusBar.textContent = `${pageNumber} / ${currentSession()?.editor.doc.slideOrder.length ?? 0} 页 · ${controller.snapshot.snapping ? '吸附开启' : '吸附关闭'} · ${Math.round(controller.snapshot.zoom * 100)}%`;
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
   setStatus('正在保存…');
   const bytes = await controller.save();
   const saved = await createWebPptAssetFromBytes(sourceAsset.title, bytes, sourceAsset.document.idPrefix);
   const next: WebPptPresentationAsset = { ...sourceAsset, source: saved.source, updatedAt: new Date().toISOString() };
   asset = next;
   thumbnailAsset = next;
   await persistWebPptDraft(next);
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
   renderAll(false);
   if (editGeneration > generation) setStatus('正在保存…');
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
    async function rehearse(): Promise<void> { if (!asset || busy) return;
 busy = true;
 setStatus('正在准备试课版本…');
 try { const bytes = await controller.save();
 const saved = await createWebPptAssetFromBytes(titleInput.value.trim() || asset.title, bytes, asset.document.idPrefix);
 const validation = await engine.validate(saved);
 if (!validation.valid) throw new Error(`试课阻断：${validation.errors.join('、')}`);
 const runtimeIndex = await engine.buildRuntimeIndex(saved);
 await persistWebPptDraft(saved);
 await syncServerDraft(saved);
 const response = await serverJson(`/api/presentations/${encodeURIComponent(serverProject!.presentationId)}/rehearsal-session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
 const rehearsal = response.rehearsal;
 setStatus(`试课已准备 · ${runtimeIndex.scenes.length} 页 · session ${rehearsal.session.sessionId} · ${rehearsal.revision.expiresAt ? `有效至 ${new Date(rehearsal.revision.expiresAt).toLocaleString()}` : '临时版本'}`);
 asset = saved; thumbnailAsset = saved; renderAll(false);
 } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
 finally { busy = false; }
 }
    async function publish(): Promise<void> { if (!asset || busy) return;
 busy = true;
 setStatus('正在校验并冻结…');
 try { const bytes = await controller.save();
 const saved = await createWebPptAssetFromBytes(titleInput.value.trim() || asset.title, bytes, asset.document.idPrefix);
 const validation = await engine.validate(saved);
 if (!validation.valid) throw new Error(`发布阻断：${validation.errors.join('、')}`);
 const runtimeIndex = await engine.buildRuntimeIndex(saved);
 await persistWebPptDraft(saved);
 await syncServerDraft(saved);
 const publishedResponse = await serverJson(`/api/presentations/${encodeURIComponent(serverProject!.presentationId)}/published`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engine: saved.engine, document: { ...saved.document, deckId: saved.deckId }, runtimeIndex }) });
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
 setStatus('正在打开课件…');
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
 webPpt.snapshot.view?.registerTextUi(toolbar);
 applyStageZoom(true);
 controller.attachEditorSubscription();
 renderAll();
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
 headerActions.append(button('新建', wrapAction(() => newDeck()), 'small-button'), button('打开 PPTX', wrapAction(() => fileInput.click()), 'small-button'), button('预览', wrapAction(() => togglePreview()), 'preview-button'), fileInput, imageInput, backgroundInput);
 titleInput.addEventListener('change', () => { if (asset) asset = { ...asset, title: titleInput.value.trim() || '未命名公开课' };
 editGeneration += 1;
 scheduleAutosave();
 renderAll(false);
 });
 function scheduleAutosave(): void {
  if (autosaveSuspended || !asset) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  setStatus('正在保存…');
  autosaveTimer = setTimeout(() => { autosaveTimer = null; void persist(); }, 1500);
 }
 webPpt.subscribe(() => { editGeneration += 1; renderAll(false); scheduleThumbnailRefresh(); scheduleAutosave(); });
 controller.subscribe(() => { editGeneration += 1; renderAll(false); scheduleThumbnailRefresh(); scheduleAutosave(); });
 window.addEventListener('keydown', event => { const modifier = event.metaKey || event.ctrlKey;
 if (modifier && event.key.toLowerCase() === 's') { event.preventDefault();
 void persist();
 } if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault();
 event.shiftKey ? controller.redo() : controller.undo();
 renderAll();
 } if (modifier && event.key.toLowerCase() === 'c' && !isTypingTarget(event.target)) { event.preventDefault();
 controller.copy();
 } if (modifier && event.key.toLowerCase() === 'v' && !isTypingTarget(event.target)) { event.preventDefault();
 controller.paste();
 renderAll();
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
    draft = await loadWebPptDraft();
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
