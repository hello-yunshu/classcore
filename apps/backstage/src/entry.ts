import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
export const surface = getSurfaceDescriptor('backstage');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS.backstage;

type CourseResource = { resourceId?: string; assetId?: string; path?: string; name?: string; mimeType?: string; size?: number; createdAt?: string };
type CourseActivity = { activityId: string; type: string; participantMode: string; appletCount: number };
type Course = {
    courseId: string; kind: 'lesson-package' | 'workspace'; status?: 'draft' | 'published'; slug?: string; title: string; lessonId?: string; version?: string;
    baseLessonSlug?: string; runnable: boolean; metadata?: Record<string, unknown>; activityCount?: number;
    activities?: CourseActivity[]; resources?: CourseResource[]; resourceCount?: number; presentationId?: string | null;
    presentation?: { deckId: string; title: string } | null; capabilities?: string[]; updatedAt?: string;
};

function classroomOrigin(): string {
    const port = Number(window.location.port || (window.location.protocol === 'https:' ? 443 : 80));
    const classroomPort = port === 9688 ? 9602 : port;
    return `${window.location.protocol}//${window.location.hostname}:${classroomPort}`;
}
function api(path: string): string { return `${classroomOrigin()}${path}`; }
function formatSize(size: number): string { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function button(label: string, action: () => void | Promise<void>, className = ''): HTMLButtonElement {
    const item = document.createElement('button'); item.type = 'button'; item.className = className; item.textContent = label; item.addEventListener('click', () => { void action(); }); return item;
}

export function mountBackstage(root: HTMLElement): void {
    root.replaceChildren();
    const app = document.createElement('main'); app.className = 'backstage-app'; root.append(app);
    app.innerHTML = [
        '<header class="backstage-header"><div><p class="backstage-kicker">CLASSCORE · COURSE DESK</p><h1>课程准备台</h1><p class="backstage-subtitle">把课程内容、互动功能和课堂版本收在一起；发布后，由课堂控制台接管现场。</p></div><div class="backstage-header-meta"><span class="status-dot"></span><span data-field="connection">正在连接课堂服务…</span></div></header>',
        '<section class="backstage-layout"><aside class="course-sidebar"><div class="sidebar-heading"><div><span class="eyebrow">COURSES</span><h2>我的课程</h2></div>'
            + '<button type="button" data-action="create" class="icon-action" aria-label="创建课程">+</button></div><p class="sidebar-note">选择一个课程工作区，准备文件并发布可运行版本。</p>'
            + '<div data-field="courses" class="course-list"></div><form data-field="create-form" class="create-course-form" hidden><label for="new-course-title">课程名称</label>'
            + '<input id="new-course-title" name="title" value="我的公开课" maxlength="80" required><div class="create-course-actions">'
            + '<button type="button" data-action="cancel-create" class="secondary-action">取消</button><button type="submit" class="primary-action">创建</button></div></form></aside>',
        '<section class="course-workspace"><div data-field="empty" class="workspace-empty"><span class="empty-mark">C</span><h2>从一门课程开始</h2><p>创建课程或选择已有 Lesson Package，把 PPT 和课堂资源放进同一个可运行工作区。</p><button type="button" data-action="create-empty" class="primary-action">创建课程</button></div><div data-field="detail" hidden></div></section></section>',
        '<p data-field="status" class="backstage-status" role="status"></p>',
    ].join('');
    const connection = app.querySelector<HTMLElement>('[data-field="connection"]')!;
    const courseList = app.querySelector<HTMLElement>('[data-field="courses"]')!;
    const empty = app.querySelector<HTMLElement>('[data-field="empty"]')!;
    const detail = app.querySelector<HTMLElement>('[data-field="detail"]')!;
    const status = app.querySelector<HTMLElement>('[data-field="status"]')!;
    const createForm = app.querySelector<HTMLFormElement>('[data-field="create-form"]')!;
    const createTitle = createForm.elements.namedItem('title') as HTMLInputElement;
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.hidden = true; fileInput.accept = '.pptx,.ppt,.pdf,.svg,.png,.jpg,.jpeg,.mp3,.wav,.mp4,.json'; app.append(fileInput);
    let courses: Course[] = [];
    let selected: Course | null = null;

    function setStatus(message: string, tone: 'normal' | 'error' = 'normal'): void { status.textContent = message; status.dataset.tone = tone; }
    function renderCourses(): void {
        courseList.replaceChildren();
        if (!courses.length) { courseList.textContent = '还没有课程'; return; }
        for (const course of courses) {
            const item = document.createElement('button'); item.type = 'button'; item.className = `course-list-item ${selected?.courseId === course.courseId ? 'is-selected' : ''}`;
            item.innerHTML = '<span class="course-list-mark"></span><span class="course-list-copy"><strong></strong><small></small></span>';
            item.querySelector('strong')!.textContent = course.title;
            item.querySelector('small')!.textContent = `${course.kind === 'workspace' ? '工作区' : 'Lesson Package'} · ${course.resourceCount ?? 0} 个资源`;
            item.addEventListener('click', () => { selected = course; renderCourses(); renderDetail(); }); courseList.append(item);
        }
    }
    function renderDetail(): void {
        if (!selected) { empty.hidden = false; detail.hidden = true; return; }
        empty.hidden = true; detail.hidden = false; detail.replaceChildren();
        const header = document.createElement('header'); header.className = 'workspace-header';
        const titleBlock = document.createElement('div'); titleBlock.innerHTML = '<span class="eyebrow">COURSE WORKSPACE</span><h2></h2><p></p>';
        titleBlock.querySelector('h2')!.textContent = selected.title;
        titleBlock.querySelector('p')!.textContent = `${selected.kind === 'workspace' ? '自有课程工作区' : '内置 Lesson Package'} · ${selected.baseLessonSlug ?? selected.slug ?? 'unknown'}`;
        const headerActions = document.createElement('div'); headerActions.className = 'workspace-actions';
        const publish = button('发布版本', () => publishCourse(), 'secondary-action'); publish.hidden = selected.kind !== 'workspace' || selected.status === 'published';
        const start = button('开始课堂', () => startCourse(), 'primary-action'); start.disabled = !selected.runnable;
        headerActions.append(publish, start); if (selected.kind === 'workspace') headerActions.append(button('导入资源', () => fileInput.click(), 'secondary-action'));
        header.append(titleBlock, headerActions); detail.append(header);

        const readiness = document.createElement('section');
        readiness.className = `readiness-strip ${selected.runnable ? '' : 'is-pending'}`;
        const readinessTitle = selected.kind === 'workspace' && selected.status !== 'published'
            ? '课程尚未发布' : selected.runnable ? '课程可以运行' : '需要补齐运行基座';
        const readinessCopy = selected.kind === 'workspace' && selected.status !== 'published'
            ? '完成资源准备后发布一个版本，课堂控制台只运行已发布版本。'
            : selected.runnable ? '开始课堂后会固定此课程版本，内容修改不会影响正在进行的课堂。'
                : '请先绑定一个可运行的 Lesson Package。';
        readiness.innerHTML = `<span class="readiness-icon">${selected.runnable ? '✓' : '!'}</span><div><strong>${readinessTitle}</strong><span>${readinessCopy}</span></div>`;
        detail.append(readiness);
        const grid = document.createElement('div'); grid.className = 'workspace-grid';
        const resources = document.createElement('section');
        resources.className = 'workspace-section';
        resources.innerHTML = [
            '<div class="section-title"><div><span class="eyebrow">01 · RESOURCES</span><h3>课程文件</h3></div><span class="section-count"></span></div>',
            '<p class="section-note">PPT、图片和其他资源会随课程工作区保存；PPT 导入后会自动生成可发布的 Presentation。</p>',
            '<div class="resource-list"></div>',
        ].join('');
        resources.querySelector('.section-count')!.textContent = `${selected.resources?.length ?? 0} 个`;
        const resourceList = resources.querySelector('.resource-list')!;
        for (const resource of selected.resources ?? []) {
            const row = document.createElement('div');
            row.className = 'resource-row';
            row.innerHTML = '<span class="resource-type"></span><div><strong></strong><small></small></div>';
            const resourceName = resource.name ?? resource.path ?? resource.assetId ?? 'resource';
            row.querySelector('.resource-type')!.textContent = resourceName.split('.').pop()?.toUpperCase() ?? 'FILE';
            row.querySelector('strong')!.textContent = resourceName;
            row.querySelector('small')!.textContent = `${resource.mimeType ?? '课程资源'} · ${resource.size ? formatSize(resource.size) : '随课程包'}`;
            resourceList.append(row);
        }
        if (!resourceList.childElementCount) resourceList.textContent = '还没有文件；从导入 PPT 开始。';
        grid.append(resources);
        const activities = document.createElement('section');
        activities.className = 'workspace-section';
        activities.innerHTML = [
            '<div class="section-title"><div><span class="eyebrow">02 · RUNBOOK</span><h3>课堂活动</h3></div><span class="section-count"></span></div>',
            '<p class="section-note">活动和 Applet 来自课程的 Lesson Package 基座，保持 Core 与课程内容分离。</p>',
            '<div class="activity-list"></div>',
        ].join('');
        activities.querySelector('.section-count')!.textContent = `${selected.activities?.length ?? 0} 个`;
        const activityList = activities.querySelector('.activity-list')!;
        for (const activity of selected.activities ?? []) {
            const row = document.createElement('div');
            row.className = 'activity-row';
            row.innerHTML = '<div class="activity-index"></div><div><strong></strong><small></small></div>';
            row.querySelector('.activity-index')!.textContent = String((selected.activities ?? []).indexOf(activity) + 1).padStart(2, '0');
            row.querySelector('strong')!.textContent = activity.type;
            row.querySelector('small')!.textContent = `${activity.participantMode} · ${activity.appletCount} 个互动组件`;
            activityList.append(row);
        }
        grid.append(activities); detail.append(grid);
        const footer = document.createElement('footer'); footer.className = 'workspace-footer';
        const studioLink = document.createElement('a');
        const studioUrl = new URL('/authoring', window.location.origin);
        studioUrl.searchParams.set('courseId', selected.courseId);
        studioUrl.searchParams.set('courseTitle', selected.title);
        if (selected.presentationId) studioUrl.searchParams.set('presentationId', selected.presentationId);
        studioLink.href = studioUrl.toString(); studioLink.textContent = selected.presentationId ? '打开本课程课件' : '打开备课创作台';
        footer.append(Object.assign(document.createElement('span'), { textContent: '发布前建议完成课程检查。' }), studioLink); detail.append(footer);
    }
    async function loadCourses(): Promise<void> {
        try {
            const response = await fetch(api('/api/courses'), { cache: 'no-store' });
            if (!response.ok) throw new Error(`课程服务返回 ${response.status}`);
            const payload = await response.json() as { courses: Course[] };
            courses = payload.courses ?? [];
            connection.textContent = `课堂服务已连接 · ${courses.length} 门课程`;
            selected = courses.find(item => item.courseId === selected?.courseId) ?? courses[0] ?? null;
            renderCourses(); renderDetail();
        }
        catch (error) { connection.textContent = '课程服务暂未连接'; setStatus(error instanceof Error ? error.message : '课程读取失败', 'error'); }
    }
    function openCreateForm(): void {
        createForm.hidden = false;
        createTitle.focus();
        createTitle.select();
    }
    function closeCreateForm(): void { createForm.hidden = true; }
    async function createCourse(titleValue: string): Promise<void> {
        const title = titleValue.trim(); if (!title) return;
        closeCreateForm();
        setStatus('正在创建课程…');
        try {
            const response = await fetch(api('/api/courses'), {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
            });
            if (!response.ok) throw new Error(`创建失败（${response.status}）`);
            const payload = await response.json() as { course: Course };
            courses = [payload.course, ...courses]; selected = payload.course;
            renderCourses(); renderDetail(); setStatus(`已创建课程 · ${title}`);
        }
        catch (error) { setStatus(error instanceof Error ? error.message : '课程创建失败', 'error'); }
    }
    async function uploadResource(file: File): Promise<void> {
        if (!selected || selected.kind !== 'workspace') return;
        setStatus(`正在导入 ${file.name}…`);
        try {
            const response = await fetch(api(`/api/courses/${encodeURIComponent(selected.courseId)}/resources`), {
                method: 'POST',
                headers: { 'content-type': file.type || 'application/octet-stream', 'x-classcore-resource-name': encodeURIComponent(file.name) },
                body: await file.arrayBuffer(),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error ? `导入失败：${payload.error}` : `导入失败（${response.status}）`);
            }
            const payload = await response.json() as { course: Course };
            selected = payload.course;
            courses = courses.map(item => item.courseId === selected!.courseId ? selected! : item);
            renderCourses(); renderDetail(); setStatus(`已加入课程 · ${file.name}`);
        }
        catch (error) { setStatus(error instanceof Error ? error.message : '资源导入失败', 'error'); }
    }
    async function publishCourse(): Promise<void> {
        if (!selected || selected.kind !== 'workspace') return; setStatus(`正在发布「${selected.title}」…`);
        try {
            const response = await fetch(api(`/api/courses/${encodeURIComponent(selected.courseId)}/publish`), { method: 'POST' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error ? `发布失败：${payload.error}` : `发布失败（${response.status}）`);
            }
            const payload = await response.json() as { course: Course };
            selected = payload.course;
            courses = courses.map(item => item.courseId === selected!.courseId ? selected! : item);
            renderCourses(); renderDetail(); setStatus(`已发布课程版本 · ${selected.title}`);
        }
        catch (error) { setStatus(error instanceof Error ? error.message : '课程发布失败', 'error'); }
    }
    async function startCourse(): Promise<void> {
        if (!selected) return; setStatus(`正在启动「${selected.title}」…`);
        try {
            const response = await fetch(api(`/api/courses/${encodeURIComponent(selected.courseId)}/start`), { method: 'POST' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error ? `无法开始课堂：${payload.error}` : `无法开始课堂（${response.status}）`);
            }
            const payload = await response.json() as { joinUrls: { teacher: string } };
            window.location.href = payload.joinUrls.teacher;
        }
        catch (error) { setStatus(error instanceof Error ? error.message : '课堂启动失败', 'error'); }
    }
    app.querySelector<HTMLButtonElement>('[data-action="create"]')!.addEventListener('click', openCreateForm);
    app.querySelector<HTMLButtonElement>('[data-action="create-empty"]')!.addEventListener('click', openCreateForm);
    app.querySelector<HTMLButtonElement>('[data-action="cancel-create"]')!.addEventListener('click', closeCreateForm);
    createForm.addEventListener('submit', event => { event.preventDefault(); void createCourse(createTitle.value); });
    fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (file) void uploadResource(file); fileInput.value = ''; });
    void loadCourses();
}
