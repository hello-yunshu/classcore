import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
import type { PresentationEngineAdapter } from '@classroom/presentation';
import {
    createWebPptAdapter,
    WebPptPresentationEngineAdapter,
    createWebPptAssetFromBytes,
    type WebPptPresentationAsset,
} from '@classroom/presentation-webppt-adapter';
export const surface = getSurfaceDescriptor('authoring-studio');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS['authoring-studio'];
export interface StudioBootstrap {
    engine: PresentationEngineAdapter;
}

export type StudioElementKind = 'text' | 'shape' | 'image' | 'svg';
export interface StudioElement {
    id: string;
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
export interface StudioScene {
    id: string;
    title: string;
    elements: StudioElement[];
    steps: number;
}
export interface StudioDocument {
    format: 'classcore-scene-studio-v1';
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

export function cloneScene(document: StudioDocument, sceneId: string): StudioDocument {
    const scene = document.scenes.find(item => item.id === sceneId);
    if (!scene)
        return document;
    const copy: StudioScene = structuredClone(scene);
    copy.id = nextId('scene');
    copy.title = `${scene.title} 副本`;
    copy.elements = copy.elements.map(element => ({ ...element, id: nextId('element') }));
    const index = document.scenes.findIndex(item => item.id === sceneId);
    return { ...document, scenes: [...document.scenes.slice(0, index + 1), copy, ...document.scenes.slice(index + 1)] };
}

export function addScene(document: StudioDocument): StudioDocument {
    const next = document.scenes.length + 1;
    return { ...document, scenes: [...document.scenes, { id: nextId('scene'), title: `第 ${next} 页`, elements: [], steps: 1 }] };
}

export function removeScene(document: StudioDocument, sceneId: string): StudioDocument {
    if (document.scenes.length <= 1)
        return document;
    return { ...document, scenes: document.scenes.filter(scene => scene.id !== sceneId) };
}

export function moveScene(document: StudioDocument, sceneId: string, direction: -1 | 1): StudioDocument {
    const index = document.scenes.findIndex(scene => scene.id === sceneId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= document.scenes.length)
        return document;
    const scenes = [...document.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    return { ...document, scenes };
}

export function addElement(document: StudioDocument, sceneId: string, element: Omit<StudioElement, 'id' | 'zIndex'>): StudioDocument {
    return mapScene(document, sceneId, scene => ({ ...scene, elements: [...scene.elements, { ...element, id: nextId('element'), zIndex: scene.elements.length + 1 }] }));
}

export function updateElement(document: StudioDocument, sceneId: string, elementId: string, patch: Partial<StudioElement>): StudioDocument {
    return mapScene(document, sceneId, scene => ({ ...scene, elements: scene.elements.map(element => element.id === elementId ? { ...element, ...patch } : element) }));
}

export function moveElementLayer(document: StudioDocument, sceneId: string, elementId: string, direction: -1 | 1): StudioDocument {
    const scene = document.scenes.find(item => item.id === sceneId);
    if (!scene)
        return document;
    const index = scene.elements.findIndex(element => element.id === elementId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= scene.elements.length)
        return document;
    const elements = [...scene.elements];
    [elements[index], elements[target]] = [elements[target], elements[index]];
    return mapScene(document, sceneId, current => ({ ...current, elements: elements.map((element, elementIndex) => ({ ...element, zIndex: elementIndex + 1 })) }));
}

function mapScene(document: StudioDocument, sceneId: string, mapper: (scene: StudioScene) => StudioScene): StudioDocument {
    return { ...document, scenes: document.scenes.map(scene => scene.id === sceneId ? mapper(scene) : scene) };
}

function nextId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const STORAGE_KEY = 'classcore.presentation-studio.deck.v1';

function loadStudioDocument(): StudioDocument {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (!raw)
            return createBlankStudioDocument();
        const parsed = JSON.parse(raw) as StudioDocument;
        if (parsed?.format !== 'classcore-scene-studio-v1' || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0)
            return createBlankStudioDocument();
        return parsed;
    }
    catch {
        return createBlankStudioDocument();
    }
}

function saveStudioDocument(document: StudioDocument): string {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(document));
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function makeIconSvg(variant: 'burst' | 'grid'): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    if (variant === 'burst') {
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '50,4 61,36 92,18 69,45 98,58 65,58 72,94 50,66 28,94 35,58 2,58 31,45 8,18 39,36');
        polygon.setAttribute('fill', '#d66b52');
        svg.append(polygon);
    }
    else {
        for (let index = 0; index < 4; index++) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(20 + index * 20));
            line.setAttribute('x2', String(20 + index * 20));
            line.setAttribute('y1', '10');
            line.setAttribute('y2', '90');
            line.setAttribute('stroke', '#5375b8');
            line.setAttribute('stroke-width', '4');
            svg.append(line);
        }
    }
    return svg;
}

