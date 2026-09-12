import { test, expect } from '@playwright/test';

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
        await expect(page.locator('.selection-pane-host .studio-icon')).toHaveCount(2);
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

    test('provides notes, zoom, and a real canvas context menu', async ({ page }) => {
        await page.getByRole('treeitem', { name: /Text 0/ }).click();
        await page.locator('.notes-toggle').press('Enter');
        await expect(page.getByRole('textbox', { name: '当前页面备注' })).toBeVisible();
        await page.locator('.studio-stage').click({ button: 'right' });
        await expect(page.getByRole('menuitem', { name: '复制' })).toBeVisible();
        await expect(page.getByRole('slider', { name: '缩放' })).toBeVisible();
    });

    test('exposes file, text, and transition controls from the active surface', async ({ page }) => {
        await page.getByRole('tab', { name: '文件' }).click();
        await page.getByRole('button', { name: '文件' }).click();
        await expect(page.getByRole('menuitem', { name: '另存为副本' })).toBeVisible();
        await page.keyboard.press('Escape');

        await page.getByRole('treeitem', { name: /Text 0/ }).click();
        await expect(page.getByRole('tab', { name: '文本格式' })).toBeVisible();
        await page.getByRole('tab', { name: '文本格式' }).click();
        await expect(page.getByRole('combobox', { name: '字体' })).toBeVisible();
        await expect(page.getByRole('button', { name: '删除线' })).toBeVisible();

        await page.getByRole('tab', { name: '切换' }).click();
        await expect(page.getByRole('button', { name: '应用到全部页面' })).toBeVisible();
        await expect(page.getByRole('spinbutton', { name: '自动换页毫秒' })).toBeVisible();
    });

    test('offers slide actions when the canvas has no object selection', async ({ page }) => {
        await page.locator('.studio-stage').click({ position: { x: 12, y: 12 } });
        await page.locator('.studio-stage').click({ button: 'right', position: { x: 12, y: 12 } });
        await expect(page.getByRole('menuitem', { name: '新建幻灯片' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: '备注' })).toBeVisible();
    });
});
