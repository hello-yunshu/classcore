import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PresentationLibraryStore, PresentationLibraryError } from '../apps/server/runtime/presentation-library.mjs';
import { SqliteClassroomStateStore } from '../apps/server/runtime/sqlite-store.mjs';

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

test('presentation control outcomes are durable, replayable, and do not consume a sequence on failure', () => {
    const { dataDir } = makeStore();
    const store = new SqliteClassroomStateStore(path.join(dataDir, 'transport.sqlite'));
    try {
        let applies = 0;
        const failed = store.acceptPresentationControl('session:control', 'control:failed', { action: 'goto', expectedRevision: 9 }, () => {
            applies += 1;
            throw new Error('stale-revision');
        });
        const retry = store.acceptPresentationControl('session:control', 'control:failed', { expectedRevision: 9, action: 'goto' }, () => {
            applies += 1;
            return { state: 'must-not-run' };
        });
        assert.equal(failed.outcome.ok, false);
        assert.equal(retry.outcome.ok, false);
        assert.equal(retry.outcome.reason, 'stale-revision');
        assert.equal(retry.inserted, false);
        assert.equal(applies, 1);
        assert.equal(store.currentTransportSeq('session:control'), 0);

        let successfulApplies = 0;
        const first = store.acceptPresentationControl('session:control', 'control:ok', { action: 'pause', expectedRevision: 0 }, () => {
            successfulApplies += 1;
            return { state: { revision: 1 } };
        });
        const duplicate = store.acceptPresentationControl('session:control', 'control:ok', { expectedRevision: 0, action: 'pause' }, () => {
            successfulApplies += 1;
            return { state: { revision: 2 } };
        });
        assert.equal(first.outcome.value.state.revision, 1);
        assert.equal(duplicate.outcome.value.state.revision, 1);
        assert.equal(duplicate.serverSeq, first.serverSeq);
        assert.equal(successfulApplies, 1);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('session-aware cache retention releases only after the last prepared session ends', () => {
    const { dataDir, store } = makeStore({ maxRuntimePresentationCacheBytes: 3 });
    try {
        const project = store.createPresentation({ ownerUserId: 'teacher:1', title: '课件', bytes: Buffer.from('ppt'), document: { format: 'test' } });
        const published = store.createRevision(project.presentationId, 'teacher:1', { kind: 'published', runtimeIndex });
        store.prepareRuntimeCache('session:a', 'teacher:1', { presentationId: project.presentationId, revisionId: published.revisionId });
        store.prepareRuntimeCache('session:b', 'teacher:1', { presentationId: project.presentationId, revisionId: published.revisionId });
        assert.equal(Number(store.db.prepare('SELECT pinned FROM presentation_cache_entries WHERE asset_id=?').get(published.assetId).pinned), 1);
        store.setSessionLifecycle('session:a', 'ended');
        assert.equal(Number(store.db.prepare('SELECT pinned FROM presentation_cache_entries WHERE asset_id=?').get(published.assetId).pinned), 1);
        store.setSessionLifecycle('session:b', 'ended');
        assert.equal(Number(store.db.prepare('SELECT pinned FROM presentation_cache_entries WHERE asset_id=?').get(published.assetId).pinned), 0);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('account quota and server-derived revision fingerprint fail closed', () => {
    const { dataDir, store } = makeStore({ maxAccountPresentationBytes: 3 });
    try {
        const project = store.createPresentation({ ownerUserId: 'teacher:1', title: '课件', bytes: Buffer.from('abc'), document: { format: 'test' } });
        assert.throws(() => store.saveDraft(project.presentationId, 'teacher:1', { bytes: Buffer.from('abcd'), expectedRevision: 1 }), error => error instanceof PresentationLibraryError && error.code === 'account-presentation-quota-exceeded');
        const published = store.createRevision(project.presentationId, 'teacher:1', { kind: 'published', runtimeIndex, fingerprint: 'client-controlled' });
        assert.equal(published.fingerprint, store.getAsset(published.assetId).sha256);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('staged asset claims consume quota once and expire without a project', () => {
    const { dataDir, store } = makeStore({ maxAccountPresentationBytes: 4, stagedAssetRetentionHours: 0 });
    try {
        const first = store.ingestAsset('teacher:1', { bytes: Buffer.from('same') });
        const duplicate = store.ingestAsset('teacher:1', { bytes: Buffer.from('same') });
        assert.equal(first.assetId, duplicate.assetId);
        assert.equal(store.ownerClaimedBytes('teacher:1'), 4);
        assert.throws(() => store.ingestAsset('teacher:1', { bytes: Buffer.from('more') }), /account-presentation-quota-exceeded/);
        assert.equal(store.expireStagedAssetClaims(new Date(Date.now() + 1000)).length, 1);
        assert.equal(store.ownerClaimedBytes('teacher:1'), 0);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('soft-deleted projects purge after retention and release their asset claim for GC', () => {
    const { dataDir, store } = makeStore({ deletedProjectRetentionDays: 1, gcGracePeriodMs: 0 });
    try {
        const project = store.createPresentation({ ownerUserId: 'teacher:1', title: '待删除', bytes: Buffer.from('trash'), document: { format: 'test' } });
        const assetId = project.currentDraftAssetId;
        store.softDeletePresentation(project.presentationId, 'teacher:1');
        store.db.prepare('UPDATE presentation_projects SET deleted_at=? WHERE presentation_id=?').run('2026-09-01T00:00:00.000Z', project.presentationId);
        assert.deepEqual(store.purgeDeletedProjects(new Date('2026-09-03T00:00:00.000Z')), [project.presentationId]);
        assert.equal(store.uniqueReferencedBytes('teacher:1'), 0);
        assert.deepEqual(store.collectGarbage(new Date('2026-09-03T00:00:00.000Z')), [{ assetId, action: 'marked' }]);
        assert.deepEqual(store.collectGarbage(new Date('2026-09-03T00:00:01.000Z')), [{ assetId, action: 'deleted' }]);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('prepared cache rewrites an existing file when size or hash is corrupt', () => {
    const { dataDir, store } = makeStore();
    try {
        const project = store.createPresentation({ ownerUserId: 'teacher:1', title: '缓存', bytes: Buffer.from('cache'), document: { format: 'test' } });
        const revision = store.createRevision(project.presentationId, 'teacher:1', { kind: 'published', runtimeIndex });
        const prepared = store.prepareRuntimeCache('session:cache', 'teacher:1', { presentationId: project.presentationId, revisionId: revision.revisionId });
        fs.writeFileSync(prepared.cachePath, 'corrupt');
        const repaired = store.prepareRuntimeCache('session:cache', 'teacher:1', { presentationId: project.presentationId, revisionId: revision.revisionId });
        assert.equal(fs.readFileSync(repaired.cachePath, 'utf8'), 'cache');
        assert.equal(store.getPreparedRuntimeAsset(revision.assetId).assetId, revision.assetId);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('web-ppt freeze rejects forged document identity and runtime index metadata', () => {
    const { dataDir, store } = makeStore();
    try {
        const project = store.createPresentation({ ownerUserId: 'teacher:1', title: '严格冻结', bytes: Buffer.from('pptx'), document: { format: 'web-ppt-ooxml-v1', idPrefix: 'prefix-a', deckId: 'deck-a' } });
        const engine = { engineId: 'web-ppt', engineVersion: '0.5.0-beta.1', documentFormatVersion: 'web-ppt-ooxml-v1' };
        const index = { ...runtimeIndex, deckId: 'deck-a', documentFormatVersion: 'web-ppt-ooxml-v1' };
        assert.throws(() => store.createRevision(project.presentationId, 'teacher:1', { kind: 'published', engine, document: { format: 'web-ppt-ooxml-v1', idPrefix: 'prefix-b', deckId: 'deck-a' }, runtimeIndex: index }), /freeze-document-id-prefix-mismatch/);
        assert.throws(() => store.createRevision(project.presentationId, 'teacher:1', { kind: 'published', engine, document: project.currentDraftDocument, runtimeIndex: { ...index, scenes: [{ sceneId: 'scene:1', index: 2, maxStep: 0 }] } }), /freeze-runtime-index-invalid/);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test('active sessions require an explicit prepared revision switch', () => {
    const { dataDir, store } = makeStore();
    try {
        const project = store.createPresentation({ ownerUserId: 'teacher:1', title: '课件', bytes: Buffer.from('one'), document: { format: 'test' } });
        const first = store.createRevision(project.presentationId, 'teacher:1', { kind: 'published', runtimeIndex });
        const next = store.saveDraft(project.presentationId, 'teacher:1', { bytes: Buffer.from('two'), expectedRevision: 1, document: { format: 'test' } });
        const second = store.createRevision(project.presentationId, 'teacher:1', { kind: 'published', runtimeIndex: { ...runtimeIndex, deckId: 'deck:two' } });
        store.prepareRuntimeCache('session:switch', 'teacher:1', { presentationId: project.presentationId, revisionId: first.revisionId });
        store.setSessionLifecycle('session:switch', 'active');
        assert.throws(() => store.prepareRuntimeCache('session:switch', 'teacher:1', { presentationId: project.presentationId, revisionId: second.revisionId }), /active-session-revision-fixed/);
        const pin = store.switchSessionPresentationRevision('session:switch', 'teacher:1', { presentationId: project.presentationId, revisionId: second.revisionId });
        assert.equal(pin.revisionId, second.revisionId);
        assert.equal(store.getSessionLifecycle('session:switch').status, 'active');
        assert.equal(next.currentDraftRevision, 2);
    } finally {
        store.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
