import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PresentationLibraryStore, PresentationLibraryError } from '../apps/server/runtime/presentation-library.mjs';

function makeStore(policy = {}) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classcore-presentation-library-'));
    const store = new PresentationLibraryStore(dataDir, { policy });
    return { dataDir, store };
}

const runtimeIndex = {
    deckId: 'deck:one',
    documentFormatVersion: 'web-ppt-ooxml-v1',
    generatedAt: '2026-09-11T00:00:00.000Z',
    scenes: [{ sceneId: 'scene:1', index: 0, maxStep: 1 }],
};

test('Presentation Library deduplicates assets and keeps autosave out of permanent revisions', () => {
    const { dataDir, store } = makeStore({ recoveryCheckpointCount: 3 });
    try {
        const first = store.createPresentation({ ownerUserId: 'teacher:1', title: '图案的还原', bytes: Buffer.from('same'), mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', document: { format: 'web-ppt-ooxml-v1', pageCount: 1 } });
        let revision = first.currentDraftRevision;
        for (let index = 0; index < 50; index += 1) {
            const saved = store.saveDraft(first.presentationId, 'teacher:1', { bytes: Buffer.from('same'), expectedRevision: revision, document: first.currentDraftDocument });
            revision = saved.currentDraftRevision;
        }
        assert.equal(store.listRevisions(first.presentationId, 'teacher:1').length, 0);
        assert.equal(store.uniqueReferencedBytes('teacher:1'), 4);
        const asset = store.getAsset(first.currentDraftAssetId);
        assert.equal(fs.readdirSync(path.dirname(path.join(dataDir, asset.storagePath))).length, 1);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('draft saves reject stale editors and preserve bounded recovery checkpoints', () => {
    const { dataDir, store } = makeStore({ recoveryCheckpointCount: 2 });
    try {
        const first = store.createPresentation({ ownerUserId: 'teacher:1', title: '课件', bytes: Buffer.from('a'), document: { format: 'test' } });
        const second = store.saveDraft(first.presentationId, 'teacher:1', { bytes: Buffer.from('b'), expectedRevision: 1, document: { format: 'test' } });
        assert.throws(() => store.saveDraft(first.presentationId, 'teacher:1', { bytes: Buffer.from('c'), expectedRevision: 1, document: { format: 'test' } }), error => error instanceof PresentationLibraryError && error.code === 'draft-conflict');
        store.saveDraft(first.presentationId, 'teacher:1', { bytes: Buffer.from('c'), expectedRevision: second.currentDraftRevision, document: { format: 'test' } });
        store.saveDraft(first.presentationId, 'teacher:1', { bytes: Buffer.from('d'), expectedRevision: 3, document: { format: 'test' } });
        const count = store.db.prepare('SELECT COUNT(*) AS n FROM presentation_checkpoints WHERE presentation_id=?').get(first.presentationId).n;
        assert.equal(Number(count), 2);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('rehearsal is immutable and expires independently from published revisions', () => {
    const { dataDir, store } = makeStore({ rehearsalRetentionDays: 1 });
    try {
        const project = store.createPresentation({ ownerUserId: 'teacher:1', title: '课件', bytes: Buffer.from('pptx'), document: { format: 'test' } });
        const rehearsal = store.createRevision(project.presentationId, 'teacher:1', { kind: 'rehearsal', engine: { engineId: 'web-ppt', engineVersion: '1', documentFormatVersion: 'test' }, runtimeIndex });
        const published = store.createRevision(project.presentationId, 'teacher:1', { kind: 'published', engine: { engineId: 'web-ppt', engineVersion: '1', documentFormatVersion: 'test' }, runtimeIndex });
        const restored = store.restoreRevision(project.presentationId, 'teacher:1', published.revisionId);
        assert.equal(restored.currentDraftAssetId, project.currentDraftAssetId);
        assert.equal(store.getRevision(published.revisionId, 'teacher:1').fingerprint, published.fingerprint);
        assert.deepEqual(store.expireRehearsals(new Date(Date.now() + 2 * 86400000)), [rehearsal.revisionId]);
        assert.ok(store.getRevision(published.revisionId, 'teacher:1'));
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('session pin and prepared runtime cache stay on the exact revision', () => {
    const { dataDir, store } = makeStore({ maxRuntimePresentationCacheBytes: 5 });
    try {
        const project = store.createPresentation({ ownerUserId: 'teacher:1', title: '课件', bytes: Buffer.from('pptx'), document: { format: 'test' } });
        const published = store.createRevision(project.presentationId, 'teacher:1', { kind: 'published', engine: { engineId: 'web-ppt', engineVersion: '1', documentFormatVersion: 'test' }, runtimeIndex });
        const prepared = store.prepareRuntimeCache('session:1', 'teacher:1', { presentationId: project.presentationId, revisionId: published.revisionId });
        assert.equal(store.getSessionPin('session:1').revisionId, published.revisionId);
        assert.equal(fs.readFileSync(prepared.cachePath, 'utf8'), 'pptx');
        assert.equal(store.getAsset(prepared.assetId).sha256, published.fingerprint);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('unreferenced assets are marked before grace-period deletion', () => {
    const { dataDir, store } = makeStore({ gcGracePeriodMs: 1000, recoveryCheckpointCount: 0 });
    try {
        const project = store.createPresentation({ ownerUserId: 'teacher:1', title: '课件', bytes: Buffer.from('old'), document: { format: 'test' } });
        const oldAsset = project.currentDraftAssetId;
        const next = store.saveDraft(project.presentationId, 'teacher:1', { bytes: Buffer.from('new'), expectedRevision: 1, document: { format: 'test' } });
        assert.equal(next.currentDraftAssetId === oldAsset, false);
        const marked = store.collectGarbage(new Date('2026-09-11T00:00:00.000Z'));
        assert.deepEqual(marked, [{ assetId: oldAsset, action: 'marked' }]);
        const deleted = store.collectGarbage(new Date('2026-09-11T00:00:02.000Z'));
        assert.deepEqual(deleted, [{ assetId: oldAsset, action: 'deleted' }]);
        assert.equal(store.getAsset(oldAsset), null);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
