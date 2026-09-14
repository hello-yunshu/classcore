import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
import { ClassroomClient } from '@classroom/classroom-client';

export const surface = getSurfaceDescriptor('teacher-runtime');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS['teacher-runtime'];

type PresentationProject = { presentationId: string; title: string; currentDraftRevision: number; currentDraftDocument?: { pageCount?: number }; updatedAt: string };
const ownerId = sessionStorage.getItem('classcore.teacher.owner-id');
const ownerHeaders: Record<string, string> = ownerId ? { 'x-classcore-user-id': ownerId } : {};

function toolsOrigin(): string {
    const port = Number(window.location.port || (window.location.protocol === 'https:' ? 443 : 80));
    const toolsPort = port === 80 || port === 443 || port === 9602 ? 9688 : port + 1;
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
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'classroom') {
        mountTeacherClassroom(root);
        return;
    }
    const requestedSession = new URLSearchParams(window.location.search).get('sessionId')?.trim();
    if (requestedSession) {
        mountTeacherClassroom(root, { defaultSessionLocator: requestedSession });
        return;
    }
    mountTeacherLanding(root);
}

function mountTeacherLanding(root: HTMLElement): void {
    root.replaceChildren();
    const app = document.createElement('main'); app.className = 'teacher-landing'; root.append(app);
    const header = document.createElement('header'); header.className = 'library-header';
    header.innerHTML = '<div><p class="library-kicker">CLASSCORE · TEACHER RUNTIME</p><h1>课堂控制台</h1><p class="library-subtitle">课堂现场只保留控制、观察和同步。课程准备与文件管理请在课程准备台完成。</p></div>';
    const headerActions = document.createElement('div'); headerActions.className = 'library-actions';
    headerActions.append(button('打开课程准备台', () => { window.location.href = toolsOrigin() + '/backstage'; }, 'primary-action'));
    header.append(headerActions); app.append(header);
    const status = document.createElement('p'); status.className = 'library-status'; app.append(status);
    const guide = document.createElement('section');
    guide.className = 'teacher-landing-guide';
    guide.innerHTML = [
        '<div><span class="landing-step">准备</span><strong>在课程准备台选择并发布课程</strong><p>导入 PPT、配置活动和 Applet，完成运行检查后点击“开始课堂”。</p></div>',
        '<div><span class="landing-step">上课</span><strong>在这里控制课堂现场</strong><p>开始课堂后，服务端会把教师带入同一 Session，学生、大屏和观察端随之同步。</p></div>',
    ].join('');
    app.append(guide);
    status.textContent = '课堂尚未启动 · 请先从课程准备台开始';
}