function makeElementNode(element: StudioElement): HTMLElement {
    const node = document.createElement('div');
    node.className = `studio-element studio-element-${element.kind}`;
    node.dataset.elementId = element.id;
    node.style.left = `${element.x}px`;
    node.style.top = `${element.y}px`;
    node.style.width = `${element.width}px`;
    node.style.height = `${element.height}px`;
    node.style.zIndex = String(element.zIndex);
    if (element.kind === 'text') {
        node.textContent = element.text ?? '双击编辑文字';
        node.style.color = element.color ?? '#24324b';
    }
    if (element.kind === 'shape') {
        node.style.background = element.color ?? '#5375b8';
        node.classList.toggle('is-circle', element.shape === 'circle');
    }
    if (element.kind === 'image') {
        const image = document.createElement('img');
        image.alt = element.text ?? '课件图片';
        image.src = element.src ?? '';
        node.append(image);
    }
    if (element.kind === 'svg')
        node.append(makeIconSvg(element.svgVariant ?? 'burst'));
    return node;
}

function iconLabel(text: string, className = ''): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
}

export function mountPresentationStudio(root: HTMLElement): void {
    const templateUrl = '/assets/presentation-webppt-blank.pptx';
    const engine = new WebPptPresentationEngineAdapter(async () => {
        const response = await fetch(templateUrl);
        if (!response.ok)
            throw new Error(`presentation-template-http-${response.status}`);
        return new Uint8Array(await response.arrayBuffer());
    });
    const webPpt = createWebPptAdapter();
    let asset: WebPptPresentationAsset | null = null;
    let preview: { root: HTMLElement; session: Awaited<ReturnType<typeof engine.mountPlayer>> } | null = null;
    let savedAt = '';
    let busy = false;

    root.replaceChildren();
    const app = document.createElement('div');
    app.className = 'studio-app';
    root.append(app);
    const header = document.createElement('header');
    header.className = 'studio-header';
    const brand = document.createElement('div');
    brand.className = 'studio-brand';
    brand.innerHTML = '<span class="brand-square">C</span><div><span class="eyebrow">Authoring Studio · web-ppt PoC</span><h1>课堂课件工作台</h1></div>';
    const status = document.createElement('div');
    status.className = 'studio-header-actions';
    const statusMessage = document.createElement('span');
    statusMessage.className = 'saved-note';
    const statusActions = document.createElement('span');
    statusActions.className = 'studio-header-actions';
    status.append(statusMessage, statusActions);
    header.append(brand, status);
    app.append(header);
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
    const stageTitle = document.createElement('div');
    stageTitle.className = 'stage-titlebar';
    const stageTools = document.createElement('div');
    stageTools.className = 'element-toolbar';
    const editorHost = document.createElement('div');
    editorHost.className = 'studio-stage web-ppt-stage';
    const selectionPane = document.createElement('div');
    selectionPane.className = 'web-ppt-selection-pane';
    stagePanel.append(stageTitle, stageTools, editorHost);

    function button(label: string, action: () => void | Promise<void>, className = ''): HTMLButtonElement {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = className;
        item.textContent = label;
        item.addEventListener('click', () => { void action(); });
        return item;
    }
    function currentSession() {
        return webPpt.snapshot.session;
    }
    function currentSceneId(): string | null {
        return webPpt.snapshot.slideId ?? currentSession()?.editor.doc.slideOrder[0] ?? null;
    }
    function setStatus(text: string, error = false): void {
        statusMessage.replaceChildren(iconLabel(text, error ? 'saved-note status-error' : 'saved-note'));
    }
    function renderChrome(): void {
        const session = currentSession();
        const slides = session?.editor.doc.slideOrder ?? [];
        const active = currentSceneId();
        sceneList.replaceChildren();
        const heading = document.createElement('div');
        heading.className = 'panel-heading';
        heading.innerHTML = `<span>页面</span><span class="count-pill">${slides.length}</span>`;
        scenePanel.replaceChildren(heading, sceneList);
        slides.forEach((sceneId: string, index: number) => {
            const item = button(`${String(index + 1).padStart(2, '0')}  页面 ${index + 1}`, () => {
                webPpt.setView({ slideId: sceneId, mode: 'edit' });
                renderChrome();
            }, `scene-thumb${sceneId === active ? ' active' : ''}`);
            sceneList.append(item);
        });
        const sceneActions = document.createElement('div');
        sceneActions.className = 'scene-actions';
        sceneActions.append(
            button('+ 新页面', () => {
                const current = currentSession();
                if (!current)
                    return;
                const result = current.editor.exec({ type: 'AddSlide', layoutId: current.editor.doc.layoutOrder[0], at: { after: currentSceneId() } });
                const next = [...result.createdSlides][0];
                if (next)
                    webPpt.setView({ slideId: next, mode: 'edit' });
                renderChrome();
            }, 'add-scene-button'),
            button('复制', () => {
                const current = currentSession();
                const id = currentSceneId();
                if (!current || !id)
                    return;
                const result = current.editor.exec({ type: 'DuplicateSlide', id });
                const next = [...result.createdSlides][0];
                if (next)
                    webPpt.setView({ slideId: next, mode: 'edit' });
                renderChrome();
            }, 'small-button'),
        );
        scenePanel.append(sceneActions);
        const sceneIndex = Math.max(0, slides.indexOf(active ?? ''));
        stageTitle.innerHTML = `<div><span class="eyebrow">正在编辑 · ${asset?.engine.engineId ?? '未打开'}</span><strong>${escapeText(asset?.title ?? '请新建或打开课件')}</strong></div><span class="format-note">16:9 · 本地离线引擎</span>`;
        stageTools.replaceChildren();
        stageTools.append(
            button('撤销', () => { webPpt.undo(); renderChrome(); }, 'small-button'),
            button('重做', () => { webPpt.redo(); renderChrome(); }, 'small-button'),
            button('图形', () => {
                const current = currentSession();
                const id = currentSceneId();
                if (!current || !id)
                    return;
                current.editor.exec({ type: 'AddShape', slideId: id, preset: 'roundRect', rect: { x: 280, y: 260, w: 220, h: 120 } });
                renderChrome();
            }, 'small-button'),
            button('加入淡入步骤', () => {
                const current = currentSession();
                const id = currentSceneId();
                const elementId = current?.editor.selection.kind === 'elements' ? current.editor.selection.ids[0] : null;
                if (!current || !id || !elementId)
                    return;
                current.editor.exec({ type: 'SetAnimations', slideId: id, steps: [{ target: elementId, kind: 'entrance', effect: 'fade', trigger: 'click', delayMs: 0, durationMs: 300 }] });
                renderChrome();
            }, 'small-button'),
        );
        inspector.replaceChildren();
        const inspectorHeading = document.createElement('div');
        inspectorHeading.className = 'panel-heading';
        inspectorHeading.innerHTML = '<span>引擎状态</span><span class="inspector-state">稳定身份 / 可保存</span>';
        inspector.append(inspectorHeading, selectionPane);
        const note = document.createElement('p');
        note.className = 'inspector-note';
        note.textContent = `第 ${sceneIndex + 1} 页 · ${webPpt.snapshot.status} · 可用撤销 ${session?.editor.history.undoCount ?? 0} 次`;
        inspector.append(note);
        if (savedAt)
            inspector.append(iconLabel(`已保存 ${savedAt}`, 'saved-note'));
    }
    async function persist(): Promise<void> {
        if (!asset)
            return;
        const bytes = await webPpt.save();
        const saved = await createWebPptAssetFromBytes(asset.title, bytes, asset.document.idPrefix);
        asset = { ...asset, source: saved.source, updatedAt: new Date().toISOString() };
        await persistWebPptDraft(asset);
        savedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setStatus(`已保存 ${savedAt}`);
    }
    async function publish(): Promise<void> {
        if (!asset)
            return;
        const result = await engine.validate(asset);
        if (!result.valid) {
            setStatus(`发布阻断：${result.errors.join('、')}`, true);
            return;
        }
        const index = await engine.buildRuntimeIndex(asset);
        await persist();
        setStatus(`已冻结发布 · ${index.scenes.length} 页 · ${asset.source?.sha256?.slice(0, 12) ?? 'no-fingerprint'}`);
    }
    async function openAsset(next: WebPptPresentationAsset): Promise<void> {
        busy = true;
        setStatus('正在打开课件…');
        try {
            asset = next;
            await webPpt.applyBinding({ source: next.source!.bytes, openOptions: { idPrefix: next.document.idPrefix }, mode: 'edit', textMode: 'svg' });
            webPpt.attach(editorHost);
            webPpt.attachSelectionPane(selectionPane);
            renderChrome();
            setStatus('已打开 · 编辑状态');
        }
        catch (error) {
            setStatus(error instanceof Error ? error.message : String(error), true);
        }
        finally {
            busy = false;
        }
    }
    async function newDeck(): Promise<void> {
        if (busy)
            return;
        await openAsset(await engine.createBlank('未命名公开课'));
    }
    async function openFile(file: File): Promise<void> {
        if (busy)
            return;
        await openAsset(await createWebPptAssetFromBytes(file.name.replace(/\.pptx?$/i, '') || '本地公开课', new Uint8Array(await file.arrayBuffer())));
    }
    async function togglePreview(): Promise<void> {
        if (!asset || busy)
            return;
        if (preview) {
            preview.session.dispose();
            preview.root.remove();
            preview = null;
            renderChrome();
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'preview-overlay';
        const canvas = document.createElement('div');
        canvas.className = 'preview-canvas web-ppt-preview';
        overlay.append(canvas);
        app.append(overlay);
        const session = await engine.mountPlayer(canvas, asset, { context: { sessionId: 'local-preview', surface: 'teacher-runtime' } });
        preview = { root: overlay, session };
        const controls = document.createElement('div');
        controls.className = 'preview-controls';
        controls.append(button('上一步', () => { void preview?.session.previous?.(); }, 'preview-nav'), button('下一步', () => { void preview?.session.nextStep?.(); }, 'preview-nav'), button('退出预览', () => { void togglePreview(); }, 'preview-exit'));
        overlay.append(controls);
    }
    const newButton = button('新建', () => { void newDeck(); }, 'small-button');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.ppt,.pptx';
    fileInput.hidden = true;
    fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (file) void openFile(file); fileInput.value = ''; });
    statusActions.append(
        newButton,
        button('打开 PPTX', () => fileInput.click(), 'small-button'),
        button('保存', () => { void persist(); }, 'save-deck-button'),
        button('重开', () => { if (asset) void openAsset({ ...asset, source: { ...asset.source!, bytes: new Uint8Array(asset.source!.bytes) } }); }, 'small-button'),
        button('发布', () => { void publish(); }, 'small-button'),
        button('预览播放', () => { void togglePreview(); }, 'preview-button'),
        fileInput,
    );
    webPpt.subscribe(() => { renderChrome(); });
    renderChrome();
    void (async () => {
        const draft = await loadWebPptDraft();
        await openAsset(draft ?? await engine.createBlank('未命名公开课'));
    })();
}

