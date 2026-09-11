import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
export const surface = getSurfaceDescriptor('student');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS.student;

export type TransformMode = 'select' | 'pan' | 'rotate-center';
export interface TransformPoint {
    x: number;
    y: number;
}
export interface TransformObject {
    id: string;
    label: string;
    kind: 'triangle' | 'square' | 'arch';
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    rotationCenter: TransformPoint;
    zIndex: number;
}
export interface TransformBoardState {
    objects: Record<string, TransformObject>;
    selectedObjectId: string | null;
    mode: TransformMode;
    pan: TransformPoint;
    savedAt: string | null;
}

export type TransformAction =
    | { type: 'select'; objectId: string | null }
    | { type: 'move'; objectId: string; dx: number; dy: number }
    | { type: 'rotate'; objectId: string; delta: number }
    | { type: 'set-rotation-center'; objectId: string; x: number; y: number }
    | { type: 'set-mode'; mode: TransformMode }
    | { type: 'pan'; dx: number; dy: number }
    | { type: 'reset' }
    | { type: 'mark-saved'; savedAt: string };

const INITIAL_OBJECTS: Record<string, TransformObject> = {
    fragmentA: { id: 'fragmentA', label: 'A', kind: 'triangle', x: 112, y: 110, width: 126, height: 112, rotation: -8, rotationCenter: { x: 0.5, y: 0.5 }, zIndex: 1 },
    fragmentB: { id: 'fragmentB', label: 'B', kind: 'square', x: 306, y: 164, width: 112, height: 112, rotation: 12, rotationCenter: { x: 0.5, y: 0.5 }, zIndex: 2 },
    fragmentC: { id: 'fragmentC', label: 'C', kind: 'arch', x: 512, y: 104, width: 138, height: 124, rotation: 5, rotationCenter: { x: 0.5, y: 0.5 }, zIndex: 3 },
};

export function createInitialTransformBoardState(): TransformBoardState {
    return {
        objects: structuredClone(INITIAL_OBJECTS),
        selectedObjectId: 'fragmentA',
        mode: 'select',
        pan: { x: 0, y: 0 },
        savedAt: null,
    };
}

export function reduceTransformBoard(state: TransformBoardState, action: TransformAction): TransformBoardState {
    if (action.type === 'reset')
        return createInitialTransformBoardState();
    if (action.type === 'select')
        return { ...state, selectedObjectId: action.objectId };
    if (action.type === 'set-mode')
        return { ...state, mode: action.mode };
    if (action.type === 'mark-saved')
        return { ...state, savedAt: action.savedAt };
    if (action.type === 'pan')
        return { ...state, pan: { x: state.pan.x + action.dx, y: state.pan.y + action.dy } };
    const object = state.objects[action.objectId];
    if (!object)
        return state;
    const objects = { ...state.objects };
    if (action.type === 'move')
        objects[action.objectId] = { ...object, x: object.x + action.dx, y: object.y + action.dy };
    if (action.type === 'rotate')
        objects[action.objectId] = { ...object, rotation: normalizeDegrees(object.rotation + action.delta) };
    if (action.type === 'set-rotation-center')
        objects[action.objectId] = { ...object, rotationCenter: { x: clamp(action.x, 0, 1), y: clamp(action.y, 0, 1) } };
    return { ...state, objects, selectedObjectId: action.type === 'set-rotation-center' ? action.objectId : state.selectedObjectId };
}

export function normalizeDegrees(value: number): number {
    return ((value + 180) % 360 + 360) % 360 - 180;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

const STORAGE_KEY = 'classcore.student.transform-board.v1';
const COLORS: Record<TransformObject['kind'], string> = {
    triangle: '#e6a23c',
    square: '#5375b8',
    arch: '#d66b52',
};

function restoreBoard(): TransformBoardState {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (!raw)
            return createInitialTransformBoardState();
        const parsed = JSON.parse(raw) as TransformBoardState;
        if (!parsed || typeof parsed !== 'object' || !parsed.objects)
            return createInitialTransformBoardState();
        return { ...createInitialTransformBoardState(), ...parsed, mode: 'select' };
    }
    catch {
        return createInitialTransformBoardState();
    }
}

function saveBoard(state: TransformBoardState): TransformBoardState {
    const savedAt = new Date().toISOString();
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt }));
    return { ...state, savedAt };
}

function iconLabel(text: string, className = ''): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
}

function button(label: string, action: () => void, className = ''): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = label;
    element.addEventListener('click', action);
    return element;
}

