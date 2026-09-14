import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
import { ClassroomClient, type ClassroomAppletDescriptor, type ClassroomCurrentActivity } from '@classroom/classroom-client';
import { AppletHostRuntime, AppletRegistry, type AppletHost } from '@classroom/applet-sdk';
import {
    createInitialTransformBoardState,
    commitPreview,
    isValidPivot,
    isTransformBoardSolved,
    normalizeDegrees,
    previewTranslate,
    previewRotation,
    reduceTransformBoard,
    restoreBoardState,
    selectPivot,
    serializeBoardState,
    TRANSFORM_BOARD_MANIFEST,
    createTransformBoardAppletFactory,
    translateGrid,
    type TransformAction,
    type TransformBoardState,
    type TransformMode,
    type TransformObject,
} from '@classroom/transform-board';
export const surface = getSurfaceDescriptor('student');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS.student;
export type { TransformAction, TransformBoardState, TransformMode, TransformObject };
export { createInitialTransformBoardState, commitPreview, isValidPivot, isTransformBoardSolved, normalizeDegrees, previewTranslate, previewRotation, reduceTransformBoard, restoreBoardState, selectPivot, serializeBoardState, translateGrid };

export type StudentMode = 'practice' | 'classroom';
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

const STORAGE_KEY = 'classcore.student.transform-board.v1';
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

