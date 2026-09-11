import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
import { WebPptPlaybackEngineAdapter, createWebPptPlaybackAssetFromBytes, type WebPptPlaybackAsset } from '@classroom/presentation-webppt-adapter/playback';

export const surface = getSurfaceDescriptor('display');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS.display;

type RuntimeSnapshot = {
    pin: { sessionId: string; presentationId: string; revisionId: string; assetId: string };
    revision: { fingerprint: string; document: WebPptPlaybackAsset['document']; runtimeIndex: { scenes: Array<{ sceneId: string }> } };
    state: { sessionId: string; presentationRevisionId: string; assetId: string; deckId: string; sceneId: string; step: number; playState: 'idle' | 'playing' | 'paused'; revision: number };
};

function sessionIdFromUrl(): string { return new URLSearchParams(window.location.search).get('sessionId')?.trim() || ''; }

export function mountDisplayRuntime(root: HTMLElement): void { void mountDisplayRuntimeAsync(root); }

async function mountDisplayRuntimeAsync(root: HTMLElement): Promise<void> {
    root.replaceChildren();
    const app = document.createElement('main');
    app.className = 'display-runtime';
    app.innerHTML = '<header class="display-header"><span class="display-mark">C</span><div><span class="display-kicker">CLASSCORE · DISPLAY</span><h1>课堂大屏</h1></div><span class="display-state">正在连接</span></header><section class="display-stage" aria-label="课件播放区"></section><footer class="display-footer">只读播放 · 课堂版本由 Session Pin 固定</footer>';
    root.append(app);
    const stage = app.querySelector<HTMLElement>('.display-stage')!;
    const status = app.querySelector<HTMLElement>('.display-state')!;
    const sessionId = sessionIdFromUrl();
    if (!sessionId) {
        status.textContent = '等待课堂 sessionId';
        stage.innerHTML = '<div class="display-empty"><strong>等待课堂</strong><span>请使用 /display?sessionId=… 打开已准备的课堂。</span></div>';
        return;
    }
    const engine = new WebPptPlaybackEngineAdapter();
    let player: Awaited<ReturnType<typeof engine.mountPlayer>> | null = null;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mountedIdentity = '';
    let closed = false;

    async function loadRuntime(): Promise<RuntimeSnapshot> {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/presentation-runtime`, { cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 410 ? '课堂已结束' : `运行时读取失败（${response.status}）`);
        const body = await response.json() as { runtime: RuntimeSnapshot | null };
        if (!body.runtime) throw new Error('课堂尚未准备课件');
        return body.runtime;
    }

    async function mountExact(snapshot: RuntimeSnapshot): Promise<void> {
        if (!snapshot.revision.document?.idPrefix) throw new Error('课堂版本缺少稳定文档标识');
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/presentation-runtime/asset`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`课堂资源读取失败（${response.status}）`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const asset = await createWebPptPlaybackAssetFromBytes('课堂课件', bytes, snapshot.revision.document.idPrefix, snapshot.state.deckId);
        player?.dispose();
        stage.replaceChildren();
        player = await engine.mountPlayer(stage, asset, { context: { sessionId, surface: 'display' } });
        await player.applyAuthoritativeState(snapshot.state);
        mountedIdentity = `${snapshot.pin.revisionId}:${snapshot.pin.assetId}`;
        status.textContent = '已连接 · 精确课堂版本';
    }

    async function refresh(): Promise<void> {
        try { await mountExact(await loadRuntime()); }
        catch (error) { status.textContent = error instanceof Error ? error.message : '课堂暂不可用'; }
    }

    function connect(): void {
        if (closed) return;
        socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`);
        socket.addEventListener('open', () => socket?.send(JSON.stringify({ type: 'hello', role: 'display', clientId: `display-${crypto.randomUUID()}`, sessionId })));
        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)) as { type?: string; state?: RuntimeSnapshot['state'] | null; reason?: string };
            if (message.type !== 'presentation.sync') return;
            if (!message.state) { status.textContent = message.reason === 'session-ended' ? '课堂已结束' : '等待课件'; return; }
            const nextIdentity = `${message.state.presentationRevisionId ?? ''}:${message.state.assetId ?? ''}`;
            if (!player || (mountedIdentity && mountedIdentity !== nextIdentity)) {
                void refresh();
                return;
            }
            void Promise.resolve(player.applyAuthoritativeState(message.state)).then(() => { status.textContent = '已同步 · 权威播放位置'; }).catch(() => { void refresh(); });
        });
        socket.addEventListener('close', () => {
            if (closed) return;
            status.textContent = '连接中断 · 正在重连';
            reconnectTimer = setTimeout(connect, 1200);
        });
    }

    window.addEventListener('beforeunload', () => { closed = true; if (reconnectTimer) clearTimeout(reconnectTimer); socket?.close(); player?.dispose(); });
    await refresh();
    connect();
}
