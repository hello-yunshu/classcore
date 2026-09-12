import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entry = await readFile(new URL('../apps/presentation-studio/src/entry.ts', import.meta.url), 'utf8');
const commandSurface = await readFile(new URL('../apps/presentation-studio/src/command-surface.ts', import.meta.url), 'utf8');

test('Studio uses local command-surface primitives and real Selection Pane mounting', () => {
    assert.match(commandSurface, /createSplitButton/);
    assert.match(commandSurface, /createDropdown/);
    assert.match(commandSurface, /createGallery/);
    assert.match(entry, /webPpt\.attachSelectionPane\(selectionPaneHost\)/);
    assert.doesNotMatch(entry, /webPpt\.attachSelectionPane\(null\)/);
    assert.doesNotMatch(entry, /function createObjectList/);
});

test('pending presentation sync is keyed by presentation id and does not clear the whole index', () => {
    assert.match(entry, /type PendingSyncIndex = Record<string, PendingSyncMetadata>/);
    assert.match(entry, /index\[project\.presentationId\]/);
    assert.match(entry, /clearPendingSyncMetadata\(serverProject\?\.presentationId\)/);
    assert.doesNotMatch(entry, /function clearPendingSyncMetadata\(\): void/);
});

test('Studio keeps command and recovery state explicit and scoped', async () => {
    const e2e = await readFile(new URL('./e2e/presentation-studio.spec.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(entry, /ICON_BY_LABEL|iconForLabel|startsWith\(/);
    assert.doesNotMatch(commandSurface, /aria-pressed.*Boolean\(command\.checked\)/);
    assert.match(commandSurface, /menuDismissListenerBound/);
    assert.match(entry, /scopedStorageKey\(DRAFT_META_PREFIX/);
    assert.match(entry, /loadWebPptDraft\(p\w+\.presentationId\)/);
    assert.match(entry, /controller\.rotateMany/);
    assert.match(entry, /⌘\/Ctrl\+Shift\+G/);
    assert.doesNotMatch(e2e, /test\.skip\(/);
});

test('production Studio seed content is generic rather than lesson-specific', () => {
    assert.match(entry, /text: '标题'/);
    assert.match(entry, /text: '副标题'/);
    assert.doesNotMatch(entry, /图案的还原/);
    assert.doesNotMatch(entry, /观察碎片，寻找旋转与平移的关系/);
});
