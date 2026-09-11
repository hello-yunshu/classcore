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
                { id: 'element-title', kind: 'text', x: 72, y: 66, width: 760, height: 80, zIndex: 1, text: '图案的还原', color: '#24324b' },
                { id: 'element-subtitle', kind: 'text', x: 76, y: 156, width: 620, height: 42, zIndex: 2, text: '观察碎片，寻找旋转与平移的关系', color: '#6c7483' },
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

function button(label: string, action: () => void | Promise<void>, className = '', title = label): HTMLButtonElement { const item = document.createElement('button');
 item.type = 'button';
 item.className = className;
 item.textContent = label;
 item.title = title;
 item.setAttribute('aria-label', title);
 item.addEventListener('click', () => { void action();
 });
 return item;
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

async function mountPresentationStudioAsync(root: HTMLElement): Promise<void> {
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
 let inspectorTab: 'object' | 'page' | 'animation' = 'object';
 let thumbnailGeneration = 0;
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
 documentBar.append(titleInput, saveState);
 header.append(brand, documentBar, headerActions);
 app.append(header);
    const toolbar = document.createElement('nav');
 toolbar.className = 'context-toolbar';
 toolbar.setAttribute('aria-label', '课件编辑工具');
 app.append(toolbar);
 const layout = document.createElement('main');
 layout.className = 'studio-layout';
 const scenePanel = document.createElement('aside');
 scenePanel.className = 'scene-panel';
 const stagePanel = document.createElement('section');
 stagePanel.className = 'stage-panel';
 const inspector = document.createElement('aside');
 inspector.className = 'inspector-panel';
 layout.append(scenePanel, stagePanel, inspector);
 app.append(layout);
    const sceneList = document.createElement('div');
 sceneList.className = 'scene-list';
 const stageTitle = document.createElement('div');
 stageTitle.className = 'stage-titlebar';
 const editorHost = document.createElement('div');
 editorHost.className = 'studio-stage web-ppt-stage';
 const stageFooter = document.createElement('div');
 stageFooter.className = 'stage-footer';
 stagePanel.append(stageTitle, editorHost, stageFooter);
    function currentSession() { return controller.session;
 } function currentSlide(): SlideId | null { return controller.slideId ?? currentSession()?.editor.doc.slideOrder[0] ?? null;
 } function selectedIds() { return controller.selectedIds();
 } function setStatus(message: string, error = false): void { saveState.textContent = message;
 saveState.className = `save-state${error ? ' status-error' : ''}`;
 } function wrapAction(action: () => void | Promise<void>): () => void { return () => { try { const result = action();
 if (result instanceof Promise) void result.catch(error => setStatus(error instanceof Error ? error.message : String(error), true));
 } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true);
 } };
 }
    async function syncThumbnails(): Promise<void> { const generation = ++thumbnailGeneration;
 for (const session of thumbnailSessions.values()) session.dispose();
 thumbnailSessions.clear();
 if (!asset) return;
 const hosts = [...sceneList.querySelectorAll<HTMLElement>('[data-thumbnail-host]')];
 const slideIds = [...(currentSession()?.editor.doc.slideOrder ?? [])];
 for (const host of hosts) { if (generation !== thumbnailGeneration) return;
 const slideId = host.dataset.thumbnailHost;
 if (!slideId || !slideIds.includes(slideId)) continue;
 try { const session = await engine.mountPlayer(host, asset, { context: { sessionId: 'thumbnail', surface: 'teacher-runtime' } });
 session.goto?.(slideId, 0);
 thumbnailSessions.set(slideId, session);
 } catch { host.textContent = '缩略图不可用';
 } } }
    function renderScenePanel(): void { const editor = currentSession()?.editor;
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
 void syncThumbnails();
 }
    function renderToolbar(): void { toolbar.replaceChildren();
 const group = (label: string, controls: HTMLElement[]): void => { const section = document.createElement('div');
 section.className = 'toolbar-group';
 const name = document.createElement('span');
 name.className = 'toolbar-label';
 name.textContent = label;
 section.append(name, ...controls);
 toolbar.append(section);
 };
 group('编辑', [button('撤销', wrapAction(() => { controller.undo();
 renderAll();
 }), 'tool-button'), button('重做', wrapAction(() => { controller.redo();
 renderAll();
 }), 'tool-button'), button('复制', wrapAction(() => { controller.copy();
 }), 'tool-button'), button('粘贴', wrapAction(() => { controller.paste();
 renderAll();
 }), 'tool-button'), button('删除', wrapAction(() => { controller.removeSelected();
 renderAll();
 }), 'tool-button')]);
 group('插入', [button('文字', wrapAction(() => { const id = controller.addShape('rect');
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
 group('排列', [button('左对齐', wrapAction(() => { controller.align(selectedIds(), 'left');
 renderAll();
 }), 'tool-button'), button('水平居中', wrapAction(() => { controller.align(selectedIds(), 'center');
 renderAll();
 }), 'tool-button'), button('置顶', wrapAction(() => { for (const id of selectedIds()) controller.setLayer(id, 'front');
 renderAll();
 }), 'tool-button'), button('等距分布', wrapAction(() => { controller.distributeHorizontal(selectedIds()); renderAll(); }), 'tool-button'), button('置底', wrapAction(() => { for (const id of selectedIds()) controller.setLayer(id, 'back');
 renderAll();
 }), 'tool-button')]);
 group('课堂动作', [button('下一动画', wrapAction(() => { if (preview) void preview.session.nextStep?.();
 else addAnimation();
 }), 'tool-button'), button('保存', wrapAction(() => persist()), 'tool-button'), button('发布冻结', wrapAction(() => publish()), 'signal-button')]);
 }
    function renderInspector(): void { inspector.replaceChildren();
 const tabs = document.createElement('div');
 tabs.className = 'inspector-tabs';
 (['object', 'page', 'animation'] as const).forEach(tab => { tabs.append(button(tab === 'object' ? '对象' : tab === 'page' ? '页面' : '动画', () => { inspectorTab = tab;
 renderInspector();
 }, `inspector-tab${inspectorTab === tab ? ' active' : ''}`));
 });
 inspector.append(tabs);
 if (inspectorTab === 'page') { renderPageInspector();
 return;
 } const slideId = currentSlide();
 const editor = currentSession()?.editor;
 if (!slideId || !editor) { inspector.append(emptyInspector('打开一个课件开始编辑'));
 return;
 } if (inspectorTab === 'animation') { renderAnimationInspector(slideId);
 return;
 } const ids = selectedIds();
 if (!ids.length) { inspector.append(emptyInspector('选择画布中的对象，或从对象列表进入'), createObjectList(slideId));
 return;
 } const id = ids[0];
 const record = controller.element(id);
 const element = editor.effectiveElement(id);
 if (!record || !element) { inspector.append(emptyInspector('对象已失效'));
 return;
 } const heading = document.createElement('div');
 heading.className = 'inspector-heading';
 heading.textContent = `${kindLabel(record)} · ${id.slice(-8)}`;
 inspector.append(heading);
 const grid = document.createElement('div');
 grid.className = 'property-grid';
 for (const [label, key, value] of [['X', 'x', element.x], ['Y', 'y', element.y], ['宽', 'w', element.w], ['高', 'h', element.h], ['旋转', 'rot', element.rot]] as const) { const field = document.createElement('label');
 field.textContent = label;
 field.append(input(label, String(Math.round(value)), next => { const number = Number(next);
 if (Number.isFinite(number)) controller.setTransform(id, { [key]: number });
 renderAll(false);
 }, 'number'));
 grid.append(field);
 } inspector.append(grid);
 if (record.src.kind === 'shape' || record.src.kind === 'image' || record.src.kind === 'table') inspector.append(styleControls(id));
 if (record.src.kind === 'shape' || record.src.kind === 'table') { const textArea = document.createElement('textarea');
 textArea.value = textOf(record);
 textArea.placeholder = '输入对象文字';
 textArea.setAttribute('aria-label', '对象文字');
 textArea.addEventListener('change', () => { controller.editText(id, textArea.value);
 renderAll(false);
 });
 inspector.append(labelBlock('文字', textArea));
 const textTools = document.createElement('div');
 textTools.className = 'layer-actions';
 textTools.append(button('加粗', wrapAction(() => { controller.setTextStyle(id, { b: true }); renderAll(false); }), 'small-button'), button('斜体', wrapAction(() => { controller.setTextStyle(id, { i: true }); renderAll(false); }), 'small-button'), button('下划线', wrapAction(() => { controller.setTextStyle(id, { u: true }); renderAll(false); }), 'small-button'));
 inspector.append(textTools);
 } if (record.src.kind === 'shape' || record.src.kind === 'image') inspector.append(layerControls(id));
 }
    function renderPageInspector(): void { const slideId = currentSlide();
 if (!slideId) { inspector.append(emptyInspector('没有可编辑的页面'));
 return;
 } const title = document.createElement('h2');
 title.textContent = `第 ${(currentSession()?.editor.doc.slideOrder.indexOf(slideId) ?? 0) + 1} 页`;
 inspector.append(title);
 const colors: Array<[string, string]> = [['纸张', '#F7F4EE'], ['蓝灰', '#E7ECF7'], ['珊瑚', '#F4E1DA'], ['白色', '#FFFFFF']];
 const swatches = document.createElement('div');
 swatches.className = 'swatch-row';
 colors.forEach(([label, color]) => swatches.append(button(label, wrapAction(() => { controller.setSlideBackground(slideId, solid(rgb(color)));
 renderAll();
 }), 'swatch-button')));
 inspector.append(labelBlock('页面背景', swatches));
 const notes = document.createElement('textarea');
 notes.value = currentSession()?.editor.toSlide(slideId).notes ?? '';
 notes.placeholder = '教师备注不会出现在大屏';
 notes.addEventListener('change', () => { controller.setNotes(slideId, notes.value);
 renderAll(false);
 });
 inspector.append(labelBlock('教师备注', notes));
 inspector.append(button('隐藏此页', wrapAction(() => { controller.execute({ type: 'SetHidden', id: slideId, v: true });
 renderAll();
 }), 'small-button'));
 }
    function renderAnimationInspector(slideId: SlideId): void { const animations = (webPpt.snapshot.view?.queryAnimations().value ?? []) as readonly { effect?: string;
 kind: string;
 trigger: string }[];
 const heading = document.createElement('div');
 heading.className = 'inspector-heading';
 heading.textContent = `第 ${(currentSession()?.editor.doc.slideOrder.indexOf(slideId) ?? 0) + 1} 页动画`;
 inspector.append(heading);
 const list = document.createElement('div');
 list.className = 'animation-list';
 if (!animations.length) list.append(emptyInspector('当前页面暂无动画'));
 animations.forEach((step, index) => { const row = document.createElement('div');
 row.className = 'animation-row';
 row.textContent = `${index + 1}. ${step.effect ?? step.kind} · ${step.trigger}`;
 list.append(row);
 });
 inspector.append(list, button('给选中对象加入淡入', wrapAction(() => addAnimation()), 'primary-button'), button('清除本页动画', wrapAction(() => { controller.setAnimations(slideId, null);
 renderAll();
 }), 'danger-button'));
 }
    function addAnimation(): void { const slideId = currentSlide();
 const id = selectedIds()[0];
 if (!slideId || !id) { setStatus('先选择一个对象再添加动画', true);
 return;
 } controller.setAnimations(slideId, [{ target: id, kind: 'entrance', effect: 'fade', trigger: 'click', delayMs: 0, durationMs: 300 }]);
 renderAll();
 }
    function createObjectList(slideId: SlideId): HTMLElement { const list = document.createElement('div');
 list.className = 'object-list';
 const ids = currentSession()?.editor.doc.slides[slideId]?.children ?? [];
 [...ids].reverse().forEach(id => { const record = controller.element(id);
 list.append(button(`${kindLabel(record)} · ${id.slice(-6)}`, () => { controller.select({ kind: 'elements', ids: [id], enteredGroup: null });
 renderAll();
 }, 'object-row'));
 });
 return list;
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
    function renderAll(thumbnails = true): void { renderScenePanel();
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
 if (!thumbnails) thumbnailGeneration += 1;
 }
    async function persist(): Promise<void> { if (!asset || busy) return;
 busy = true;
 setStatus('正在保存…');
 try { const bytes = await controller.save();
 const saved = await createWebPptAssetFromBytes(asset.title, bytes, asset.document.idPrefix);
 asset = { ...asset, source: saved.source, updatedAt: new Date().toISOString() };
 await persistWebPptDraft(asset);
 setStatus(`已保存 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
 renderAll(false);
 } finally { busy = false;
 } }
    async function publish(): Promise<void> { if (!asset || busy) return;
 busy = true;
 setStatus('正在校验并冻结…');
 try { const bytes = await controller.save();
 const saved = await createWebPptAssetFromBytes(titleInput.value.trim() || asset.title, bytes, asset.document.idPrefix);
 const validation = await engine.validate(saved);
 if (!validation.valid) throw new Error(`发布阻断：${validation.errors.join('、')}`);
 const runtimeIndex = await engine.buildRuntimeIndex(saved);
 const record: PublishedPresentationRecord = { version: 1, deckId: saved.deckId, title: saved.title, fingerprint: saved.source?.sha256 ?? '', publishedAt: new Date().toISOString(), runtimeIndex, bytes: saved.source!.bytes };
 await persistWebPptDraft(saved);
 await persistPublished(record);
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
 titleInput.value = next.title;
 published = null;
 await webPpt.applyBinding({ source: next.source!.bytes, openOptions: { idPrefix: next.document.idPrefix }, mode: 'edit', textMode: 'svg' });
 webPpt.attach(editorHost);
 webPpt.attachSelectionPane(null);
 controller.attachEditorSubscription();
 renderAll();
 setStatus('已打开 · 编辑状态');
 } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true);
 } finally { busy = false;
 } }
    async function newDeck(): Promise<void> { if (!busy) await openAsset(await engine.createBlank(titleInput.value.trim() || '未命名公开课'));
 }
    async function openFile(file: File): Promise<void> { if (!busy) await openAsset(await createWebPptAssetFromBytes(file.name.replace(/\.pptx?$/i, '') || '本地公开课', new Uint8Array(await file.arrayBuffer())));
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
 const session = await engine.mountPlayer(canvas, asset, { context: { sessionId: 'local-preview', surface: 'teacher-runtime' } });
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
 fileInput.accept = '.ppt,.pptx';
 fileInput.hidden = true;
 fileInput.addEventListener('change', () => { const file = fileInput.files?.[0];
 if (file) void openFile(file);
 fileInput.value = '';
 });
 const imageInput = document.createElement('input');
 imageInput.type = 'file';
 imageInput.accept = 'image/png,image/jpeg,image/gif,image/webp';
 imageInput.hidden = true;
 imageInput.addEventListener('change', () => { const file = imageInput.files?.[0];
 if (file) void (async () => { try { const id = await controller.addImage(file);
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
 renderAll(false);
 });
 webPpt.subscribe(() => renderAll(false));
 controller.subscribe(() => renderAll(false));
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
 void (async () => { const draft = await loadWebPptDraft();
 await openAsset(draft ?? await engine.createBlank('未命名公开课'));
 })();
}
function isTypingTarget(target: EventTarget | null): boolean { const element = target as HTMLElement | null;
 return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.isContentEditable === true;
 }
