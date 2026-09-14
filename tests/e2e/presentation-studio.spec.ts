import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import JSZip from 'jszip';

test.describe('Presentation Studio command surface', () => {
    test.beforeEach(async ({ page }) => {
        if (!process.env.CLASSCORE_PRESENTATION_URL) throw new Error('CLASSCORE_PRESENTATION_URL is required; presentation E2E must never silently skip');
        await page.goto('/authoring');
    });

    test('exposes Office-like tabs and icon-backed quick access', async ({ page }) => {
        await expect(page.getByRole('tab', { name: '开始' })).toBeVisible();
        await expect(page.getByRole('tab', { name: '插入' })).toBeVisible();
        await expect(page.getByRole('tab', { name: '视图' })).toBeVisible();
        await expect(page.getByRole('button', { name: /保存.*⌘\/Ctrl\+S/ })).toBeVisible();
        await page.getByRole('tab', { name: '开始' }).click();
        await expect(page.getByRole('button', { name: '排列' })).toBeVisible();
    });

    test('opens a nested arrange menu with keyboard focus', async ({ page }) => {
        await page.getByRole('tab', { name: '开始' }).click();
        const arrange = page.getByRole('button', { name: '排列' });
        await arrange.click();
        await expect(page.locator('.command-menu-divider')).toHaveCount(2);
        await expect(page.getByRole('menuitem', { name: '对齐' })).toBeVisible();
        await page.getByRole('menuitem', { name: '对齐' }).hover();
        await expect(page.getByRole('menuitem', { name: '左对齐' })).toBeVisible();
        const alignmentIcons = await page.locator('.command-submenu.is-open > .command-menu-entry > .command-menu-item > .studio-icon').evaluateAll(nodes => nodes.map(node => node.getAttribute('class')));
        expect(new Set(alignmentIcons).size).toBe(6);
        await expect(page.locator('.command-menu-heading')).toHaveCount(0);
        await page.keyboard.press('Escape');
    });

    test('mounts the real selection pane instead of a duplicate object list', async ({ page }) => {
        await page.getByRole('tab', { name: '视图' }).click();
        await page.getByRole('button', { name: '选择窗格' }).click();
        await expect(page.locator('.selection-pane-host')).toBeVisible();
        await expect(page.locator('.object-list')).toHaveCount(0);
        await expect(page.locator('.selection-pane-host [data-pane-element]')).toHaveCount(2);
        await expect(page.locator('.selection-pane-host .studio-icon')).toHaveCount(4);
        await expect(page.locator('.selection-pane-host')).not.toContainText('🔓');
    });

    test('keeps local icons and exposes editor controls without ellipsis placeholders', async ({ page }) => {
        await page.getByRole('tab', { name: '插入' }).click();
        await expect(page.getByRole('button', { name: '形状', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '表格', exact: true })).toBeVisible();
        await page.getByRole('button', { name: '形状', exact: true }).click();
        await expect(page.getByRole('menuitem', { name: '矩形', exact: true })).toBeVisible();
        await expect(page.locator('.gallery-picker .preview-rect')).toBeVisible();
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '表格', exact: true }).click();
        await expect(page.getByRole('menuitem', { name: '4 × 4', exact: true })).toBeVisible();
        expect(await page.locator('.studio-icon').count()).toBeGreaterThan(8);
        await expect(page.locator('.toolbar-label')).toHaveCount(0);
        await expect(page.getByRole('button', { name: '图片' }).first()).toBeVisible();
        await expect(page.locator('.context-toolbar')).not.toContainText('...');
    });

    test('inserts a neutral text box and opens native text editing', async ({ page }) => {
        await page.getByRole('tab', { name: '插入' }).click();
        await page.getByRole('button', { name: '文本框', exact: true }).click();
        const editor = page.getByRole('textbox', { name: '编辑文本框内容' });
        await expect(editor).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('编辑文本框内容');
        // Keep one native input node throughout CJK/IME entry, then commit the
        // final string to web-ppt when canvas text editing ends.
        await editor.pressSequentially('连续输入课堂标题');
        await expect(editor).toHaveValue('连续输入课堂标题');
        await editor.press('Escape');
        await expect(editor).toHaveCount(0);
        const committedTextBox = page.locator('[data-edit-id]').filter({ hasText: '连续输入课堂标题' });
        await expect(committedTextBox).toHaveCount(1);
        await committedTextBox.locator('text').first().dblclick();
        await expect(editor).toBeVisible();
        await expect(editor).toHaveValue('连续输入课堂标题');
        await editor.press('Escape');
        await page.getByRole('button', { name: '形状', exact: true }).click();
        await page.getByRole('menuitem', { name: '矩形', exact: true }).click();
        const insertedShape = page.locator('[data-edit-id]').last().locator('path').first();
        await expect(insertedShape).toHaveAttribute('fill', 'none');
        await expect(insertedShape).toHaveAttribute('stroke', /rgb\(107,\s*114,\s*128\)/);
    });

    test('provides notes, zoom, and a real canvas context menu', async ({ page }) => {
        await page.getByRole('treeitem', { name: /文本/ }).click();
        await page.locator('.notes-toggle').press('Enter');
        await expect(page.getByRole('textbox', { name: '当前页面备注' })).toBeVisible();
        await page.locator('.studio-stage').click({ button: 'right' });
        await expect(page.getByRole('menuitem', { name: '复制' })).toBeVisible();
        await expect(page.getByRole('slider', { name: '缩放' })).toBeVisible();
        await expect(page.getByRole('button', { name: '适应窗口并恢复默认大小' })).toBeVisible();
    });

    test('provides an editable animation timeline with classroom-friendly timing controls', async ({ page }) => {
        await page.getByRole('treeitem', { name: /文本/ }).click();
        await page.getByRole('tab', { name: '动画' }).click();
        await page.getByRole('button', { name: '打开动画窗格' }).click();
        await page.getByRole('combobox', { name: '默认触发方式' }).selectOption('afterPrev');
        await page.locator('.gallery-item').filter({ hasText: '淡入' }).click();
        await expect(page.getByText('1 个步骤', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '选择对象：文本' })).toBeVisible();
        await expect(page.getByRole('combobox', { name: '效果' })).toHaveValue('fade');
        await expect(page.getByRole('combobox', { name: '触发方式', exact: true })).toHaveValue('click');
        await expect(page.getByRole('spinbutton', { name: '时长', exact: true })).toHaveValue('0.30');
        await expect(page.getByRole('spinbutton', { name: '延迟', exact: true })).toHaveValue('0.00');
        await page.getByRole('combobox', { name: '触发方式', exact: true }).selectOption('afterPrev');
        await expect(page.getByRole('combobox', { name: '触发方式', exact: true })).toHaveValue('afterPrev');
        await page.getByRole('spinbutton', { name: '时长', exact: true }).fill('0.75');
        await page.getByRole('spinbutton', { name: '时长', exact: true }).press('Tab');
        await expect(page.getByRole('spinbutton', { name: '时长', exact: true })).toHaveValue('0.75');
        await page.getByRole('button', { name: '清除本页动画' }).click();
        await expect(page.getByText('还没有动画步骤')).toBeVisible();
    });

    test('exports the latest editor state without waiting for autosave', async ({ page }) => {
        await page.getByRole('tab', { name: '插入' }).click();
        await page.getByRole('button', { name: '文本框', exact: true }).click();
        const editor = page.getByRole('textbox', { name: '编辑文本框内容' });
        await editor.fill('立即导出的最新内容');
        await editor.press('Escape');

        await page.getByRole('tab', { name: '文件' }).click();
        await page.getByRole('button', { name: '文件' }).click();
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('menuitem', { name: '导出 PPTX' }).click();
        const download = await downloadPromise;
        const downloadPath = await download.path();
        expect(downloadPath).not.toBeNull();
        const exported = await JSZip.loadAsync(fs.readFileSync(downloadPath!));
        const slideXml = await exported.file('ppt/slides/slide1.xml')?.async('string');
        expect(slideXml).toContain('立即导出的最新内容');
    });

    test('groups selected-object inspector controls into clear, responsive sections', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 900 });
        await expect(page.getByText('选择页面，快速调整顺序和内容。', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '第 1 页', exact: true })).toHaveAttribute('aria-current', 'page');
        await expect(page.getByRole('button', { name: '新建页面', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '复制页面', exact: true })).toBeVisible();
        await expect(page.locator('.scene-reorder-actions .danger-button')).toBeDisabled();
        await page.getByRole('treeitem', { name: /文本/ }).click();
        await page.getByRole('button', { name: '对象', exact: true }).click();

        await expect(page.getByRole('heading', { name: '文本' })).toBeVisible();
        await expect(page.getByText('位置与尺寸', { exact: true })).toBeVisible();
        await expect(page.getByText('填充与描边', { exact: true })).toBeVisible();
        await expect(page.getByText('文字内容', { exact: true })).toBeVisible();
        await expect(page.getByText('排列与显示', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '复制对象' })).toBeVisible();
        await expect(page.getByRole('button', { name: '删除对象' })).toBeVisible();
        await expect(page.getByRole('textbox', { name: '对象文字' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

        await page.getByRole('button', { name: '页面', exact: true }).click();
        await expect(page.getByRole('heading', { name: '第 1 页' })).toBeVisible();
        await expect(page.getByText('页面背景', { exact: true })).toBeVisible();
        await expect(page.getByText('教师备注', { exact: true })).toBeVisible();
        await expect(page.getByText('页面状态', { exact: true })).toBeVisible();
        await expect(page.getByRole('textbox', { name: '教师备注' })).toBeVisible();
        await expect(page.getByRole('button', { name: '隐藏页面' })).toBeVisible();
        await page.getByRole('button', { name: '动画', exact: true }).click();
        await expect(page.getByRole('heading', { name: '第 1 页动画' })).toBeVisible();
        await page.getByRole('button', { name: '对象', exact: true }).click();
        await expect(page.getByText('位置与尺寸', { exact: true })).toBeVisible();
    });

    test('keeps a zoomed canvas scrollable without covering short-wide chrome', async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 650 });
        const stageTitle = page.locator('.stage-titlebar');
        const stageViewport = page.locator('.studio-stage');
        const stageFooter = page.locator('.stage-footer');
        const notesPane = page.locator('.notes-pane');
        const statusBar = page.locator('.status-bar');
        const readVerticalOrder = () => Promise.all([stageTitle, stageViewport, stageFooter, notesPane, statusBar]
            .map(locator => locator.evaluate(element => {
                const rect = element.getBoundingClientRect();
                return { top: rect.top, bottom: rect.bottom };
            })));
        await expect.poll(async () => {
            const verticalOrder = await readVerticalOrder();
            return verticalOrder[1].top >= verticalOrder[0].bottom
                && verticalOrder[2].top >= verticalOrder[1].bottom
                && verticalOrder[3].top >= verticalOrder[2].bottom
                && verticalOrder[4].top >= verticalOrder[3].bottom;
        }).toBe(true);

        const stageFrameMatches = () => stageViewport.evaluate(element => {
            const stage = element.querySelector('[data-ppt-stage]');
            if (!stage) return false;
            const viewportRect = element.getBoundingClientRect();
            const stageRect = stage.getBoundingClientRect();
            return Math.abs(viewportRect.width - stageRect.width) <= .5
                && Math.abs(viewportRect.height - stageRect.height) <= .5
                && Math.abs(viewportRect.width / viewportRect.height - stageRect.width / stageRect.height) <= .001;
        });
        await expect.poll(stageFrameMatches).toBe(true);

        await page.getByRole('slider', { name: '缩放' }).fill('25');
        await expect.poll(stageFrameMatches).toBe(true);

        await page.getByRole('slider', { name: '缩放' }).fill('150');
        await expect.poll(() => stageViewport.evaluate(element => ({
            horizontal: element.scrollWidth > element.clientWidth,
            vertical: element.scrollHeight > element.clientHeight,
        }))).toEqual({ horizontal: true, vertical: true });
        await expect(page.getByText('150%', { exact: true })).toBeVisible();

        await stageViewport.hover();
        const beforeWheel = await stageViewport.evaluate(element => element.scrollTop);
        await page.mouse.wheel(0, 180);
        await expect.poll(() => stageViewport.evaluate(element => element.scrollTop)).toBeGreaterThan(beforeWheel);
        await stageViewport.evaluate(element => { element.scrollLeft = 0; });
        const beforeTrackpad = await stageViewport.evaluate(element => element.scrollLeft);
        await page.mouse.wheel(180, 0);
        await expect.poll(() => stageViewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(beforeTrackpad);

        await page.getByRole('button', { name: '适应窗口并恢复默认大小' }).click();
        await expect.poll(() => stageViewport.evaluate(element => ({
            horizontal: element.scrollWidth > element.clientWidth,
            vertical: element.scrollHeight > element.clientHeight,
            left: element.scrollLeft,
            top: element.scrollTop,
        }))).toEqual({ horizontal: false, vertical: false, left: 0, top: 0 });
        const fittedGaps = await stageViewport.evaluate(element => {
            const stage = element.querySelector('[data-ppt-stage]');
            if (!stage) return null;
            const viewportRect = element.getBoundingClientRect();
            const stageRect = stage.getBoundingClientRect();
            const viewportLeft = viewportRect.left + element.clientLeft;
            const viewportTop = viewportRect.top + element.clientTop;
            return {
                width: Math.abs(stageRect.width - element.clientWidth),
                height: Math.abs(stageRect.height - element.clientHeight),
                horizontalCenter: Math.abs((stageRect.left - viewportLeft)
                    - (viewportLeft + element.clientWidth - stageRect.right)),
                verticalCenter: Math.abs((stageRect.top - viewportTop)
                    - (viewportTop + element.clientHeight - stageRect.bottom)),
            };
        });
        expect(fittedGaps).not.toBeNull();
        expect(Math.min(fittedGaps!.width, fittedGaps!.height)).toBeLessThanOrEqual(1);
        expect(fittedGaps!.horizontalCenter).toBeLessThanOrEqual(1);
        expect(fittedGaps!.verticalCenter).toBeLessThanOrEqual(1);
    });

    test('keeps the status bar after the canvas and notes in the narrow stacked layout', async ({ page }) => {
        await page.setViewportSize({ width: 820, height: 900 });
        const notesBottom = await page.locator('.notes-pane').evaluate(element => element.getBoundingClientRect().bottom);
        const inspectorBounds = await page.locator('.inspector-panel').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom };
        });
        const statusTop = await page.locator('.status-bar').evaluate(element => element.getBoundingClientRect().top);
        expect(inspectorBounds.top).toBeGreaterThanOrEqual(notesBottom);
        expect(statusTop).toBeGreaterThanOrEqual(inspectorBounds.bottom);
        expect(await page.evaluate(() => document.body.scrollHeight)).toBeGreaterThan(900);
    });

    test('exposes file, text, and transition controls from the active surface', async ({ page }) => {
        await page.getByRole('tab', { name: '文件' }).click();
        await page.getByRole('button', { name: '文件' }).click();
        await expect(page.getByRole('menuitem', { name: '另存为副本' })).toBeVisible();
        await page.keyboard.press('Escape');

        await page.getByRole('treeitem', { name: /文本/ }).click();
        await expect(page.getByRole('tab', { name: '文本格式' })).toBeVisible();
        await page.getByRole('tab', { name: '文本格式' }).click();
        await expect(page.getByRole('combobox', { name: '字体' })).toBeVisible();
        await expect(page.getByRole('button', { name: '删除线' })).toBeVisible();

        await page.getByRole('tab', { name: '切换' }).click();
        await expect(page.getByRole('button', { name: '应用到全部页面' })).toBeVisible();
        await expect(page.getByRole('spinbutton', { name: '自动换页毫秒' })).toBeVisible();
    });

    test('uses text centering in the floating toolbar and exposes text edits in a menu', async ({ page }) => {
        await page.getByRole('treeitem', { name: /文本/ }).click();
        const floatingToolbar = page.locator('.floating-toolbar');
        await expect(floatingToolbar).toBeVisible();
        const textSplit = floatingToolbar.locator('.command-split');
        await expect(textSplit.locator('.command-split-main')).toBeVisible();
        await expect(textSplit.locator('.command-split-main')).toHaveAttribute('aria-label', '文本居中');
        await textSplit.locator('.command-dropdown-trigger').click();
        await expect(floatingToolbar.getByRole('menuitem', { name: '居中' })).toBeVisible();
        await expect(floatingToolbar.getByRole('menuitem', { name: '加粗' })).toBeVisible();
        await floatingToolbar.getByRole('menuitem', { name: '居中' }).click();
    });

    test('offers slide actions when the canvas has no object selection', async ({ page }) => {
        await page.locator('.studio-stage').click({ position: { x: 12, y: 12 } });
        await page.locator('.studio-stage').click({ button: 'right', position: { x: 12, y: 12 } });
        await expect(page.getByRole('menuitem', { name: '新建幻灯片' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: '备注' })).toBeVisible();
    });
});
