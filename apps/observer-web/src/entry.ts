import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
import { ClassroomClient } from '@classroom/classroom-client';

export const surface = getSurfaceDescriptor('observer');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS.observer;

type PublicPresence = { subjectId: string; status: string };
type PublicStageWidget = {
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
type PublicArtifactContent = { recordText?: string; objectCount?: number; solved?: boolean | null; tokens?: Array<{ kind?: string; display?: string }>; objects?: Array<{ shape?: string; x?: number; y?: number; rotation?: number }> };
type PublicStage = { payload?: { source?: string; selectedCount?: number; annotation?: string | null; artifactContents?: PublicArtifactContent[]; widget?: PublicStageWidget } };

function renderArtifactContent(container: HTMLElement, artifact?: PublicArtifactContent): void {
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

function sessionParams(): { locator: string; code: string } {
    const params = new URLSearchParams(window.location.search);
    return { locator: params.get('session')?.trim() || params.get('locator')?.trim() || 'class:authenticated-demo', code: params.get('code')?.trim() || 'O17' };
}

function text(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value : fallback;
}

export function mountObserver(root: HTMLElement): void {
    root.replaceChildren();
    const app = document.createElement('main');
    app.className = 'observer-app';
    app.innerHTML = [
        '<header class="observer-header"><div><span class="observer-kicker">CLASSCORE · OBSERVER</span><h1>课堂观察</h1><p>只查看课堂公共投影，不显示学生真实身份。</p></div><span class="observer-status" data-field="status">准备连接</span></header>',
        '<section class="observer-layout">',
        '<article class="observer-card observer-stage-card"><div class="observer-card-heading">' +
            '<span>当前 Stage</span><span class="observer-badge" data-field="stage-source">等待</span></div>' +
            '<div class="observer-stage" data-field="stage"><strong>等待教师发布课堂内容</strong><span>加入后将显示公共 Stage 状态。</span></div>' +
            '<p class="observer-stage-widget" data-field="stage-widget"></p><div class="observer-artifact-content artifact-content" data-field="artifact-content"></div>' +
            '<p class="observer-annotation" data-field="annotation"></p></article>',
        '<article class="observer-card"><div class="observer-card-heading"><span>课堂播放</span><span class="observer-badge" data-field="play-state">未连接</span></div><div class="observer-playback"><strong data-field="scene">等待课件</strong><span data-field="step">—</span></div></article>',
        '<article class="observer-card observer-presence-card"><div class="observer-card-heading"><span>课堂在线情况</span><span class="observer-badge" data-field="presence-count">0 人</span></div><div class="observer-presence-list" data-field="presence"><span class="observer-empty">等待公共在线状态。</span></div></article>',
        '</section>',
        '<footer class="observer-footer">只读观察 · 服务器仅提供匿名公共投影</footer>',
    ].join('');
    root.append(app);

    const status = app.querySelector<HTMLElement>('[data-field="status"]')!;
    const stage = app.querySelector<HTMLElement>('[data-field="stage"]')!;
    const stageSource = app.querySelector<HTMLElement>('[data-field="stage-source"]')!;
    const stageWidget = app.querySelector<HTMLElement>('[data-field="stage-widget"]')!;
    const artifactContent = app.querySelector<HTMLElement>('[data-field="artifact-content"]')!;
    const annotation = app.querySelector<HTMLElement>('[data-field="annotation"]')!;
    const playState = app.querySelector<HTMLElement>('[data-field="play-state"]')!;
    const scene = app.querySelector<HTMLElement>('[data-field="scene"]')!;
    const step = app.querySelector<HTMLElement>('[data-field="step"]')!;
    const presence = app.querySelector<HTMLElement>('[data-field="presence"]')!;
    const presenceCount = app.querySelector<HTMLElement>('[data-field="presence-count"]')!;
    const client = new ClassroomClient({ clientBuild: 'observer-web-dev', sessionStorageKey: 'classcore.observer.classroom.join.v1' });

    function subscribeObserver(): void {
        client.sendControl({ type: 'observer.subscribe', subscriptionId: `observer-sub:${crypto.randomUUID()}` });
    }

    client.onConnected(() => subscribeObserver());

    function renderPresence(items: PublicPresence[]): void {
        const publicItems = items.filter(item => typeof item.subjectId === 'string' && (item.status === 'online' || item.status === 'offline'));
        presenceCount.textContent = `${publicItems.filter(item => item.status === 'online').length} 人在线`;
        presence.replaceChildren();
        if (!publicItems.length) {
            presence.innerHTML = '<span class="observer-empty">暂无公共在线状态。</span>';
            return;
        }
        for (const item of publicItems) {
            const row = document.createElement('div');
            row.className = 'observer-presence-row';
            row.innerHTML = '<span class="observer-subject"></span><span class="observer-dot"></span><span class="observer-presence-status"></span>';
            row.querySelector('.observer-subject')!.textContent = item.subjectId;
            row.querySelector('.observer-presence-status')!.textContent = item.status === 'online' ? '在线' : '离线';
            row.classList.toggle('is-online', item.status === 'online');
            presence.append(row);
        }
    }

    function renderStage(message: PublicStage): void {
        const payload = message.payload ?? {};
        const selectedArtifact = payload.widget?.selector === 'selected-artifact';
        const selectedLive = payload.widget?.selector === 'selected-live-view';
        const currentActivity = payload.widget?.selector === 'current-activity-summary';
        const source = selectedArtifact ? '学生作品对比' : currentActivity ? '当前活动摘要' : payload.source === 'presentation' ? 'Presentation' : payload.source === 'student-live' ? '学生实时视图' : text(payload.source, '课堂内容');
        const selectedCount = Number.isInteger(payload.selectedCount) ? payload.selectedCount : 0;
        stageSource.textContent = source;
        let focusText = `教师聚焦 ${selectedCount} 人`;
        if (selectedArtifact) focusText = `已选 ${payload.widget?.artifactCount ?? 0} 份作品证据`;
        else if (currentActivity) focusText = `${payload.widget?.activityType ?? '活动'} · ${payload.widget?.appletCount ?? 0} 个互动组件`;
        else if (selectedLive) focusText = `已选 ${payload.widget?.selectedCount ?? selectedCount} 个实时视图`;
        stage.innerHTML = `<strong>${source}</strong><span>${focusText}</span>`;
        if (selectedArtifact) stageWidget.textContent = `selected-artifact · ${payload.widget?.evidenceCount ?? 0} 条证据`;
        else if (currentActivity) stageWidget.textContent = `current-activity-summary · ${payload.widget?.participantMode ?? 'unknown'} · 提交 ${payload.widget?.submissionPolicy ?? 'none'}`;
        else if (selectedLive) stageWidget.textContent = `selected-live-view · ${payload.widget?.activeCount ?? 0} 个活动视图 · ${payload.widget?.objectCount ?? 0} 个对象`;
        else stageWidget.textContent = '';
        renderArtifactContent(artifactContent, payload.artifactContents?.[0]);
        annotation.textContent = payload.annotation ? `标注：${payload.annotation}` : '';
    }

    function renderPlayback(message: { state?: { sceneId?: string; step?: number; playState?: string } }): void {
        const state = message.state ?? {};
        scene.textContent = text(state.sceneId, '等待课件');
        step.textContent = `Step ${Number.isInteger(state.step) ? state.step : 0}`;
        playState.textContent = text(state.playState, 'idle');
    }

    client.onMessage(message => {
        if (message.type === 'server.hello') status.textContent = '已连接 · 匿名观察';
        if (message.type === 'observer.subscribe.ack') status.textContent = message.ok === true ? '已连接 · 匿名观察' : '观察订阅失败';
        if (message.type === 'classroom.presence.public') renderPresence(Array.isArray(message.presence) ? message.presence as PublicPresence[] : []);
        if (message.type === 'stage.state') renderStage((message.stage ?? {}) as PublicStage);
        if (message.type === 'presentation.sync') renderPlayback(message as { state?: { sceneId?: string; step?: number; playState?: string } });
    });

    const { locator, code } = sessionParams();
    void (async () => {
        try {
            await client.join({
                joinRequestId: `join:observer:${Date.now()}`,
                runtimeApiVersion: 1,
                sessionLocator: locator,
                requestedRole: 'observer',
                credential: { type: 'observer-token', value: code },
            });
            await client.connect();
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : '观察端加入失败';
        }
    })();
}
