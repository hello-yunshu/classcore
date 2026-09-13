import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';

export const surface = getSurfaceDescriptor('teacher-runtime');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS['teacher-runtime'];

type PresentationProject = { presentationId: string; title: string; currentDraftRevision: number; currentDraftDocument?: { pageCount?: number }; updatedAt: string };
const ownerHeaders = { 'x-classcore-user-id': 'demo-teacher' };

function toolsOrigin(): string {
    const port = Number(window.location.port || (window.location.protocol === 'https:' ? 443 : 80));
    const toolsPort = port === 80 || port === 443 ? 8788 : port + 1;
    return `${window.location.protocol}//${window.location.hostname}:${toolsPort}`;
}
function authoringUrl(presentationId?: string): string {
    const suffix = presentationId ? `?presentationId=${encodeURIComponent(presentationId)}` : '';
    return `${toolsOrigin()}/authoring${suffix}`;
}
function classroomApi(path: string): string { return path; }
function button(label: string, action: () => void | Promise<void>, className = ''): HTMLButtonElement {
    const item = document.createElement('button');
    item.type = 'button'; item.className = className; item.textContent = label;
    item.addEventListener('click', () => { void action(); });
    return item;
}
function formatUpdatedAt(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function mountTeacherLibrary(root: HTMLElement): void {
    const requestedSession = new URLSearchParams(window.location.search).get('sessionId')?.trim();
    if (requestedSession) {
        mountTeacherControl(root, requestedSession);
        return;
    }
    root.replaceChildren();
    const app = document.createElement('main'); app.className = 'teacher-library'; root.append(app);
    const header = document.createElement('header'); header.className = 'library-header';
    header.innerHTML = '<div><p class="library-kicker">CLASSCORE · TEACHER DESK</p><h1>我的课件</h1><p class="library-subtitle">把要讲的内容留在手边，把课堂版本留在服务器。</p></div>';
    const headerActions = document.createElement('div'); headerActions.className = 'library-actions';
    const importInput = document.createElement('input'); importInput.type = 'file'; importInput.accept = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'; importInput.hidden = true;
    const status = document.createElement('p'); status.className = 'library-status';
    async function createBlank(): Promise<void> {
        status.textContent = '正在创建空白课件…';
        const response = await fetch(classroomApi('/api/presentations'), { method: 'POST', headers: { ...ownerHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ title: '未命名公开课' }) });
        if (!response.ok) throw new Error(`新建失败（${response.status}）`);
        const project = (await response.json()).presentation as PresentationProject;
        window.location.href = authoringUrl(project.presentationId);
    }
    headerActions.append(button('新建课件', () => createBlank(), 'primary-action'), button('导入 PPTX', () => importInput.click(), 'secondary-action'), button('从我的课件中选择', () => openPicker(), 'secondary-action'), importInput);
    header.append(headerActions); app.append(header, status);
    const toolbar = document.createElement('div'); toolbar.className = 'library-toolbar';
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = '搜索课件'; search.setAttribute('aria-label', '搜索课件'); toolbar.append(search); app.append(toolbar);
    const content = document.createElement('section'); content.className = 'library-content'; app.append(content);
    let projects: PresentationProject[] = [];

    async function preparePresentation(project: PresentationProject): Promise<void> {
        const sessionId = `classroom-${crypto.randomUUID()}`;
        status.textContent = '正在准备课堂版本…';
        const block = await fetch('/api/classroom-blocks', {
            method: 'POST',
            headers: { ...ownerHeaders, 'content-type': 'application/json' },
            body: JSON.stringify({ blockId: `presentation-block-${crypto.randomUUID()}`, presentationId: project.presentationId }),
        });
        if (!block.ok) throw new Error(`课堂绑定失败（${block.status}）`);
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/presentation-prepare`, {
            method: 'POST',
            headers: { ...ownerHeaders, 'content-type': 'application/json' },
            body: JSON.stringify({ presentationId: project.presentationId }),
        });
        if (!response.ok) throw new Error(`课堂准备失败（${response.status}）`);
        status.textContent = `课件已准备 · ${project.title} · ${sessionId}`;
    }

    function openPicker(): void {
        const dialog = document.createElement('dialog');
        dialog.className = 'presentation-picker';
        const title = document.createElement('h2'); title.textContent = '选择课堂课件';
        const subtitle = document.createElement('p'); subtitle.textContent = '选择后只绑定 presentationId，课堂版本在准备阶段由服务器冻结。';
        const input = document.createElement('input'); input.type = 'search'; input.placeholder = '搜索我的课件'; input.setAttribute('aria-label', '搜索我的课件');
        const list = document.createElement('div'); list.className = 'picker-list';
        const close = button('取消', () => dialog.close(), 'card-secondary');
        function renderPicker(): void {
            list.replaceChildren();
            const query = input.value.trim().toLowerCase();
            for (const project of projects.filter(item => !query || item.title.toLowerCase().includes(query))) {
                const item = document.createElement('button'); item.type = 'button'; item.className = 'picker-item';
                item.innerHTML = `<strong></strong><span></span>`;
                item.querySelector('strong')!.textContent = project.title;
                item.querySelector('span')!.textContent = `${project.currentDraftDocument?.pageCount ?? '—'} 页 · ${formatUpdatedAt(project.updatedAt)}`;
                item.addEventListener('click', () => { dialog.close(); void preparePresentation(project).catch(error => { status.textContent = error instanceof Error ? error.message : '课堂准备失败'; }); });
                list.append(item);
            }
            if (!list.childElementCount) list.textContent = '没有匹配的课件';
        }
        input.addEventListener('input', renderPicker);
        const footer = document.createElement('footer'); footer.append(close);
        dialog.append(title, subtitle, input, list, footer); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove());
        renderPicker(); dialog.showModal();
    }

    async function rename(project: PresentationProject): Promise<void> {
        const title = window.prompt('课件名称', project.title)?.trim();
        if (!title || title === project.title) return;
        const response = await fetch(`/api/presentations/${encodeURIComponent(project.presentationId)}`, { method: 'PATCH', headers: { ...ownerHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
        if (!response.ok) throw new Error(`重命名失败（${response.status}）`);
        await refresh();
    }
    async function duplicate(project: PresentationProject): Promise<void> {
        const response = await fetch(`/api/presentations/${encodeURIComponent(project.presentationId)}/duplicate`, { method: 'POST', headers: { ...ownerHeaders, 'content-type': 'application/json' }, body: JSON.stringify({}) });
        if (!response.ok) throw new Error(`创建副本失败（${response.status}）`);
        await refresh();
    }
    async function showHistory(project: PresentationProject): Promise<void> {
        const response = await fetch(`/api/presentations/${encodeURIComponent(project.presentationId)}/revisions`, { headers: ownerHeaders });
        if (!response.ok) throw new Error(`版本历史读取失败（${response.status}）`);
        const revisions = (await response.json()).revisions as Array<{ kind: string; createdAt: string; retained: boolean }>;
        status.textContent = revisions.length ? `${project.title}：${revisions.map(item => `${item.kind === 'published' ? '课堂版本' : '试课'} · ${formatUpdatedAt(item.createdAt)}`).join(' ｜ ')}` : `${project.title}：暂无正式版本`;
    }

    function render(): void {
        content.replaceChildren();
        const query = search.value.trim().toLowerCase();
        const visible = projects.filter(project => !query || project.title.toLowerCase().includes(query));
        const heading = document.createElement('div'); heading.className = 'section-heading'; heading.innerHTML = `<span>最近编辑</span><span>${visible.length} 份</span>`; content.append(heading);
        if (!visible.length) {
            const empty = document.createElement('div'); empty.className = 'library-empty'; empty.innerHTML = '<strong>还没有课件</strong><span>新建一个空白课件，或导入已有 PPTX。</span>'; empty.append(button('开始制作', () => createBlank(), 'primary-action')); content.append(empty); return;
        }
        const grid = document.createElement('div'); grid.className = 'presentation-grid';
        for (const project of visible) {
            const card = document.createElement('article'); card.className = 'presentation-card';
            const preview = document.createElement('div'); preview.className = 'card-preview'; preview.innerHTML = `<span class="preview-mark">${project.title.slice(0, 1) || 'C'}</span><span class="preview-lines"></span>`;
            const details = document.createElement('div'); details.className = 'card-details';
            const title = document.createElement('h2'); title.textContent = project.title;
            const meta = document.createElement('p'); meta.textContent = `${project.currentDraftDocument?.pageCount ?? '—'} 页 · ${formatUpdatedAt(project.updatedAt)}`; details.append(title, meta);
            const actions = document.createElement('div'); actions.className = 'card-actions';
            actions.append(button('编辑', () => { window.location.href = authoringUrl(project.presentationId); }, 'card-primary'));
            actions.append(button('用于课堂', () => preparePresentation(project), 'card-primary'));
            actions.append(button('重命名', () => rename(project), 'card-secondary'));
            actions.append(button('创建副本', () => duplicate(project), 'card-secondary'));
            actions.append(button('版本历史', () => showHistory(project), 'card-secondary'));
            actions.append(button('导出 PPTX', async () => {
                const response = await fetch(`/api/presentations/${encodeURIComponent(project.presentationId)}/draft?download=1`, { headers: ownerHeaders });
                if (!response.ok) throw new Error(`导出失败（${response.status}）`);
                const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${project.title || 'presentation'}.pptx`; link.click(); URL.revokeObjectURL(link.href);
            }, 'card-secondary'), button('删除', async () => {
                if (!window.confirm(`删除“${project.title}”？`)) return;
                const response = await fetch(`/api/presentations/${encodeURIComponent(project.presentationId)}`, { method: 'DELETE', headers: ownerHeaders });
                if (!response.ok) throw new Error(`删除失败（${response.status}）`); await refresh();
            }, 'card-secondary'));
            card.append(preview, details, actions); grid.append(card);
        }
        content.append(grid);
    }
    async function refresh(): Promise<void> {
        status.textContent = '正在读取课件…';
        try {
            const response = await fetch('/api/presentations', { headers: ownerHeaders });
            if (!response.ok) throw new Error(`课件服务返回 ${response.status}`);
            projects = (await response.json()).presentations as PresentationProject[]; status.textContent = `已连接 · ${projects.length} 份课件`; render();
        } catch (error) { status.textContent = error instanceof Error ? `${error.message}。仍可打开本机创作台。` : '课件服务暂未连接'; projects = []; render(); }
    }
    importInput.addEventListener('change', () => {
        const file = importInput.files?.[0]; if (!file) return;
        void (async () => {
            status.textContent = '正在导入…';
            try {
                const bytes = new Uint8Array(await file.arrayBuffer());
                const uploaded = await fetch('/api/presentation-assets', { method: 'POST', headers: { ...ownerHeaders, 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }, body: bytes as unknown as BodyInit });
                if (!uploaded.ok) throw new Error(`导入失败（${uploaded.status}）`);
                const { asset } = await uploaded.json(); const idPrefix = `classcore-import-${crypto.randomUUID()}`;
                const response = await fetch('/api/presentations', { method: 'POST', headers: { ...ownerHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ title: file.name.replace(/\.pptx?$/i, '') || '未命名课件', assetId: asset.assetId, document: { format: 'web-ppt-ooxml-v1', idPrefix, deckId: `deck-${idPrefix}` } }) });
                if (!response.ok) throw new Error(`导入失败（${response.status}）`); await refresh();
            } catch (error) { status.textContent = error instanceof Error ? error.message : '导入失败'; }
            importInput.value = '';
        })();
    });
    search.addEventListener('input', render); void refresh();
}