function mountTeacherPresentationLibrary(root: HTMLElement): void {
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

type TeacherStudent = { participantId: string; displayName: string; seatNo?: string | null };
type TeacherStageWidget = {
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
type ArtifactObject = { shape?: string; x?: number; y?: number; width?: number; height?: number; rotation?: number };
type ArtifactContent = { artifactType?: string; revision?: number; recordText?: string; tokens?: Array<{ kind?: string; display?: string }>; objectCount?: number; solved?: boolean | null; objects?: ArtifactObject[] };
type TeacherStage = { revision: number; contentType: string; payload: { source?: string; selectedParticipantIds?: string[]; annotation?: string | null; artifactContents?: ArtifactContent[]; widget?: TeacherStageWidget } };

function renderArtifactContent(container: HTMLElement, artifact?: ArtifactContent): void {
    container.replaceChildren();
    if (!artifact) return;
    const heading = document.createElement('strong');
    heading.textContent = `作品内容 · ${artifact.solved === true ? '已完成' : '未完成'}`;
    const record = document.createElement('span');
    record.textContent = artifact.recordText ? `记录：${artifact.recordText}` : '未记录文字';
    const tokens = document.createElement('span');
    const tokenText = (artifact.tokens ?? []).map(token => token.display || token.kind || '词元').join('');
    tokens.textContent = tokenText ? `表达：${tokenText}` : '无表达词元';
    const objects = document.createElement('span');
    const objectText = (artifact.objects ?? []).slice(0, 6).map((object, index) => {
        const position = `${object.x ?? 0},${object.y ?? 0}`;
        return `图形${index + 1} ${object.shape ?? 'unknown'} · ${position} · ${object.rotation ?? 0}°`;
    }).join(' ｜ ');
    objects.textContent = `对象：${artifact.objectCount ?? 0}${objectText ? ` · ${objectText}` : ''}`;
    container.append(heading, record, tokens, objects);
}

function mountTeacherClassroom(root: HTMLElement, options: { defaultSessionLocator?: string; defaultCredential?: string } = {}): void {
    root.replaceChildren();
    const app = document.createElement('main');
    app.className = 'teacher-classroom';
    app.innerHTML = [
        `<header class="teacher-classroom-header"><div><p class="library-kicker">CLASSCORE · TEACHER RUNTIME</p><h1>课堂控制台</h1>`
            + '<p class="library-subtitle">教师控制、学生资源与大屏 Stage 均由认证运行时提供。</p><p class="teacher-course-context" data-field="course">等待课程信息</p>'
            + `</div><div class="teacher-session-tools"><span data-testid="teacher-status">等待加入课堂</span><a class="teacher-return-link" href="${toolsOrigin()}/backstage">返回课程准备台</a><button type="button" data-action="join">加入课堂</button></div></header>`,
        '<section class="teacher-join-bar"><label>课堂定位 <input data-field="locator" required></label><label>教师凭证 <input data-field="credential" required autocomplete="off"></label>'
            + '<div class="teacher-entry-links"><span data-field="join-url"></span><button type="button" data-action="copy-display" hidden>复制大屏地址</button><span data-field="student-entry"></span></div></section>',
        '<div class="teacher-three-column"><aside class="teacher-column teacher-students"><div class="column-heading"><h2>在线学生</h2><button type="button" data-action="random">随机选择</button></div><p class="column-note">学生列表来自 Presence 与服务器投影，可选择 1–4 人。</p><div data-field="students" class="teacher-student-list"></div></aside>',
        '<section class="teacher-column teacher-stage"><div class="column-heading"><h2>Stage 预览</h2><span data-field="lease">未取得控制权</span></div><div class="stage-preview" data-testid="teacher-stage"><strong data-field="stage-source">等待 Stage</strong><span data-field="stage-focus">尚未选择学生</span>',
        '<span data-field="live-preview">等待学生实时画面</span><span data-field="stage-widget"></span><div data-field="artifact-content" class="artifact-content"></div><em data-field="stage-annotation"></em></div>',
        '<div class="stage-actions"><button type="button" data-action="claim">取得控制权</button><button type="button" data-action="activity">学生视图</button><button type="button" data-action="activity-summary">当前活动</button>',
        '<button type="button" data-action="presentation">Presentation</button><button type="button" data-action="presentation-play">播放</button><button type="button" data-action="presentation-pause">暂停</button></div>',
        '<label class="annotation-field">教师标注 <input data-field="annotation" maxlength="160" placeholder="可选的 Stage 标注"><button type="button" data-action="annotate">发布</button></label><p data-field="control-error" class="teacher-control-error" role="alert" hidden></p></section>',
        '<aside class="teacher-column teacher-resources"><div class="column-heading"><h2>提交资源</h2><span data-field="submission-count">0</span></div><div data-field="submissions" class="teacher-submission-list"><span>等待课堂数据</span></div>',
        '<div class="teacher-analytics"><div class="column-heading"><h3>学习分析</h3><button type="button" data-action="analytics">分析已选学生</button></div><p data-field="analytics">选择学生后请求确定性分析。</p><button type="button" data-action="confirm-analytics" hidden>确认加入 Stage</button></div><div class="teacher-summary" data-field="summary">消息摘要：0</div></aside></div>',
    ].join('');
    root.append(app);
    const status = app.querySelector<HTMLElement>('[data-testid="teacher-status"]')!;
    const studentList = app.querySelector<HTMLElement>('[data-field="students"]')!;
    const stageSource = app.querySelector<HTMLElement>('[data-field="stage-source"]')!;
    const stageFocus = app.querySelector<HTMLElement>('[data-field="stage-focus"]')!;
    const livePreview = app.querySelector<HTMLElement>('[data-field="live-preview"]')!;
    const stageWidget = app.querySelector<HTMLElement>('[data-field="stage-widget"]')!;
    const artifactContent = app.querySelector<HTMLElement>('[data-field="artifact-content"]')!;
    const stageAnnotation = app.querySelector<HTMLElement>('[data-field="stage-annotation"]')!;
    const leaseLabel = app.querySelector<HTMLElement>('[data-field="lease"]')!;
    const joinUrl = app.querySelector<HTMLElement>('[data-field="join-url"]')!;
    const copyDisplay = app.querySelector<HTMLButtonElement>('[data-action="copy-display"]')!;
    const studentEntry = app.querySelector<HTMLElement>('[data-field="student-entry"]')!;
    const courseContext = app.querySelector<HTMLElement>('[data-field="course"]')!;
    const controlError = app.querySelector<HTMLElement>('[data-field="control-error"]')!;
    const joinButton = app.querySelector<HTMLButtonElement>('[data-action="join"]')!;
    const submissionCount = app.querySelector<HTMLElement>('[data-field="submission-count"]')!;
    const submissions = app.querySelector<HTMLElement>('[data-field="submissions"]')!;
    const summary = app.querySelector<HTMLElement>('[data-field="summary"]')!;
    const analytics = app.querySelector<HTMLElement>('[data-field="analytics"]')!;
    const confirmAnalytics = app.querySelector<HTMLButtonElement>('[data-action="confirm-analytics"]')!;
    const locator = app.querySelector<HTMLInputElement>('[data-field="locator"]')!;
    const credential = app.querySelector<HTMLInputElement>('[data-field="credential"]')!;
    const annotation = app.querySelector<HTMLInputElement>('[data-field="annotation"]')!;
    locator.value = options.defaultSessionLocator ?? new URLSearchParams(window.location.search).get('locator')?.trim() ?? '';
    credential.value = options.defaultCredential ?? new URLSearchParams(window.location.search).get('code')?.trim() ?? '';
    const client = new ClassroomClient({ clientBuild: 'teacher-web-dev', sessionStorageKey: 'classcore.teacher.classroom.join.v1' });
    let students: TeacherStudent[] = [];
    let selected = new Set<string>();
    let presence = new Map<string, string>();
    let stage: TeacherStage | null = null;
    let latestLive: { participantId: string; seq: number; objectCount: number } | null = null;
    let latestAnalytics: { resultId: string; recommendations: Array<{ recommendationId: string; label: string; status: string }>; classifications: Array<{ code: string }> } | null = null;
    let presentationRevision = 0;
    let leaseRevision = 0;
    let leaseClaimed = false;
    let leaseRenewTimer: ReturnType<typeof setInterval> | null = null;
    let messageCount = 0;
    let displayUrlValue = '';
    const setControlError = (message: string): void => { controlError.textContent = message; controlError.hidden = !message; };
    const syncControlState = (): void => {
        const online = client.state.connection === 'online';
        joinButton.disabled = online;
        if (online && joinButton.textContent !== '已连接') joinButton.textContent = '已连接';
        for (const action of app.querySelectorAll<HTMLButtonElement>('.stage-actions button, [data-action="annotate"], [data-action="analytics"]')) action.disabled = !online || !leaseClaimed;
        app.querySelector<HTMLButtonElement>('[data-action="claim"]')!.disabled = !online || leaseClaimed;
    };
    const startLeaseRenewal = (): void => {
        if (leaseRenewTimer) return;
        leaseRenewTimer = setInterval(() => {
            if (leaseClaimed && client.state.connection === 'online') client.sendControl({ type: 'teacher.lease.renew', expectedRevision: leaseRevision });
        }, 10_000);
    };
    const renderStage = (): void => {
        const selectedArtifact = stage?.payload?.widget?.selector === 'selected-artifact';
        const selectedLive = stage?.payload?.widget?.selector === 'selected-live-view';
        const currentActivity = stage?.payload?.widget?.selector === 'current-activity-summary';
        const source = selectedArtifact ? '学生作品对比' : currentActivity ? '当前活动摘要' : stage?.payload?.source === 'presentation' ? 'Presentation 权威源' : '学生实时视图';
        stageSource.textContent = source;
        const names = (stage?.payload?.selectedParticipantIds ?? [...selected]).map(id => students.find(item => item.participantId === id)?.displayName ?? id);
        if (selectedArtifact) stageFocus.textContent = `已选 ${stage?.payload?.widget?.artifactCount ?? 0} 份作品证据`;
        else if (currentActivity) stageFocus.textContent = `${stage?.payload?.widget?.activityType ?? '活动'} · ${stage?.payload?.widget?.appletCount ?? 0} 个互动组件`;
        else if (selectedLive) stageFocus.textContent = `已选 ${stage?.payload?.widget?.selectedCount ?? names.length} 个实时视图`;
        else stageFocus.textContent = names.length ? `聚焦：${names.join('、')}` : '尚未选择学生';
        livePreview.textContent = latestLive ? `实时缩略图 · ${latestLive.objectCount} 个对象 · seq ${latestLive.seq}` : '等待学生实时画面';
        if (selectedArtifact) stageWidget.textContent = `selected-artifact · ${stage?.payload?.widget?.evidenceCount ?? 0} 条证据`;
        else if (currentActivity) stageWidget.textContent = `current-activity-summary · ${stage?.payload?.widget?.participantMode ?? 'unknown'} · 提交 ${stage?.payload?.widget?.submissionPolicy ?? 'none'}`;
        else if (selectedLive) stageWidget.textContent = `selected-live-view · ${stage?.payload?.widget?.activeCount ?? 0} 个活动视图 · ${stage?.payload?.widget?.objectCount ?? 0} 个对象`;
        else stageWidget.textContent = '';
        renderArtifactContent(artifactContent, stage?.payload?.artifactContents?.[0]);
        stageAnnotation.textContent = stage?.payload?.annotation ? `标注：${stage.payload.annotation}` : '';
        leaseLabel.textContent = leaseClaimed ? `控制权 revision ${leaseRevision} · 自动续租` : stage ? `Stage revision ${stage.revision}` : '未取得控制权';
    };
    const renderStudents = (): void => {
        studentList.replaceChildren();
        if (!students.length) { studentList.textContent = '等待学生加入课堂'; return; }
        for (const student of students) {
            const item = document.createElement('button'); item.type = 'button'; item.className = `teacher-student ${selected.has(student.participantId) ? 'is-selected' : ''}`;
            item.dataset.participantId = student.participantId;
            const online = presence.get(student.participantId) === 'online';
            item.innerHTML = '<strong></strong><span></span>';
            item.querySelector('strong')!.textContent = student.displayName;
            item.querySelector('span')!.textContent = `${online ? '在线' : '等待中'} · ${student.seatNo ?? '无座位号'}`;
            item.addEventListener('click', () => {
                if (selected.has(student.participantId)) selected.delete(student.participantId);
                else if (selected.size < 4) selected.add(student.participantId);
                renderStudents(); renderStage();
                if (client.state.connection === 'online') client.sendControl({ type: 'teacher.selection.set', participantIds: [...selected], expectedRevision: stage?.revision });
            });
            studentList.append(item);
        }
    };
    const renderSubmissions = (items: Array<{ submissionId: string; submittedBy: string; status: string }>): void => {
        submissionCount.textContent = String(items.length);
        submissions.replaceChildren();
        if (!items.length) { submissions.textContent = '暂无提交资源'; return; }
        for (const item of items.slice(-8).reverse()) {
            const row = document.createElement('div'); row.className = 'teacher-submission';
            row.textContent = `${item.submittedBy} · ${item.status} · ${item.submissionId.slice(-8)}`;
            submissions.append(row);
        }
    };
    const join = async (): Promise<void> => {
        status.textContent = '正在认证教师身份…';
        try {
            const result = await client.join({ joinRequestId: `join:teacher:${Date.now()}`, runtimeApiVersion: 1, sessionLocator: locator.value.trim(), requestedRole: 'teacher', credential: { type: 'teacher-issued', value: credential.value.trim() } });
            await client.connect();
            status.textContent = `已连接 · ${result.self?.displayName ?? '教师'}`;
            setControlError(''); joinButton.textContent = '已连接'; joinButton.disabled = true; syncControlState();
            client.sendControl({ type: 'teacher.students.refresh' });
            client.sendControl({ type: 'teacher.lease.claim', expectedRevision: leaseRevision });
        } catch (error) { joinButton.disabled = false; joinButton.textContent = '重新加入'; status.textContent = error instanceof Error ? error.message : '教师加入失败'; syncControlState(); }
    };
    client.onMessage(message => {
        messageCount += 1; summary.textContent = `消息摘要：${messageCount} · ${String(message.type ?? 'unknown')}`;
        if (message.type === 'classroom.course' && message.course && typeof message.course === 'object') {
            const course = message.course as { title?: string; courseId?: string };
            courseContext.textContent = course.title ? `当前课程：${course.title}${course.courseId ? ` · ${course.courseId}` : ''}` : '当前课堂课程';
        }
        if (message.type === 'classroom.presence' && Array.isArray(message.presence)) presence = new Map((message.presence as Array<{ participantId: string; status: string }>).map(item => [item.participantId, item.status]));
        if (message.type === 'teacher.students' && Array.isArray(message.students)) students = message.students as TeacherStudent[];
        if (message.type === 'classroom.display-link' && typeof message.url === 'string') { displayUrlValue = message.url; joinUrl.textContent = `大屏加入地址：${message.url}`; copyDisplay.hidden = false; }
        if (message.type === 'classroom.join-links' && message.links && typeof message.links === 'object') {
            const links = message.links as { studentCode?: string; observerCode?: string };
            studentEntry.textContent = `学生课堂码：${links.studentCode ?? '由服务端提供'} · 观察端凭证：${links.observerCode ?? '由服务端提供'}`;
        }
        if (message.type === 'teacher.lease.state' && message.lease) {
            leaseRevision = Number((message.lease as { revision: number }).revision);
            const lease = message.lease as { holderParticipantId: string | null };
            if (leaseClaimed && lease.holderParticipantId === client.state.grant?.participantId) client.sendControl({ type: 'teacher.lease.claim', expectedRevision: leaseRevision });
            if (!leaseClaimed && (lease.holderParticipantId === null || lease.holderParticipantId === client.state.grant?.participantId)) {
                window.setTimeout(() => {
                    if (!leaseClaimed && client.state.connection === 'online') client.sendControl({ type: 'teacher.lease.claim', expectedRevision: leaseRevision });
                }, 0);
            }
        }
        if (message.type === 'teacher.lease.ack' && message.ok && message.lease) { leaseRevision = Number((message.lease as { revision: number }).revision); leaseClaimed = true; leaseLabel.textContent = `控制权 revision ${leaseRevision} · 自动续租`; setControlError(''); startLeaseRenewal(); syncControlState(); }
        if (message.type === 'teacher.lease.ack' && message.ok === false) { leaseClaimed = false; setControlError(`控制权续租失败：${String(message.reason ?? '请重新取得控制权')}`); syncControlState(); }
        if (message.type === 'error') {
            const reason = String(message.reason ?? message.code ?? '课堂操作失败');
            const copy: Record<string, string> = { 'controller-lease-required': '请先取得控制权后再操作。', 'controller-lease-expired': '控制权已过期，请重新取得控制权。', 'not-lease-holder': '当前教师没有控制权，请重新取得控制权。', 'stale-revision': '课堂状态已更新，请重新选择操作。' };
            setControlError(copy[reason] ?? `课堂操作失败：${reason}`);
            if (reason.includes('lease')) { leaseClaimed = false; syncControlState(); }
        }
        if (message.type === 'teacher.analytics.result' && message.ok && message.result) {
            const result = message.result as { resultId: string; recommendations?: Array<{ recommendationId: string; label: string; status: string }>; classifications?: Array<{ code: string }> };
            latestAnalytics = { resultId: result.resultId, recommendations: result.recommendations ?? [], classifications: result.classifications ?? [] };
            const recommendation = latestAnalytics.recommendations.find(item => item.status === 'candidate');
            analytics.textContent = `${latestAnalytics.classifications.map(item => item.code).join('、') || '暂无分类'}${recommendation ? ` · ${recommendation.label}` : ''}`;
            confirmAnalytics.hidden = !recommendation;
        }
        if (message.type === 'teacher.analytics.confirmed' && message.ok) { confirmAnalytics.hidden = true; analytics.textContent = '分析建议已由教师确认并进入 Stage。'; }
        if (message.type === 'presentation.sync' && message.state) presentationRevision = Number((message.state as { revision?: number }).revision ?? presentationRevision);
        if (message.type === 'stage.state' && message.stage) stage = message.stage as TeacherStage;
        if (message.type === 'live.state' && message.frame && typeof message.frame === 'object') {
            const frame = message.frame as { scope?: { type?: string; id?: string }; seq?: number; payload?: { objects?: Record<string, unknown> } };
            if (frame.scope?.type === 'participant' && typeof frame.scope.id === 'string') latestLive = { participantId: frame.scope.id, seq: Number(frame.seq ?? 0), objectCount: frame.payload?.objects && typeof frame.payload.objects === 'object' ? Object.keys(frame.payload.objects).length : 0 };
        }
        if (message.type === 'teacher.selection.ack' && message.ok && Array.isArray(message.selected)) selected = new Set((message.selected as TeacherStudent[]).map(item => item.participantId));
        if (message.type === 'classroom.submissions' && Array.isArray(message.submissions)) renderSubmissions(message.submissions as Array<{ submissionId: string; submittedBy: string; status: string }>);
        renderStudents(); renderStage();
        syncControlState();
    });
    copyDisplay.addEventListener('click', async () => { if (!displayUrlValue) return; try { await navigator.clipboard.writeText(displayUrlValue); setControlError('大屏地址已复制。'); } catch { setControlError('浏览器未允许复制，请直接选中大屏地址。'); } });
    joinButton.addEventListener('click', () => { void join(); });
    app.querySelector<HTMLButtonElement>('[data-action="claim"]')!.addEventListener('click', () => client.sendControl({ type: 'teacher.lease.claim', expectedRevision: leaseRevision }));
    app.querySelector<HTMLButtonElement>('[data-action="random"]')!.addEventListener('click', () => client.sendControl({ type: 'teacher.selection.random' }));
    app.querySelector<HTMLButtonElement>('[data-action="activity"]')!.addEventListener('click', () => client.sendControl({ type: 'teacher.stage.source', source: 'student-live', expectedRevision: stage?.revision }));
    app.querySelector<HTMLButtonElement>('[data-action="activity-summary"]')!.addEventListener('click', () => client.sendControl({ type: 'teacher.stage.source', source: 'activity', expectedRevision: stage?.revision }));
    app.querySelector<HTMLButtonElement>('[data-action="presentation"]')!.addEventListener('click', () => client.sendControl({ type: 'teacher.stage.source', source: 'presentation', expectedRevision: stage?.revision }));
    app.querySelector<HTMLButtonElement>('[data-action="presentation-play"]')!.addEventListener('click', () => client.sendControl({ type: 'presentation.control', action: 'play', expectedRevision: presentationRevision, controlId: `presentation-play-${Date.now()}` }));
    app.querySelector<HTMLButtonElement>('[data-action="presentation-pause"]')!.addEventListener('click', () => client.sendControl({ type: 'presentation.control', action: 'pause', expectedRevision: presentationRevision, controlId: `presentation-pause-${Date.now()}` }));
    app.querySelector<HTMLButtonElement>('[data-action="annotate"]')!.addEventListener('click', () => client.sendControl({ type: 'teacher.annotation', text: annotation.value, expectedRevision: stage?.revision }));
    app.querySelector<HTMLButtonElement>('[data-action="analytics"]')!.addEventListener('click', () => {
        const participantId = [...selected][0];
        if (participantId) client.sendControl({ type: 'teacher.analytics.request', participantId });
        else analytics.textContent = '请先选择一名学生。';
    });
    confirmAnalytics.addEventListener('click', () => {
        const recommendation = latestAnalytics?.recommendations.find(item => item.status === 'candidate');
        if (latestAnalytics && recommendation) client.sendControl({ type: 'teacher.analytics.confirm', resultId: latestAnalytics.resultId, recommendationId: recommendation.recommendationId, expectedRevision: stage?.revision });
    });
    renderStudents(); renderStage();
    syncControlState();
    if (locator.value.trim() && credential.value.trim()) void join();
}

function mountTeacherControl(root: HTMLElement, sessionId: string): void {
    throw new Error('legacy-teacher-control-disabled-use-authenticated-classroom');
    /*
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
    */
}