function objectShape(kind: TransformObject['kind']): string {
    if (kind === 'triangle')
        return 'polygon(50% 0, 100% 100%, 0 100%)';
    if (kind === 'arch')
        return 'polygon(0 100%, 0 38%, 18% 12%, 50% 0, 82% 12%, 100% 38%, 100% 100%, 70% 100%, 70% 50%, 50% 34%, 30% 50%, 30% 100%)';
    return 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
}

export function mountStudentPractice(root: HTMLElement): void {
    let state = restoreBoard();
    let drag: { objectId: string | null; startX: number; startY: number; startAngle: number; startRotation: number; kind: 'move' | 'pan' | 'rotate' } | null = null;
    root.replaceChildren();
    const app = document.createElement('div');
    app.className = 'student-app';
    root.append(app);

    const header = document.createElement('header');
    header.className = 'student-header';
    header.innerHTML = '<div><span class="eyebrow">图案的还原 · 练习 01</span><h1>把碎片转回完整图案</h1></div><div class="header-status"><span class="status-dot"></span><span id="save-status">本地练习</span></div>';
    app.append(header);

    const layout = document.createElement('main');
    layout.className = 'student-layout';
    const side = document.createElement('aside');
    side.className = 'student-brief';
    side.innerHTML = [
        '<span class="step-mark">先观察，再动手</span>',
        '<h2>试着让三个碎片<br>拼回目标图案。</h2>',
        '<p>选择碎片后拖动它。打开“旋转中心”，再点一下碎片上的位置，看看旋转会发生什么变化。</p>',
        '<div class="target-card"><div class="target-title">目标轮廓</div>',
        '<div class="target-art"><span></span><span></span><span></span></div>',
        '<div class="target-caption">不追求一次完成，<br>每一步都会自动保存在本机。</div></div>',
        '<div class="tip"><strong>小提示</strong><span>旋转中心不一定在正中央。</span></div>',
    ].join('');
    layout.append(side);

    const workspace = document.createElement('section');
    workspace.className = 'student-workspace';
    const toolbar = document.createElement('div');
    toolbar.className = 'board-toolbar';
    const modeLabel = document.createElement('span');
    modeLabel.className = 'toolbar-label';
    toolbar.append(modeLabel);
    const modeButtons = document.createElement('div');
    modeButtons.className = 'mode-buttons';
    const modeSelect = button('选择', () => setState(reduceTransformBoard(state, { type: 'set-mode', mode: 'select' })), 'tool-button');
    const modePan = button('平移画布', () => setState(reduceTransformBoard(state, { type: 'set-mode', mode: 'pan' })), 'tool-button');
    const modeCenter = button('旋转中心', () => setState(reduceTransformBoard(state, { type: 'set-mode', mode: 'rotate-center' })), 'tool-button');
    modeButtons.append(modeSelect, modePan, modeCenter);
    toolbar.append(modeButtons);
    const toolbarActions = document.createElement('div');
    toolbarActions.className = 'toolbar-actions';
    toolbarActions.append(button('重置', () => setState(reduceTransformBoard(state, { type: 'reset' })), 'quiet-button'));
    toolbarActions.append(button('保存进度', () => setState(saveBoard(state)), 'primary-button'));
    toolbar.append(toolbarActions);
    workspace.append(toolbar);

    const boardFrame = document.createElement('div');
    boardFrame.className = 'board-frame';
    const board = document.createElement('div');
    board.className = 'transform-board';
    boardFrame.append(board);
    workspace.append(boardFrame);
    const selectionBar = document.createElement('div');
    selectionBar.className = 'selection-bar';
    workspace.append(selectionBar);
    layout.append(workspace);
    app.append(layout);

    function setState(next: TransformBoardState): void {
        state = next;
        render();
    }

    function render(): void {
        const selected = state.selectedObjectId ? state.objects[state.selectedObjectId] : null;
        modeLabel.textContent = state.mode === 'rotate-center' ? '点击碎片设置旋转中心' : state.mode === 'pan' ? '拖动画布查看全局' : selected ? `已选择碎片 ${selected.label}` : '选择一个碎片开始';
        const modes: Array<[TransformMode, HTMLButtonElement]> = [['select', modeSelect], ['pan', modePan], ['rotate-center', modeCenter]];
        for (const [mode, element] of modes)
            element.classList.toggle('active', state.mode === mode);
        const saved = document.querySelector('#save-status');
        if (saved)
            saved.textContent = state.savedAt ? `已保存 ${new Date(state.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '本地练习';
        board.style.setProperty('--board-pan-x', `${state.pan.x}px`);
        board.style.setProperty('--board-pan-y', `${state.pan.y}px`);
        board.replaceChildren();
        for (const object of Object.values(state.objects).sort((a, b) => a.zIndex - b.zIndex)) {
            const element = document.createElement('button');
            element.type = 'button';
            element.className = `fragment fragment-${object.kind}${state.selectedObjectId === object.id ? ' selected' : ''}`;
            element.dataset.objectId = object.id;
            element.style.left = `${object.x}px`;
            element.style.top = `${object.y}px`;
            element.style.width = `${object.width}px`;
            element.style.height = `${object.height}px`;
            element.style.zIndex = String(object.zIndex);
            element.style.background = COLORS[object.kind];
            element.style.clipPath = objectShape(object.kind);
            element.style.transform = `rotate(${object.rotation}deg)`;
            element.setAttribute('aria-label', `碎片 ${object.label}`);
            element.append(iconLabel(object.label, 'fragment-label'));
            if (state.selectedObjectId === object.id) {
                const center = document.createElement('span');
                center.className = 'rotation-center';
                center.style.left = `${object.rotationCenter.x * 100}%`;
                center.style.top = `${object.rotationCenter.y * 100}%`;
                center.textContent = '＋';
                element.append(center);
                const handle = document.createElement('span');
                handle.className = 'rotation-handle';
                handle.setAttribute('aria-label', '拖动旋转');
                element.append(handle);
                handle.addEventListener('pointerdown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = element.getBoundingClientRect();
                    const centerX = rect.left + object.width * object.rotationCenter.x;
                    const centerY = rect.top + object.height * object.rotationCenter.y;
                    drag = { objectId: object.id, startX: event.clientX, startY: event.clientY, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX), startRotation: object.rotation, kind: 'rotate' };
                    element.setPointerCapture(event.pointerId);
                });
            }
            element.addEventListener('pointerdown', (event) => {
                if (state.mode === 'rotate-center') {
                    event.preventDefault();
                    const rect = element.getBoundingClientRect();
                    setState(reduceTransformBoard(state, { type: 'set-rotation-center', objectId: object.id, x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }));
                    return;
                }
                if (state.mode !== 'select')
                    return;
                event.preventDefault();
                setState(reduceTransformBoard(state, { type: 'select', objectId: object.id }));
                drag = { objectId: object.id, startX: event.clientX, startY: event.clientY, startAngle: 0, startRotation: object.rotation, kind: 'move' };
                element.setPointerCapture(event.pointerId);
            });
            element.addEventListener('pointermove', (event) => {
                if (!drag || drag.objectId !== object.id)
                    return;
                if (drag.kind === 'move') {
                    const dx = event.clientX - drag.startX;
                    const dy = event.clientY - drag.startY;
                    drag.startX = event.clientX;
                    drag.startY = event.clientY;
                    setState(reduceTransformBoard(state, { type: 'move', objectId: object.id, dx, dy }));
                }
                if (drag.kind === 'rotate') {
                    const rect = element.getBoundingClientRect();
                    const centerX = rect.left + object.width * object.rotationCenter.x;
                    const centerY = rect.top + object.height * object.rotationCenter.y;
                    const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
                    setState(reduceTransformBoard(state, { type: 'rotate', objectId: object.id, delta: (angle - drag.startAngle) * 180 / Math.PI + drag.startRotation - object.rotation }));
                }
            });
            element.addEventListener('pointerup', () => { drag = null; });
            board.append(element);
        }
        selectionBar.replaceChildren();
        if (selected) {
            const label = document.createElement('span');
            label.className = 'selected-name';
            label.textContent = `碎片 ${selected.label} · 旋转 ${Math.round(selected.rotation)}°`;
            selectionBar.append(label);
            selectionBar.append(button('↶ 15°', () => setState(reduceTransformBoard(state, { type: 'rotate', objectId: selected.id, delta: -15 })), 'rotate-button'));
            selectionBar.append(button('↷ 15°', () => setState(reduceTransformBoard(state, { type: 'rotate', objectId: selected.id, delta: 15 })), 'rotate-button'));
            const hint = document.createElement('span');
            hint.className = 'selection-hint';
            hint.textContent = '拖动圆点可自由旋转';
            selectionBar.append(hint);
        }
    }
    board.addEventListener('pointerdown', (event) => {
        if (state.mode !== 'pan' || event.target !== board)
            return;
        drag = { objectId: null, startX: event.clientX, startY: event.clientY, startAngle: 0, startRotation: 0, kind: 'pan' };
        board.setPointerCapture(event.pointerId);
    });
    board.addEventListener('pointermove', (event) => {
        if (!drag || drag.kind !== 'pan')
            return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        drag.startX = event.clientX;
        drag.startY = event.clientY;
        setState(reduceTransformBoard(state, { type: 'pan', dx, dy }));
    });
    board.addEventListener('pointerup', () => { drag = null; });
    render();
}
