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
    root.replaceChildren();
    const app = document.createElement('main'); app.className = 'teacher-library'; root.append(app);
    const header = document.createElement('header'); header.className = 'library-header';
    header.innerHTML = '<div><p class="library-kicker">CLASSCORE · TEACHER DESK</p><h1>我的课件</h1><p class="library-subtitle">把要讲的内容留在手边，把课堂版本留在服务器。</p></div>';
    const headerActions = document.createElement('div'); headerActions.className = 'library-actions';
    const importInput = document.createElement('input'); importInput.type = 'file'; importInput.accept = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'; importInput.hidden = true;
    const status = document.createElement('p'); status.className = 'library-status';
    headerActions.append(button('新建课件', () => { window.location.href = authoringUrl(); }, 'primary-action'), button('导入 PPTX', () => importInput.click(), 'secondary-action'), importInput);
    header.append(headerActions); app.append(header, status);
    const toolbar = document.createElement('div'); toolbar.className = 'library-toolbar';
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = '搜索课件'; search.setAttribute('aria-label', '搜索课件'); toolbar.append(search); app.append(toolbar);
    const content = document.createElement('section'); content.className = 'library-content'; app.append(content);
    let projects: PresentationProject[] = [];

    function render(): void {
        content.replaceChildren();
        const query = search.value.trim().toLowerCase();
        const visible = projects.filter(project => !query || project.title.toLowerCase().includes(query));
        const heading = document.createElement('div'); heading.className = 'section-heading'; heading.innerHTML = `<span>最近编辑</span><span>${visible.length} 份</span>`; content.append(heading);
        if (!visible.length) {
            const empty = document.createElement('div'); empty.className = 'library-empty'; empty.innerHTML = '<strong>还没有课件</strong><span>新建一个空白课件，或导入已有 PPTX。</span>'; empty.append(button('开始制作', () => { window.location.href = authoringUrl(); }, 'primary-action')); content.append(empty); return;
        }
        const grid = document.createElement('div'); grid.className = 'presentation-grid';
        for (const project of visible) {
            const card = document.createElement('article'); card.className = 'presentation-card';
            const preview = document.createElement('div'); preview.className = 'card-preview'; preview.innerHTML = '<span class="preview-mark">C</span><span class="preview-lines"></span>';
            const details = document.createElement('div'); details.className = 'card-details';
            const title = document.createElement('h2'); title.textContent = project.title;
            const meta = document.createElement('p'); meta.textContent = `${project.currentDraftDocument?.pageCount ?? '—'} 页 · ${formatUpdatedAt(project.updatedAt)}`; details.append(title, meta);
            const actions = document.createElement('div'); actions.className = 'card-actions';
            actions.append(button('编辑', () => { window.location.href = authoringUrl(project.presentationId); }, 'card-primary'), button('删除', async () => {
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
