import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
import type { PresentationEngineAdapter } from '@classroom/presentation';
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
    let documentModel = loadStudioDocument();
    let activeSceneId = documentModel.scenes[0].id;
    let selectedElementId: string | null = documentModel.scenes[0].elements[0]?.id ?? null;
    let previewing = false;
    let previewIndex = 0;
    let drag: { elementId: string; startX: number; startY: number; originX: number; originY: number } | null = null;
    root.replaceChildren();
    const app = document.createElement('div');
    app.className = 'studio-app';
    root.append(app);
    const header = document.createElement('header');
    header.className = 'studio-header';
    header.innerHTML = '<div class="studio-brand"><span class="brand-square">C</span><div><span class="eyebrow">Authoring Studio · D2 Alpha</span><h1>课堂课件工作台</h1></div></div><div class="studio-header-actions" id="studio-status"></div>';
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
    const stage = document.createElement('div');
    stage.className = 'studio-stage';
    const elementToolbar = document.createElement('div');
    elementToolbar.className = 'element-toolbar';
    const status = header.querySelector<HTMLElement>('#studio-status');

    function currentScene(): StudioScene {
        return documentModel.scenes.find(scene => scene.id === activeSceneId) ?? documentModel.scenes[0];
    }
    function update(next: StudioDocument): void {
        documentModel = next;
        if (!documentModel.scenes.some(scene => scene.id === activeSceneId))
            activeSceneId = documentModel.scenes[0].id;
        if (!currentScene().elements.some(element => element.id === selectedElementId))
            selectedElementId = currentScene().elements[0]?.id ?? null;
        render();
    }
    function button(label: string, action: () => void, className = ''): HTMLButtonElement {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = className;
        item.textContent = label;
        item.addEventListener('click', action);
        return item;
    }
    function render(): void {
        const scene = currentScene();
        sceneList.replaceChildren();
        const sceneHeading = document.createElement('div');
        sceneHeading.className = 'panel-heading';
        sceneHeading.innerHTML = '<span>页面</span><span class="count-pill">' + documentModel.scenes.length + '</span>';
        scenePanel.replaceChildren(sceneHeading, sceneList);
        for (const [index, item] of documentModel.scenes.entries()) {
            const sceneButton = button('', () => { activeSceneId = item.id; selectedElementId = item.elements[0]?.id ?? null; render(); }, `scene-thumb${item.id === activeSceneId ? ' active' : ''}`);
            const number = document.createElement('span');
            number.className = 'scene-number';
            number.textContent = String(index + 1).padStart(2, '0');
            const thumb = document.createElement('span');
            thumb.className = 'scene-mini-canvas';
            thumb.textContent = item.title;
            sceneButton.append(number, thumb);
            sceneList.append(sceneButton);
        }
        const sceneActions = document.createElement('div');
        sceneActions.className = 'scene-actions';
        sceneActions.append(button('+ 新页面', () => { const next = addScene(documentModel); activeSceneId = next.scenes[next.scenes.length - 1].id; update(next); }, 'add-scene-button'));
        sceneActions.append(button('复制', () => { const next = cloneScene(documentModel, activeSceneId); activeSceneId = next.scenes.find((item, index) => item.id !== documentModel.scenes[index]?.id)?.id ?? activeSceneId; update(next); }, 'small-button'));
        sceneActions.append(button('删除', () => update(removeScene(documentModel, activeSceneId)), 'small-button'));
        scenePanel.append(sceneActions);
        stagePanel.replaceChildren();
        const stageTitle = document.createElement('div');
        stageTitle.className = 'stage-titlebar';
        stageTitle.innerHTML = `<div><span class="eyebrow">正在编辑</span><strong>${escapeText(scene.title)}</strong></div><span class="format-note">16:9 · 网页原生</span>`;
        stagePanel.append(stageTitle, elementToolbar, stage);
        stage.replaceChildren();
        for (const element of [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)) {
            const node = makeElementNode(element);
            node.classList.toggle('selected', element.id === selectedElementId);
            node.addEventListener('pointerdown', event => {
                event.preventDefault();
                selectedElementId = element.id;
                drag = { elementId: element.id, startX: event.clientX, startY: event.clientY, originX: element.x, originY: element.y };
                node.setPointerCapture(event.pointerId);
                render();
            });
            node.addEventListener('pointermove', event => {
                if (!drag || drag.elementId !== element.id)
                    return;
                update(updateElement(documentModel, activeSceneId, element.id, { x: Math.max(0, drag.originX + event.clientX - drag.startX), y: Math.max(0, drag.originY + event.clientY - drag.startY) }));
            });
            node.addEventListener('pointerup', () => { drag = null; });
            stage.append(node);
        }
        elementToolbar.replaceChildren();
        const addTool = (label: string, action: () => void): void => elementToolbar.append(button(label, action));
        addTool('文字', () => update(addElement(documentModel, activeSceneId, { kind: 'text', x: 120, y: 250, width: 420, height: 66, text: '新的课堂提示', color: '#24324b' })));
        addTool('图形', () => update(addElement(documentModel, activeSceneId, { kind: 'shape', shape: 'rectangle', x: 220, y: 270, width: 150, height: 96, color: '#5375b8' })));
        addTool('图片', () => { const src = window.prompt('输入图片 URL（也可以使用公开 SVG 地址）'); if (src) update(addElement(documentModel, activeSceneId, { kind: 'image', x: 260, y: 210, width: 220, height: 140, src, text: '课堂图片' })); });
        addTool('SVG 图案', () => update(addElement(documentModel, activeSceneId, { kind: 'svg', svgVariant: 'burst', x: 460, y: 220, width: 150, height: 150 })));
        const selected = scene.elements.find(element => element.id === selectedElementId);
        inspector.replaceChildren();
        const inspectorHeading = document.createElement('div');
        inspectorHeading.className = 'panel-heading';
        inspectorHeading.innerHTML = '<span>属性</span><span class="inspector-state">' + (selected ? '已选择' : '未选择') + '</span>';
        inspector.append(inspectorHeading);
        if (selected) {
            const propertyGrid = document.createElement('div');
            propertyGrid.className = 'property-grid';
            for (const key of ['x', 'y', 'width', 'height'] as const) {
                const label = document.createElement('label');
                label.textContent = key === 'x' ? '横向' : key === 'y' ? '纵向' : key === 'width' ? '宽度' : '高度';
                const input = document.createElement('input');
                input.type = 'number';
                input.value = String(Math.round(selected[key]));
                input.addEventListener('change', () => update(updateElement(documentModel, activeSceneId, selected.id, { [key]: Number(input.value) })));
                label.append(input);
                propertyGrid.append(label);
            }
            inspector.append(propertyGrid);
            if (selected.kind === 'text') {
                const text = document.createElement('textarea');
                text.value = selected.text ?? '';
                text.placeholder = '输入课堂文字';
                text.addEventListener('change', () => update(updateElement(documentModel, activeSceneId, selected.id, { text: text.value })));
                inspector.append(text);
            }
            const layers = document.createElement('div');
            layers.className = 'layer-actions';
            layers.append(button('上移图层', () => update(moveElementLayer(documentModel, activeSceneId, selected.id, 1)), 'small-button'), button('下移图层', () => update(moveElementLayer(documentModel, activeSceneId, selected.id, -1)), 'small-button'));
            inspector.append(layers);
        }
        const sceneControls = document.createElement('div');
        sceneControls.className = 'scene-reorder';
        sceneControls.append(button('← 页面前移', () => update(moveScene(documentModel, activeSceneId, -1)), 'small-button'), button('页面后移 →', () => update(moveScene(documentModel, activeSceneId, 1)), 'small-button'));
        inspector.append(sceneControls);
        if (status) {
            const saveButton = button('保存课件', () => {
                const at = saveStudioDocument(documentModel);
                status.dataset.saved = at;
                render();
            }, 'save-deck-button');
            const previewButton = button(previewing ? '关闭预览' : '预览播放', () => {
                previewing = !previewing;
                previewIndex = documentModel.scenes.findIndex(item => item.id === activeSceneId);
                render();
            }, 'preview-button');
            status.replaceChildren(saveButton, previewButton);
            if (status.dataset.saved)
                status.append(iconLabel(`已保存 ${status.dataset.saved}`, 'saved-note'));
        }
        if (previewing)
            renderPreview();
    }
    function renderPreview(): void {
        const overlay = document.createElement('div');
        overlay.className = 'preview-overlay';
        const scene = documentModel.scenes[previewIndex] ?? documentModel.scenes[0];
        const previewCanvas = document.createElement('div');
        previewCanvas.className = 'preview-canvas';
        for (const element of scene.elements)
            previewCanvas.append(makeElementNode(element));
        const caption = document.createElement('div');
        caption.className = 'preview-caption';
        caption.textContent = `${String(previewIndex + 1).padStart(2, '0')} / ${documentModel.scenes.length}  ·  ${scene.title}`;
        const controls = document.createElement('div');
        controls.className = 'preview-controls';
        controls.append(button('‹', () => { previewIndex = Math.max(0, previewIndex - 1); render(); }, 'preview-nav'), button('退出预览', () => { previewing = false; render(); }, 'preview-exit'), button('›', () => { previewIndex = Math.min(documentModel.scenes.length - 1, previewIndex + 1); render(); }, 'preview-nav'));
        overlay.append(previewCanvas, caption, controls);
        app.append(overlay);
    }
    render();
}

function escapeText(value: string): string {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}