export function mountStudentPractice(root: HTMLElement): void {
    let state = restoreBoard();
    let drag: { objectId: string | null; startX: number; startY: number; startAngle: number; startRotation: number; kind: 'move' | 'pan' | 'rotate' } | null = null;
    root.replaceChildren();
    const app = document.createElement('div');
    app.className = 'student-app';
    root.append(app);

    const header = document.createElement('header');
    header.className = 'student-header';
    header.innerHTML = '<div><span class="eyebrow">CLASSCORE · PRACTICE</span><h1>在画布上练习图形变换</h1></div><div class="header-status"><span class="status-dot"></span><span id="save-status">本地练习</span></div>';
    app.append(header);

    const layout = document.createElement('main');
    layout.className = 'student-layout';
    const side = document.createElement('aside');
    side.className = 'student-brief';
    side.innerHTML = [
        '<span class="step-mark">先观察，再动手</span>',
        '<h2>选择对象，练习<br>拖动与旋转。</h2>',
        '<p>选择对象后拖动它。打开“旋转中心”，再点一下对象上的位置，看看旋转会发生什么变化。</p>',
        '<div class="target-card"><div class="target-title">练习提示</div>',
        '<div class="target-caption">先观察，再操作。<br>每一步都会自动保存在本机。</div></div>',
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
        modeLabel.textContent = state.mode === 'rotate-center' ? '点击对象设置旋转中心' : state.mode === 'pan' ? '拖动画布查看全局' : selected ? `已选择对象 ${selected.label}` : '选择一个对象开始';
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
            element.className = `fragment fragment-${object.shape}${state.selectedObjectId === object.id ? ' selected' : ''}`;
            element.dataset.objectId = object.id;
            element.style.left = `${object.x}px`;
            element.style.top = `${object.y}px`;
            element.style.width = `${object.width}px`;
            element.style.height = `${object.height}px`;
            element.style.zIndex = String(object.zIndex);
            element.style.background = object.visual?.color ?? '#5575b8';
            element.style.clipPath = object.visual?.clipPath ?? 'none';
            element.style.transform = `rotate(${object.rotation}deg)`;
            element.setAttribute('aria-label', `对象 ${object.label}`);
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
            label.textContent = `对象 ${selected.label} · 旋转 ${Math.round(selected.rotation)}°`;
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

function activityConfig(descriptor: ClassroomAppletDescriptor): Record<string, unknown> {
    const payload = descriptor.config.payload;
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : descriptor.config;
}

function recordVocabularyFrom(config: Record<string, unknown>): ClassroomRecordVocabulary {
    const rules = config.rules && typeof config.rules === 'object' ? config.rules as Record<string, unknown> : null;
    const value = config.recordVocabulary ?? rules?.recordVocabulary;
    if (!value || typeof value !== 'object') return {};
    const vocabulary = value as Record<string, unknown>;
    const tokens = Array.isArray(vocabulary.tokens)
        ? vocabulary.tokens.filter(item => item && typeof item === 'object' && typeof (item as Record<string, unknown>).kind === 'string' && typeof (item as Record<string, unknown>).value === 'string' && typeof (item as Record<string, unknown>).display === 'string') as ClassroomRecordToken[]
        : [];
    return {
        label: typeof vocabulary.label === 'string' ? vocabulary.label : undefined,
        figurePrefix: typeof vocabulary.figurePrefix === 'string' ? vocabulary.figurePrefix : undefined,
        vertexPrefix: typeof vocabulary.vertexPrefix === 'string' ? vocabulary.vertexPrefix : undefined,
        tokens,
    };
}

function mountClassroomTransformBoard(root: HTMLElement, client: ClassroomClient, current: ClassroomCurrentActivity, descriptor: ClassroomAppletDescriptor): void {
    const grant = client.grant;
    const serverHello = client.state.serverHello;
    if (!grant || !serverHello) throw new Error('classroom-connection-context-missing');
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
        emitEvent: intent => client.emitEvent({
            appletInstanceId: descriptor.instance.appletInstanceId,
            appletEventSchemaVersion: 1,
            streamId,
            type: intent.type,
            payload: intent.payload,
        }),
        publishLiveState: payload => client.publishLiveState({
            sessionId: current.sessionId,
            activityId: current.activity.activityId,
            appletInstanceId: descriptor.instance.appletInstanceId,
            scope: { type: 'participant', id: grant.participantId },
            streamId: `live:${descriptor.instance.appletInstanceId}:${grant.participantId}`,
            seq: ++liveSeq,
            payload,
        }),
        requestAction: async () => { throw new Error('classroom-action-not-supported-in-student-slice'); },
        saveSnapshot: async state => {
            const next = {
                sessionId: current.sessionId,
                activityId: current.activity.activityId,
                appletInstanceId: descriptor.instance.appletInstanceId,
                scope: { type: 'participant' as const, id: grant.participantId },
                stateSchemaVersion: 1,
                revision: ++snapshotRevision,
                state,
                capturedAt: new Date().toISOString(),
            };
            await client.queueSnapshot({ snapshot: next });
        },
        getAsset: async assetId => {
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
            viewer: { participantId: grant.participantId, role: 'student', connectionId: serverHello.connectionId },
            subject: { type: 'participant', id: grant.participantId },
            accessMode: 'interactive',
            sessionId: current.sessionId,
            lessonId: current.lessonId,
            activityId: current.activity.activityId,
            appletInstanceId: descriptor.instance.appletInstanceId,
            appletTypeId: descriptor.instance.appletTypeId,
            configRef: descriptor.instance.configRef,
        },
        host,
        availableCapabilities: new Set(['pointer-events', 'indexeddb', 'websocket', ...descriptor.instance.requiredCapabilities]),
        snapshot: existingSnapshot ? { stateSchemaVersion: existingSnapshot.stateSchemaVersion, state: existingSnapshot.state } : null,
    });
    const state = () => runtime.applet.getState() as TransformBoardState;
    const statusText = document.createElement('span');
    statusText.className = 'classroom-runtime-status';
    statusText.textContent = `课堂已连接 · ${current.activity.activityId}`;
    const setStatus = (text: string) => { statusText.textContent = text; };
    client.onMessage(message => {
        if (message.type === 'client.outbox' && typeof message.pendingCount === 'number' && message.pendingCount > 0)
            setStatus(`有 ${message.pendingCount} 项操作待发送，恢复连接后自动重试`);
        if (message.type === 'event.ack' || message.type === 'snapshot.ack' || message.type === 'submission.ack')
            setStatus(message.ok === true ? '课堂服务已确认最近操作' : '操作仍在待发送队列，恢复连接后自动重试');
    });
    const hosted = document.createElement('div');
    hosted.className = 'student-app';
    hosted.innerHTML = '<header class="student-header"><div><span class="eyebrow">CLASSCORE · CLASSROOM</span><h1></h1></div><div class="header-status"><span class="status-dot"></span></div></header>';
    const title = hosted.querySelector('h1');
    if (title) title.textContent = current.lessonTitle ?? '课堂';
    const headerStatus = hosted.querySelector('.header-status');
    const self = client.state.self;
    if (self) headerStatus?.append(iconLabel(`${self.displayName}${self.seatNo ? ` · ${self.seatNo}` : ''}`, 'classroom-self'));
    headerStatus?.append(statusText);
    const layout = document.createElement('main');
    layout.className = 'student-layout';
    const side = document.createElement('aside');
    side.className = 'student-brief';
    side.innerHTML = '<span class="step-mark">课堂 Activity</span><h2>先观察，再记录<br>你的变换路径。</h2><p>课堂中的身份、Activity、Snapshot 与提交状态由服务端确认。指针预览可以丢失，但已完成的操作会进入可靠发送队列。</p><div class="target-card"><div class="target-title">当前 Activity</div><div class="target-caption"></div></div>';
    side.querySelector('.target-caption')!.textContent = current.activity.activityId;
    layout.append(side);
    const workspace = document.createElement('section');
    workspace.className = 'student-workspace';
    const toolbar = document.createElement('div');
    toolbar.className = 'board-toolbar';
    const modeLabel = document.createElement('span');
    modeLabel.className = 'toolbar-label';
    toolbar.append(modeLabel);
    const toolbarActions = document.createElement('div');
    toolbarActions.className = 'toolbar-actions';
    toolbarActions.append(button('重置', () => {
        command('transform.reset', {});
    }, 'quiet-button'));
    const submitButton = button('提交答案', async () => {
        submitButton.disabled = true;
        try {
            const submissionResult = await runtime.applet.submit() as { snapshot: Record<string, unknown>; objectCount: number; solved: boolean };
            void client.emitEvent({
                appletInstanceId: descriptor.instance.appletInstanceId,
                appletEventSchemaVersion: 1,
                streamId,
                type: 'attempt.submit',
                payload: { recordTokens: structuredClone(recordTokens), objectCount: submissionResult.objectCount, solved: submissionResult.solved },
            });
            const ack = await client.submit({
                submissionVersion: 1,
                sessionId: current.sessionId,
                activityId: current.activity.activityId,
                appletInstanceId: descriptor.instance.appletInstanceId,
                snapshot: submissionResult.snapshot,
                recordTokens: structuredClone(recordTokens),
                recordText: recordTokens.map(token => token.display).join(''),
                operationSummary: { objectCount: submissionResult.objectCount },
                solved: submissionResult.solved,
                puzzleVersion: 'lesson-package-authoritative',
            });
            setStatus(ack.accepted ? '提交已被课堂服务确认' : '已保存到待发送队列，恢复连接后自动重试');
        } catch (error) {
            setStatus(error instanceof Error ? `提交失败：${error.message}` : '提交失败');
        } finally { submitButton.disabled = false; }
    }, 'primary-button');
    toolbarActions.append(submitButton);
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
    const recordBar = document.createElement('div');
    recordBar.className = 'classroom-record-bar';
    workspace.append(recordBar);
    layout.append(workspace);
    hosted.append(layout);
    root.replaceChildren(hosted);

    const emitRecordEvent = (type: 'record.token.append' | 'record.token.remove', payload: Record<string, unknown>): void => {
        void client.emitEvent({ appletInstanceId: descriptor.instance.appletInstanceId, appletEventSchemaVersion: 1, streamId, type, payload }).then(ack => {
            if (!ack.accepted) setStatus('记录已保存到待发送队列，恢复连接后自动重试');
        }).catch(error => setStatus(error instanceof Error ? `记录发送失败：${error.message}` : '记录发送失败'));
    };
    const recordButton = (token: ClassroomRecordToken) => button(token.display, () => {
        const index = recordTokens.length;
        recordTokens = [...recordTokens, token];
        emitRecordEvent('record.token.append', { index, token });
        render();
    }, 'quiet-button');
    function command(type: string, payload: Record<string, unknown>): void {
        void Promise.resolve(runtime.applet.handleCommand({ type, payload })).then(render).catch((error: unknown) => setStatus(error instanceof Error ? `操作失败：${error.message}` : '操作失败'));
    }
    function render(): void {
        const currentState = state();
        const selected = currentState.selectedObjectId ? currentState.objects[currentState.selectedObjectId] : null;
        modeLabel.textContent = selected ? `已选择对象 ${selected.label}` : '选择一个对象开始';
        board.replaceChildren();
        for (const object of Object.values(currentState.objects).sort((a, b) => a.zIndex - b.zIndex)) {
            const element = document.createElement('button');
            element.type = 'button'; element.className = `fragment fragment-${object.shape}${selected?.id === object.id ? ' selected' : ''}`;
            element.style.left = `${object.x * 38}px`;
            element.style.top = `${object.y * 38}px`;
            element.style.width = `${object.width * 38}px`;
            element.style.height = `${object.height * 38}px`;
            element.style.zIndex = String(object.zIndex);
            element.style.background = object.visual?.color ?? '#5575b8';
            element.style.clipPath = object.visual?.clipPath ?? 'none';
            element.style.transform = `rotate(${object.rotation}deg)`;
            element.setAttribute('aria-label', `对象 ${object.label}`);
            element.append(iconLabel(object.label, 'fragment-label'));
            element.addEventListener('click', () => command('transform.highlight', { objectId: object.id }));
            board.append(element);
        }
        selectionBar.replaceChildren();
        if (selected) {
            selectionBar.append(iconLabel(`对象 ${selected.label} · ${Math.round(selected.rotation)}°`, 'selected-name'));
            for (const [label, axis, distance] of [['← 1格', 'x', -1], ['→ 1格', 'x', 1], ['↑ 1格', 'y', -1], ['↓ 1格', 'y', 1]] as const)
                selectionBar.append(button(label, () => command('transform.translate', { objectId: selected.id, axis, distance }), 'rotate-button'));
            selectionBar.append(button('↻ 90°', () => command('transform.rotate', { objectId: selected.id, degrees: selected.rotation + 90 }), 'rotate-button'));
            for (const pivotId of Object.keys(selected.pivots))
                selectionBar.append(button(`中心 ${pivotId}`, () => command('transform.select-pivot', { objectId: selected.id, pivotId }), 'rotate-button'));
        }
        const contextualTokens: ClassroomRecordToken[] = [];
        if (selected && recordVocabulary.figurePrefix) contextualTokens.push({ kind: 'figure', value: selected.label, display: `${recordVocabulary.figurePrefix}${selected.label}` });
        if (selected?.selectedPivotId && recordVocabulary.vertexPrefix) contextualTokens.push({ kind: 'vertex', value: selected.selectedPivotId, display: `${recordVocabulary.vertexPrefix}${selected.selectedPivotId}` });
        recordBar.replaceChildren(
            iconLabel(recordVocabulary.label ?? '记录：', 'selected-name'),
            ...contextualTokens.map(recordButton),
            ...(recordVocabulary.tokens ?? []).map(recordButton),
        );
        if (recordTokens.length) {
            recordBar.append(iconLabel(`已记录：${recordTokens.map(token => token.display).join('')}`, 'record-history'));
            recordBar.append(button('清空', () => {
                for (let index = recordTokens.length - 1; index >= 0; index -= 1) emitRecordEvent('record.token.remove', { index, token: recordTokens[index] });
                recordTokens = [];
                render();
            }, 'quiet-button'));
        }
    }
    void runtime.start().then(render).catch(error => setStatus(error instanceof Error ? `Applet 启动失败：${error.message}` : 'Applet 启动失败'));
}