function mountTeacherControl(root: HTMLElement, sessionId: string): void {
    root.replaceChildren();
    const app = document.createElement('main'); app.className = 'teacher-control'; root.append(app);
    app.innerHTML = [
        '<header class="control-header"><div><p class="library-kicker">CLASSCORE · TEACHER RUNTIME</p><h1>课堂控制</h1>',
        '<p class="library-subtitle">控制权由 Controller Lease 固定；大屏只接收已验证的播放状态。</p></div>',
        '<a class="secondary-action" href="/teacher">返回我的课件</a></header><section class="control-card">',
        `<div class="control-meta"><span>课堂</span><strong>${sessionId}</strong></div>`,
        '<p class="control-status">正在读取课堂版本…</p><div class="control-actions" aria-label="课件播放控制"></div></section>',
    ].join('');
    const status = app.querySelector<HTMLElement>('.control-status')!;
    const actions = app.querySelector<HTMLElement>('.control-actions')!;
    let state: { presentationRevisionId: string; sceneId: string; step: number; playState: 'idle' | 'playing' | 'paused'; revision: number; deckId: string } | null = null;
    let scenes: Array<{ sceneId: string; maxStep: number; hidden?: boolean }> = [];
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    const participantId = sessionStorage.getItem('classcore.teacher.participant') ?? `teacher:${crypto.randomUUID()}`;
    sessionStorage.setItem('classcore.teacher.participant', participantId);
    const actionButton = (label: string, action: string): void => {
        const item = document.createElement('button'); item.type = 'button'; item.className = 'control-button'; item.textContent = label;
        item.addEventListener('click', () => {
            if (!socket || socket.readyState !== WebSocket.OPEN || !state) return;
            const index = scenes.findIndex(scene => scene.sceneId === state!.sceneId);
            const currentScene = scenes[index];
            const payload: Record<string, unknown> = { type: 'presentation.control', controlId: `presentation-control-${crypto.randomUUID()}`, action, expectedRevision: state.revision };
            if (action === 'previous' || action === 'next') {
                let nextIndex = index + (action === 'next' ? 1 : -1);
                while (nextIndex >= 0 && nextIndex < scenes.length && scenes[nextIndex]?.hidden) nextIndex += action === 'next' ? 1 : -1;
                nextIndex = Math.max(0, Math.min(scenes.length - 1, nextIndex));
                payload.action = 'goto'; payload.sceneId = scenes[nextIndex]?.sceneId ?? state.sceneId; payload.step = 0;
            } else if (action === 'set-step') payload.step = Math.min(currentScene?.maxStep ?? state.step + 1, state.step + 1);
            else if (action === 'finish') { payload.action = 'set-step'; payload.step = currentScene?.maxStep ?? state.step; }
            socket.send(JSON.stringify(payload)); status.textContent = '正在同步…';
        });
        actions.append(item);
    };
    async function load(): Promise<void> {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/presentation-runtime`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`课堂读取失败（${response.status}）`);
        const runtime = await response.json() as { runtime: { state: typeof state; revision: { runtimeIndex: { scenes: Array<{ sceneId: string; maxStep: number; hidden?: boolean }> } } } };
        state = runtime.runtime.state;
        if (!state) throw new Error('课堂尚未准备课件');
        scenes = runtime.runtime.revision.runtimeIndex.scenes;
        status.textContent = `已准备 · ${state.sceneId} · 动画 ${state.step} · revision ${state.revision}`;
    }
    function connect(): void {
        if (closed) return;
        if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
        socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`);
        const clientId = `teacher-connection-${crypto.randomUUID()}`;
        socket.addEventListener('open', () => {
            socket?.send(JSON.stringify({ type: 'hello', role: 'teacher', clientId, participantId, sessionId }));
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(() => socket?.send(JSON.stringify({ type: 'teacher.heartbeat' })), 15000);
        });
        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)) as { type?: string; ok?: boolean; state?: typeof state; reason?: string };
            if (message.type === 'hello.ack') {
                if (message.ok === false) status.textContent = message.reason === 'lease-held-by-other' ? '控制权被其他教师占用' : `控制连接失败：${message.reason ?? '未知原因'}`;
                else status.textContent = '控制已连接';
                return;
            }
            if (message.type === 'teacher.heartbeat.ack' && message.ok === false) {
                status.textContent = message.reason === 'controller-lease-held-by-other' ? '控制权被其他教师占用' : '正在重新连接';
                return;
            }
            if (message.type !== 'presentation.control.ack') return;
            if (!message.ok || !message.state) { status.textContent = `控制未执行：${message.reason ?? '未知原因'}`; return; }
            state = message.state; status.textContent = `已同步 · ${state.sceneId} · 动画 ${state.step} · revision ${state.revision}`;
        });
        socket.addEventListener('close', () => {
            if (closed) return;
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = null;
            status.textContent = '正在重新连接';
            reconnectTimer = setTimeout(connect, 800);
        });
    }
    actionButton('上一页', 'previous');
    actionButton('下一页', 'next');
    actionButton('下一动画', 'set-step');
    actionButton('完成当前页', 'finish');
    actionButton('播放', 'play');
    actionButton('暂停', 'pause');
    void load().then(connect).catch(error => { status.textContent = error instanceof Error ? error.message : '课堂暂不可用'; });
    window.addEventListener('beforeunload', () => {
        closed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        socket?.close();
    });
}
