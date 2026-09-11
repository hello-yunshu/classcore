import { test, expect } from '@playwright/test';

test.describe('Presentation Studio command surface', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.CLASSCORE_PRESENTATION_URL, 'set CLASSCORE_PRESENTATION_URL to run against a real Studio server');
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
        await expect(page.getByRole('menuitem', { name: '对齐' })).toBeVisible();
        await page.getByRole('menuitem', { name: '对齐' }).hover();
        await expect(page.getByRole('menuitem', { name: '左对齐' })).toBeVisible();
        await page.keyboard.press('Escape');
    });

    test('mounts the real selection pane instead of a duplicate object list', async ({ page }) => {
        await page.getByRole('tab', { name: '视图' }).click();
        await page.getByRole('button', { name: '选择窗格' }).click();
        await expect(page.locator('.selection-pane-host')).toBeVisible();
        await expect(page.locator('.object-list')).toHaveCount(0);
    });
});

