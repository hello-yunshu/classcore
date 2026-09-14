import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
import { ClassroomClient } from '@classroom/classroom-client';
import { WebPptPlaybackEngineAdapter, createWebPptPlaybackAssetFromBytes, type WebPptPlaybackAsset } from '@classroom/presentation-webppt-adapter/playback';

export const surface = getSurfaceDescriptor('display');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS.display;

type RuntimeSnapshot = {
    pin: { sessionId: string; presentationId: string; revisionId: string; assetId: string };
    revision: { fingerprint: string; document: WebPptPlaybackAsset['document']; runtimeIndex: { width?: number; height?: number; scenes: Array<{ sceneId: string; hidden?: boolean }> } };
    state: { sessionId: string; presentationRevisionId: string; assetId: string; deckId: string; sceneId: string; step: number; playState: 'idle' | 'playing' | 'paused'; revision: number };
};
type ClassroomStageWidget = {
    selector?: string;
    activityType?: string;
    participantMode?: string;
    appletCount?: number;
    adviceMode?: string;
    submissionPolicy?: string;
    evidenceCount?: number;
    artifactCount?: number;
    selectedCount?: number;
    activeCount?: number;
    objectCount?: number;
    latestSeq?: number;
};
type ClassroomArtifactContent = { recordText?: string; objectCount?: number; solved?: boolean | null; tokens?: Array<{ kind?: string; display?: string }>; objects?: Array<{ shape?: string; x?: number; y?: number; rotation?: number }> };

function renderArtifactContent(container: HTMLElement, artifact?: ClassroomArtifactContent): void {
    container.replaceChildren();
    if (!artifact) return;
    const heading = document.createElement('strong');
    heading.textContent = `作品内容 · ${artifact.solved === true ? '已完成' : '未完成'}`;
    const record = document.createElement('span');
    record.textContent = artifact.recordText ? `记录：${artifact.recordText}` : '未记录文字';
    const tokens = document.createElement('span');
    tokens.textContent = `表达：${(artifact.tokens ?? []).map(token => token.display || token.kind || '词元').join('') || '无'}`;
    const objects = document.createElement('span');
    const objectText = (artifact.objects ?? []).slice(0, 6).map((object, index) => `图形${index + 1} ${object.shape ?? 'unknown'} · ${object.x ?? 0},${object.y ?? 0} · ${object.rotation ?? 0}°`).join(' ｜ ');
    objects.textContent = `对象：${artifact.objectCount ?? 0}${objectText ? ` · ${objectText}` : ''}`;
    container.append(heading, record, tokens, objects);
}

function sessionIdFromUrl(): string { return new URLSearchParams(window.location.search).get('sessionId')?.trim() || ''; }

export function mountDisplayRuntime(root: HTMLElement): void {
    if (new URLSearchParams(window.location.search).get('mode') === 'classroom') {
        void mountAuthenticatedDisplay(root);
        return;
    }
    void mountDisplayRuntimeAsync(root);
}