export function mountStudentClassroom(root: HTMLElement, options: StudentClassroomOptions = {}): void {
    const client = options.client ?? new ClassroomClient();
    root.replaceChildren();
    const app = document.createElement('main');
    app.className = 'student-classroom-shell';
    app.innerHTML = [
        '<div class="student-classroom-card">',
        '<span class="eyebrow">CLASSCORE · CLASSROOM</span>',
        '<h1>加入课堂</h1>',
        '<p class="classroom-copy">输入教师提供的课堂码。身份由课堂服务分配，学生端不会自行创建学号。</p>',
        '<form class="classroom-join-form">',
        '<label>课堂地址<input name="sessionLocator" autocomplete="off" required></label>',
        '<label>课堂码<input name="credential" autocomplete="one-time-code" required></label>',
        '<button class="primary-button" type="submit">加入课堂</button>',
        '</form>',
        '<p class="classroom-status" role="status">尚未连接</p>',
        '</div>',
    ].join('');
    root.append(app);
    const form = app.querySelector<HTMLFormElement>('form');
    const status = app.querySelector<HTMLElement>('.classroom-status');
    const sessionInput = app.querySelector<HTMLInputElement>('input[name="sessionLocator"]');
    if (!form || !status || !sessionInput) return;
    let mountedActivityKey: string | null = null;
    const renderCurrentActivity = (): void => {
        const current = client.state.currentActivity;
        if (!current) return;
        const descriptor = current.applets.find(item => item.instance.appletTypeId === 'applet:transform-board');
        if (!descriptor) {
            status.textContent = `当前 Activity ${current.activity.activityId} 暂无可用 Student Applet`;
            return;
        }
        const activityKey = `${current.sessionId}:${current.activity.activityId}:${descriptor.instance.appletInstanceId}`;
        if (mountedActivityKey === activityKey) return;
        mountedActivityKey = activityKey;
        try {
            mountClassroomTransformBoard(root, client, current, descriptor);
        } catch (error) {
            mountedActivityKey = null;
            status.textContent = error instanceof Error ? `Applet 挂载失败：${error.message}` : 'Applet 挂载失败';
        }
    };
    client.onMessage(message => {
        if (message.type === 'activity.current' || message.type === 'classroom.activity' || message.type === 'applet.snapshot' || message.type === 'snapshot.state') renderCurrentActivity();
    });
    sessionInput.value = options.defaultSessionLocator ?? new URL(globalThis.location?.href ?? 'http://classroom.local').searchParams.get('session') ?? '';
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const sessionLocator = String(data.get('sessionLocator') ?? '').trim();
        const credential = String(data.get('credential') ?? '').trim();
        if (!sessionLocator || !credential) return;
        const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (submit) submit.disabled = true;
        status.textContent = '正在向课堂服务申请成员资格…';
        try {
            await client.join({
                joinRequestId: `join:${Date.now()}`,
                runtimeApiVersion: 1,
                sessionLocator,
                requestedRole: 'student',
                credential: { type: 'class-code', value: credential },
            });
            await client.connect();
            status.textContent = client.state.currentActivity ? '课堂已连接，正在挂载当前 Activity…' : '课堂已连接，正在等待当前 Activity…';
            renderCurrentActivity();
        } catch (error) {
            status.textContent = error instanceof Error ? `加入失败：${error.message}` : '加入失败，请稍后重试';
            if (submit) submit.disabled = false;
        }
    });
    if (client.state.connection === 'offline') {
        void client.restoreSession().then(hello => {
            if (!hello) return;
            status.textContent = client.state.currentActivity ? '课堂已恢复，正在挂载当前 Activity…' : '课堂已恢复，正在等待当前 Activity…';
            renderCurrentActivity();
        }).catch(error => {
            status.textContent = error instanceof Error ? `恢复失败：${error.message}` : '恢复失败，请重新加入课堂';
        });
    }
}

export function mountStudent(root: HTMLElement, options: StudentClassroomOptions = {}): void {
    const mode = new URL(globalThis.location?.href ?? 'http://classroom.local').searchParams.get('mode');
    if (mode === 'classroom') mountStudentClassroom(root, options);
    else mountStudentPractice(root);
}