function escapeText(value: string): string {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

interface StoredDraftMetadata {
    presentationSchemaVersion: 1;
    deckId: string;
    title: string;
    engine: WebPptPresentationAsset['engine'];
    document: WebPptPresentationAsset['document'];
    classroomBindings: WebPptPresentationAsset['classroomBindings'];
    createdAt: string;
    updatedAt: string;
    source: { kind: 'bytes'; mimeType: string; sha256?: string };
}

const DRAFT_DB = 'classcore-presentation-drafts-v1';
const DRAFT_STORE = 'assets';
const DRAFT_META_KEY = 'classcore.presentation.draft.meta.v1';

function openDraftDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DRAFT_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(DRAFT_STORE, { keyPath: 'deckId' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('presentation-draft-db-open-failed'));
    });
}

async function persistWebPptDraft(asset: WebPptPresentationAsset): Promise<void> {
    const source = asset.source;
    if (!source)
        throw new Error('presentation-source-required-for-save');
    const metadata: StoredDraftMetadata = {
        presentationSchemaVersion: 1,
        deckId: asset.deckId,
        title: asset.title,
        engine: asset.engine,
        document: asset.document,
        classroomBindings: asset.classroomBindings,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        source: { kind: 'bytes', mimeType: source.mimeType, sha256: source.sha256 },
    };
    localStorage.setItem(DRAFT_META_KEY, JSON.stringify(metadata));
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
        const request = db.transaction(DRAFT_STORE, 'readwrite').objectStore(DRAFT_STORE).put({ deckId: asset.deckId, bytes: source.bytes });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('presentation-draft-save-failed'));
    });
    db.close();
}

async function loadWebPptDraft(): Promise<WebPptPresentationAsset | null> {
    try {
        const metadata = JSON.parse(localStorage.getItem(DRAFT_META_KEY) ?? 'null') as StoredDraftMetadata | null;
        if (!metadata || metadata.engine.engineId !== 'web-ppt')
            return null;
        const db = await openDraftDb();
        const row = await new Promise<{ bytes: Uint8Array } | undefined>((resolve, reject) => {
            const request = db.transaction(DRAFT_STORE, 'readonly').objectStore(DRAFT_STORE).get(metadata.deckId);
            request.onsuccess = () => resolve(request.result as { bytes: Uint8Array } | undefined);
            request.onerror = () => reject(request.error ?? new Error('presentation-draft-load-failed'));
        });
        db.close();
        if (!row?.bytes)
            return null;
        return { ...metadata, source: { ...metadata.source, bytes: new Uint8Array(row.bytes) } };
    }
    catch {
        return null;
    }
}