async function mountAuthenticatedDisplay(root: HTMLElement): Promise<void> {
    root.replaceChildren();
    const app = document.createElement('main'); app.className = 'display-classroom';
    app.innerHTML = [
        '<header class="display-header"><span class="display-mark">C</span><div><span class="display-kicker">CLASSCORE · DISPLAY</span><h1>课堂 Stage</h1></div><span class="display-state" data-field="status">正在认证</span></header>',
        '<section class="display-classroom-stage" data-testid="display-stage"><strong data-field="source">等待 Stage</strong><span data-field="focus">等待教师投影</span><span data-field="widget"></span><div data-field="artifact-content" class="artifact-content"></div><span data-field="playback"></span><em data-field="annotation"></em></section>',
        '<footer class="display-footer">只读投影 · 身份由服务器裁剪</footer>',
    ].join('');
    root.append(app);
    const status = app.querySelector<HTMLElement>('[data-field="status"]')!;
    const source = app.querySelector<HTMLElement>('[data-field="source"]')!;
    const focus = app.querySelector<HTMLElement>('[data-field="focus"]')!;
    const widget = app.querySelector<HTMLElement>('[data-field="widget"]')!;
    const artifactContent = app.querySelector<HTMLElement>('[data-field="artifact-content"]')!;
    const playback = app.querySelector<HTMLElement>('[data-field="playback"]')!;
    const annotation = app.querySelector<HTMLElement>('[data-field="annotation"]')!;
    const client = new ClassroomClient({ clientBuild: 'display-web-dev', sessionStorageKey: 'classcore.display.classroom.join.v1' });
    const sessionId = sessionIdFromUrl();
    const applyStage = (stage: { payload?: { source?: string; selectedCount?: number; annotation?: string | null; artifactContents?: ClassroomArtifactContent[]; widget?: ClassroomStageWidget } }): void => {
        const payload = stage.payload ?? {};
        const selectedArtifact = payload.widget?.selector === 'selected-artifact';
        const selectedLive = payload.widget?.selector === 'selected-live-view';
        const currentActivity = payload.widget?.selector === 'current-activity-summary';
        source.textContent = selectedArtifact ? '学生作品对比' : currentActivity ? '当前活动摘要' : payload.source === 'presentation' ? 'Presentation 权威源' : '学生实时视图';
        if (selectedArtifact) focus.textContent = `已选 ${payload.widget?.artifactCount ?? 0} 份作品证据`;
        else if (currentActivity) focus.textContent = `${payload.widget?.activityType ?? '活动'} · ${payload.widget?.appletCount ?? 0} 个互动组件`;
        else if (selectedLive) focus.textContent = `已选 ${payload.widget?.selectedCount ?? payload.selectedCount ?? 0} 个实时视图`;
        else focus.textContent = `教师聚焦 ${payload.selectedCount ?? 0} 人`;
        if (selectedArtifact) widget.textContent = `selected-artifact · ${payload.widget?.evidenceCount ?? 0} 条证据`;
        else if (currentActivity) widget.textContent = `current-activity-summary · ${payload.widget?.participantMode ?? 'unknown'} · 提交 ${payload.widget?.submissionPolicy ?? 'none'}`;
        else if (selectedLive) widget.textContent = `selected-live-view · ${payload.widget?.activeCount ?? 0} 个活动视图 · ${payload.widget?.objectCount ?? 0} 个对象`;
        else widget.textContent = '';
        renderArtifactContent(artifactContent, payload.artifactContents?.[0]);
        annotation.textContent = payload.annotation ? `标注：${payload.annotation}` : '';
    };
    client.onMessage(message => {
        if (message.type === 'stage.state' && message.stage) applyStage(message.stage as { payload?: { source?: string; selectedCount?: number; annotation?: string | null } });
        if (message.type === 'presentation.sync' && message.state) {
            const state = message.state as { sceneId?: string; step?: number; playState?: string };
            playback.textContent = `播放 ${state.sceneId ?? '未知场景'} · step ${state.step ?? 0} · ${state.playState ?? 'idle'}`;
        }
        if (message.type === 'server.hello') status.textContent = '已连接 · 只读投影';
    });
    if (!sessionId) { status.textContent = '缺少 sessionId'; return; }
    try {
        const params = new URLSearchParams(window.location.search);
        const locator = params.get('locator')?.trim() ?? '';
        const code = params.get('code')?.trim() ?? '';
        if (!locator || !code) throw new Error('display-session-credentials-required');
        const result = await client.join({ joinRequestId: `join:display:${Date.now()}`, runtimeApiVersion: 1, sessionLocator: locator, requestedRole: 'display', credential: { type: 'display-token', value: code } });
        if (result.grant.sessionId !== sessionId) throw new Error('display-session-mismatch');
        await client.connect(); status.textContent = '已连接 · 只读投影';
    } catch (error) { status.textContent = error instanceof Error ? error.message : '大屏加入失败'; }
}

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
    let accessToken: string | null = null;
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
        if (asset.source?.sha256 !== snapshot.revision.fingerprint) throw new Error('课堂资源指纹不匹配，已阻止播放');
        const { width, height } = snapshot.revision.runtimeIndex;
        const aspectWidth = Number(width);
        const aspectHeight = Number(height);
        if (!Number.isFinite(aspectWidth) || !Number.isFinite(aspectHeight) || aspectWidth <= 0 || aspectHeight <= 0)
            throw new Error('课堂版本缺少可信页面比例');
        stage.style.setProperty('--display-aspect-ratio', `${aspectWidth} / ${aspectHeight}`);
        player?.dispose();
        stage.replaceChildren();
        player = await engine.mountPlayer(stage, asset, { context: { sessionId, surface: 'display' } });
        await player.applyAuthoritativeState(snapshot.state);
        mountedIdentity = snapshot.pin.revisionId;
        status.textContent = '已连接 · 精确课堂版本';
    }

    async function refresh(): Promise<void> {
        try { await mountExact(await loadRuntime()); }
        catch (error) { status.textContent = error instanceof Error ? error.message : '课堂暂不可用'; }
    }

    async function prepareSocketCredentials(): Promise<void> {
        const params = new URLSearchParams(window.location.search);
        const response = await fetch('/api/classroom/join', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                joinRequestId: `join:display-playback:${Date.now()}`,
                runtimeApiVersion: 1,
                sessionLocator: params.get('locator')?.trim() ?? '',
                requestedRole: 'display',
                credential: { type: 'display-token', value: params.get('code')?.trim() ?? '' },
            }),
        });
        if (response.status === 404) return;
        const body = await response.json() as { grant?: { sessionId?: string; accessToken?: string }; error?: string };
        if (!response.ok || !body.grant?.accessToken) throw new Error(body.error ?? 'display-join-failed');
        if (body.grant.sessionId !== sessionId) throw new Error('display-session-mismatch');
        accessToken = body.grant.accessToken;
    }

    function connect(): void {
        if (closed) return;
        socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`);
        socket.addEventListener('open', () => socket?.send(JSON.stringify(accessToken ? {
            type: 'client.hello',
            protocolVersion: 1,
            runtimeApiVersion: 1,
            clientBuild: 'display-web-playback',
            accessToken,
            capabilityReport: {
                capabilityReportVersion: 1,
                secureContext: window.isSecureContext,
                indexedDb: typeof window.indexedDB !== 'undefined',
                pointerEvents: typeof window.PointerEvent !== 'undefined',
                webWorkers: typeof window.Worker !== 'undefined',
                webSocket: typeof window.WebSocket !== 'undefined',
            },
        } : { type: 'hello', role: 'display', clientId: `display-${crypto.randomUUID()}`, sessionId })));
        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)) as { type?: string; state?: RuntimeSnapshot['state'] | null; reason?: string };
            if (message.type === 'server.hello' && player) status.textContent = '已连接 · 精确课堂版本';
            if (message.type !== 'presentation.sync') return;
            if (!message.state) { status.textContent = message.reason === 'session-ended' ? '课堂已结束' : '等待课件'; return; }
            const nextIdentity = message.state.presentationRevisionId ?? '';
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
    try { await prepareSocketCredentials(); connect(); }
    catch (error) { status.textContent = error instanceof Error ? error.message : '大屏认证失败'; }
}
