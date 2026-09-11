import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DEFAULT_PRESENTATION_QUOTA = Object.freeze({
    maxPresentationFileBytes: 100 * 1024 * 1024,
    maxAccountPresentationBytes: 2 * 1024 * 1024 * 1024,
    maxRuntimePresentationCacheBytes: 512 * 1024 * 1024,
    rehearsalRetentionDays: 2,
    recoveryCheckpointCount: 5,
    gcGracePeriodMs: 24 * 60 * 60 * 1000,
});

export class PresentationLibraryError extends Error {
    constructor(code, message = code, details = undefined) {
        super(message);
        this.name = 'PresentationLibraryError';
        this.code = code;
        this.details = details;
    }
}

function isoNow() { return new Date().toISOString(); }
function uuid(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function json(value) { return JSON.stringify(value); }
function parse(value) { return value == null ? null : JSON.parse(value); }
function asBytes(value) { return Buffer.isBuffer(value) ? value : Buffer.from(value); }
function safeTitle(value) { return String(value ?? '').trim().slice(0, 200) || '未命名课件'; }

function readPolicy(overrides = {}) {
    const number = (key) => {
        const value = overrides[key] ?? process.env[`PRESENTATION_${key.toUpperCase()}`];
        return value == null ? DEFAULT_PRESENTATION_QUOTA[key] : Number(value);
    };
    const policy = {
        maxPresentationFileBytes: number('maxPresentationFileBytes'),
        maxAccountPresentationBytes: number('maxAccountPresentationBytes'),
        maxRuntimePresentationCacheBytes: number('maxRuntimePresentationCacheBytes'),
        rehearsalRetentionDays: number('rehearsalRetentionDays'),
        recoveryCheckpointCount: number('recoveryCheckpointCount'),
        gcGracePeriodMs: number('gcGracePeriodMs'),
    };
    for (const [key, value] of Object.entries(policy)) {
        if (!Number.isFinite(value) || value < 0) throw new PresentationLibraryError('invalid-quota-policy', key);
    }
    return policy;
}

function projectFrom(row) {
    if (!row) return null;
    return {
        presentationId: row.presentation_id,
        ownerUserId: row.owner_user_id,
        title: row.title,
        currentDraftAssetId: row.current_draft_asset_id,
        currentDraftRevision: Number(row.current_draft_revision),
        currentDraftDocument: parse(row.current_draft_document_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
    };
}

function assetFrom(row) {
    if (!row) return null;
    return {
        assetId: row.asset_id,
        sha256: row.sha256,
        mimeType: row.mime_type,
        size: Number(row.size),
        storagePath: row.storage_path,
        createdAt: row.created_at,
    };
}

function revisionFrom(row) {
    if (!row) return null;
    return {
        revisionId: row.revision_id,
        presentationId: row.presentation_id,
        kind: row.kind,
        engine: parse(row.engine_json),
        document: parse(row.document_json),
        assetId: row.asset_id,
        fingerprint: row.fingerprint,
        runtimeIndex: parse(row.runtime_index_json),
        classroomBindings: parse(row.classroom_bindings_json) ?? [],
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        retained: Boolean(row.retained),
    };
}

export class PresentationLibraryStore {
    constructor(dataDir, options = {}) {
        this.dataDir = path.resolve(dataDir);
        this.assetRoot = path.join(this.dataDir, 'presentation-assets');
        this.cacheRoot = path.join(this.dataDir, 'presentation-runtime-cache');
        this.policy = readPolicy(options.policy);
        fs.mkdirSync(this.assetRoot, { recursive: true });
        fs.mkdirSync(this.cacheRoot, { recursive: true });
        this.db = new DatabaseSync(options.filename ?? path.join(this.dataDir, 'classroom.sqlite'));
        this.db.exec(`
          PRAGMA journal_mode=WAL;
          PRAGMA synchronous=NORMAL;
          PRAGMA foreign_keys=ON;
          CREATE TABLE IF NOT EXISTS presentation_projects(
            presentation_id TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            current_draft_asset_id TEXT NOT NULL,
            current_draft_revision INTEGER NOT NULL,
            current_draft_document_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
          );
          CREATE INDEX IF NOT EXISTS presentation_projects_owner_idx
            ON presentation_projects(owner_user_id, deleted_at, updated_at);
          CREATE TABLE IF NOT EXISTS presentation_assets(
            asset_id TEXT PRIMARY KEY,
            sha256 TEXT NOT NULL UNIQUE,
            mime_type TEXT NOT NULL,
            size INTEGER NOT NULL,
            storage_path TEXT NOT NULL,
            created_at TEXT NOT NULL,
            gc_candidate_at TEXT
          );
          CREATE TABLE IF NOT EXISTS presentation_checkpoints(
            checkpoint_id TEXT PRIMARY KEY,
            presentation_id TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS presentation_checkpoints_project_idx
            ON presentation_checkpoints(presentation_id, created_at DESC);
          CREATE TABLE IF NOT EXISTS presentation_revisions(
            revision_id TEXT PRIMARY KEY,
            presentation_id TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('rehearsal','published')),
            engine_json TEXT NOT NULL,
            document_json TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            runtime_index_json TEXT NOT NULL,
            classroom_bindings_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            retained INTEGER NOT NULL DEFAULT 0
          );
          CREATE INDEX IF NOT EXISTS presentation_revisions_project_idx
            ON presentation_revisions(presentation_id, kind, created_at DESC);
          CREATE TABLE IF NOT EXISTS presentation_session_pins(
            session_id TEXT PRIMARY KEY,
            presentation_id TEXT NOT NULL,
            revision_id TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('rehearsal','published')),
            pinned_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS presentation_cache_entries(
            asset_id TEXT PRIMARY KEY,
            size INTEGER NOT NULL,
            last_accessed_at TEXT NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0
          );
        `);
    }

    close() { this.db.close(); }

    #assetPath(assetId) {
        return path.join(this.assetRoot, assetId.slice(0, 2), assetId);
    }

    #ensureAsset(bytes, mimeType = 'application/octet-stream') {
        const source = asBytes(bytes);
        if (source.byteLength > this.policy.maxPresentationFileBytes) {
            throw new PresentationLibraryError('presentation-file-too-large');
        }
        const digest = sha256(source);
        const existing = this.db.prepare('SELECT * FROM presentation_assets WHERE sha256=?').get(digest);
        if (existing) {
            const filename = this.#assetPath(digest);
            if (!fs.existsSync(filename)) throw new PresentationLibraryError('asset-reference-missing');
            return assetFrom(existing);
        }
        const relative = path.posix.join('presentation-assets', digest.slice(0, 2), digest);
        const filename = this.#assetPath(digest);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        const temporary = `${filename}.tmp-${process.pid}-${crypto.randomUUID()}`;
        const handle = fs.openSync(temporary, 'wx');
        try {
            fs.writeFileSync(handle, source);
            fs.fsyncSync(handle);
        } finally {
            fs.closeSync(handle);
        }
        if (fs.existsSync(filename)) fs.unlinkSync(temporary);
        else fs.renameSync(temporary, filename);
        const createdAt = isoNow();
        this.db.prepare(`INSERT INTO presentation_assets(asset_id,sha256,mime_type,size,storage_path,created_at)
          VALUES(?,?,?,?,?,?)`).run(digest, digest, mimeType, source.byteLength, relative, createdAt);
        return { assetId: digest, sha256: digest, mimeType, size: source.byteLength, storagePath: relative, createdAt };
    }

    #bytes(assetId) {
        const asset = this.getAsset(assetId);
        if (!asset) throw new PresentationLibraryError('asset-not-found');
        const bytes = fs.readFileSync(path.join(this.dataDir, asset.storagePath));
        if (sha256(bytes) !== asset.sha256) throw new PresentationLibraryError('asset-hash-mismatch');
        return bytes;
    }

    createPresentation({ ownerUserId, title, bytes, mimeType, document }) {
        if (!String(ownerUserId ?? '').trim()) throw new PresentationLibraryError('owner-required');
        const asset = this.#ensureAsset(bytes, mimeType);
        const now = isoNow();
        const presentationId = uuid('presentation');
        const value = {
            presentationId,
            ownerUserId: String(ownerUserId),
            title: safeTitle(title),
            currentDraftAssetId: asset.assetId,
            currentDraftRevision: 1,
            currentDraftDocument: document ?? { format: 'unknown' },
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        this.db.prepare(`INSERT INTO presentation_projects
          (presentation_id,owner_user_id,title,current_draft_asset_id,current_draft_revision,current_draft_document_json,created_at,updated_at,deleted_at)
          VALUES(?,?,?,?,?,?,?,?,?)`).run(value.presentationId, value.ownerUserId, value.title, value.currentDraftAssetId, value.currentDraftRevision, json(value.currentDraftDocument), value.createdAt, value.updatedAt, null);
        return value;
    }

    listPresentations(ownerUserId, { includeDeleted = false } = {}) {
        const rows = this.db.prepare(`SELECT * FROM presentation_projects WHERE owner_user_id=? ${includeDeleted ? '' : 'AND deleted_at IS NULL'} ORDER BY updated_at DESC`).all(ownerUserId);
        return rows.map(projectFrom);
    }

    getPresentation(presentationId, ownerUserId = null) {
        const row = this.db.prepare('SELECT * FROM presentation_projects WHERE presentation_id=?').get(presentationId);
        if (!row || (ownerUserId != null && row.owner_user_id !== ownerUserId)) return null;
        return projectFrom(row);
    }

    renamePresentation(presentationId, ownerUserId, title) {
        const project = this.#requireProject(presentationId, ownerUserId);
        const updatedAt = isoNow();
        this.db.prepare('UPDATE presentation_projects SET title=?, updated_at=? WHERE presentation_id=?').run(safeTitle(title), updatedAt, project.presentationId);
        return this.getPresentation(presentationId, ownerUserId);
    }

    softDeletePresentation(presentationId, ownerUserId) {
        this.#requireProject(presentationId, ownerUserId);
        const deletedAt = isoNow();
        this.db.prepare('UPDATE presentation_projects SET deleted_at=?, updated_at=? WHERE presentation_id=?').run(deletedAt, deletedAt, presentationId);
        return this.getPresentation(presentationId, ownerUserId);
    }

    saveDraft(presentationId, ownerUserId, { bytes, mimeType, document, expectedRevision }) {
        const project = this.#requireProject(presentationId, ownerUserId);
        if (expectedRevision != null && Number(expectedRevision) !== project.currentDraftRevision) {
            throw new PresentationLibraryError('draft-conflict', 'draft-conflict', { current: project });
        }
        const asset = this.#ensureAsset(bytes, mimeType);
        const now = isoNow();
        const revision = project.currentDraftRevision + 1;
        this.db.exec('BEGIN IMMEDIATE');
        try {
            if (asset.assetId !== project.currentDraftAssetId) {
                this.db.prepare('INSERT INTO presentation_checkpoints(checkpoint_id,presentation_id,asset_id,created_at) VALUES(?,?,?,?)').run(uuid('checkpoint'), presentationId, project.currentDraftAssetId, now);
                const limit = Math.max(0, Math.floor(this.policy.recoveryCheckpointCount));
                this.db.prepare(`DELETE FROM presentation_checkpoints WHERE checkpoint_id IN
                  (SELECT checkpoint_id FROM presentation_checkpoints WHERE presentation_id=? ORDER BY created_at DESC LIMIT -1 OFFSET ?)`)
                    .run(presentationId, limit);
            }
            this.db.prepare(`UPDATE presentation_projects SET current_draft_asset_id=?, current_draft_revision=?, current_draft_document_json=?, updated_at=? WHERE presentation_id=?`).run(asset.assetId, revision, json(document ?? project.currentDraftDocument), now, presentationId);
            this.db.exec('COMMIT');
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch { /* preserve original */ }
            throw error;
        }
        return this.getPresentation(presentationId, ownerUserId);
    }

    loadDraft(presentationId, ownerUserId) {
        const project = this.#requireProject(presentationId, ownerUserId);
        return { project, asset: this.getAsset(project.currentDraftAssetId), bytes: this.#bytes(project.currentDraftAssetId) };
    }

    getAsset(assetId) { return assetFrom(this.db.prepare('SELECT * FROM presentation_assets WHERE asset_id=?').get(assetId)); }

    getAssetBytes(assetId) { return this.#bytes(assetId); }

    createRevision(presentationId, ownerUserId, { kind, assetId, engine, document, runtimeIndex, classroomBindings = [], fingerprint, expiresAt, retained = false }) {
        if (kind !== 'rehearsal' && kind !== 'published') throw new PresentationLibraryError('invalid-revision-kind');
        const project = this.#requireProject(presentationId, ownerUserId);
        const selectedAssetId = assetId ?? project.currentDraftAssetId;
        const asset = this.getAsset(selectedAssetId);
        if (!asset) throw new PresentationLibraryError('asset-not-found');
        if (!runtimeIndex || !Array.isArray(runtimeIndex.scenes)) throw new PresentationLibraryError('runtime-index-required');
        const revision = {
            revisionId: uuid(kind),
            presentationId,
            kind,
            engine: engine ?? { engineId: 'unknown', engineVersion: 'unknown', documentFormatVersion: 'unknown' },
            document: document ?? project.currentDraftDocument,
            assetId: selectedAssetId,
            fingerprint: fingerprint ?? asset.sha256,
            runtimeIndex,
            classroomBindings,
            createdAt: isoNow(),
            expiresAt: expiresAt ?? (kind === 'rehearsal' ? new Date(Date.now() + this.policy.rehearsalRetentionDays * 86400000).toISOString() : null),
            retained: Boolean(retained),
        };
        this.db.prepare(`INSERT INTO presentation_revisions
          (revision_id,presentation_id,kind,engine_json,document_json,asset_id,fingerprint,runtime_index_json,classroom_bindings_json,created_at,expires_at,retained)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(revision.revisionId, presentationId, kind, json(revision.engine), json(revision.document), revision.assetId, revision.fingerprint, json(revision.runtimeIndex), json(revision.classroomBindings), revision.createdAt, revision.expiresAt, revision.retained ? 1 : 0);
        return revision;
    }

    listRevisions(presentationId, ownerUserId, { kind = null } = {}) {
        this.#requireProject(presentationId, ownerUserId);
        const rows = this.db.prepare(`SELECT * FROM presentation_revisions WHERE presentation_id=? ${kind ? 'AND kind=?' : ''} ORDER BY created_at DESC`).all(...(kind ? [presentationId, kind] : [presentationId]));
        return rows.map(revisionFrom);
    }

    getRevision(revisionId, ownerUserId = null) {
        const row = this.db.prepare(`SELECT r.* FROM presentation_revisions r JOIN presentation_projects p ON p.presentation_id=r.presentation_id WHERE r.revision_id=?`).get(revisionId);
        if (!row || (ownerUserId != null && this.getPresentation(row.presentation_id, ownerUserId) == null)) return null;
        return revisionFrom(row);
    }

    restoreRevision(presentationId, ownerUserId, revisionId, expectedRevision = undefined) {
        const revision = this.getRevision(revisionId, ownerUserId);
        if (!revision || revision.presentationId !== presentationId) throw new PresentationLibraryError('revision-not-found');
        const bytes = this.#bytes(revision.assetId);
        return this.saveDraft(presentationId, ownerUserId, { bytes, mimeType: this.getAsset(revision.assetId).mimeType, document: revision.document, expectedRevision });
    }

    pinSession(sessionId, ownerUserId, { presentationId, revisionId }) {
        const revision = this.getRevision(revisionId, ownerUserId);
        if (!revision || revision.presentationId !== presentationId) throw new PresentationLibraryError('revision-not-found');
        const pin = { sessionId, presentationId, revisionId, assetId: revision.assetId, kind: revision.kind, pinnedAt: isoNow() };
        this.db.prepare(`INSERT INTO presentation_session_pins(session_id,presentation_id,revision_id,asset_id,kind,pinned_at)
          VALUES(?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET presentation_id=excluded.presentation_id,revision_id=excluded.revision_id,asset_id=excluded.asset_id,kind=excluded.kind,pinned_at=excluded.pinned_at`).run(pin.sessionId, pin.presentationId, pin.revisionId, pin.assetId, pin.kind, pin.pinnedAt);
        return pin;
    }

    getSessionPin(sessionId) {
        return this.db.prepare('SELECT session_id AS sessionId,presentation_id AS presentationId,revision_id AS revisionId,asset_id AS assetId,kind,pinned_at AS pinnedAt FROM presentation_session_pins WHERE session_id=?').get(sessionId) ?? null;
    }

    prepareRuntimeCache(sessionId, ownerUserId, { presentationId, revisionId }) {
        const pin = this.pinSession(sessionId, ownerUserId, { presentationId, revisionId });
        const asset = this.getAsset(pin.assetId);
        const bytes = this.#bytes(pin.assetId);
        const filename = path.join(this.cacheRoot, asset.assetId);
        if (!fs.existsSync(filename)) fs.writeFileSync(filename, bytes, { flag: 'wx' });
        this.db.prepare(`INSERT INTO presentation_cache_entries(asset_id,size,last_accessed_at,pinned) VALUES(?,?,?,1)
          ON CONFLICT(asset_id) DO UPDATE SET last_accessed_at=excluded.last_accessed_at,pinned=1`).run(asset.assetId, asset.size, isoNow());
        this.evictRuntimeCache();
        return { ...asset, cachePath: filename, prepared: true };
    }

    evictRuntimeCache(now = Date.now()) {
        const rows = this.db.prepare('SELECT * FROM presentation_cache_entries ORDER BY last_accessed_at ASC').all();
        let total = rows.reduce((sum, row) => sum + Number(row.size), 0);
        for (const row of rows) {
            if (total <= this.policy.maxRuntimePresentationCacheBytes || row.pinned) continue;
            const filename = path.join(this.cacheRoot, row.asset_id);
            try { fs.unlinkSync(filename); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            this.db.prepare('DELETE FROM presentation_cache_entries WHERE asset_id=?').run(row.asset_id);
            total -= Number(row.size);
        }
        if (total > this.policy.maxRuntimePresentationCacheBytes) throw new PresentationLibraryError('runtime-cache-quota-exceeded');
        return { totalBytes: total, evictedAt: new Date(now).toISOString() };
    }

    uniqueReferencedBytes(ownerUserId) {
        const ids = new Set();
        for (const project of this.listPresentations(ownerUserId, { includeDeleted: true })) ids.add(project.currentDraftAssetId);
        const revisions = this.db.prepare(`SELECT r.asset_id FROM presentation_revisions r JOIN presentation_projects p ON p.presentation_id=r.presentation_id WHERE p.owner_user_id=?`).all(ownerUserId);
        const checkpoints = this.db.prepare(`SELECT c.asset_id FROM presentation_checkpoints c JOIN presentation_projects p ON p.presentation_id=c.presentation_id WHERE p.owner_user_id=?`).all(ownerUserId);
        for (const row of [...revisions, ...checkpoints]) ids.add(row.asset_id);
        let total = 0;
        for (const id of ids) total += this.getAsset(id)?.size ?? 0;
        return total;
    }

    expireRehearsals(now = new Date()) {
        const rows = this.db.prepare(`SELECT r.revision_id FROM presentation_revisions r WHERE r.kind='rehearsal' AND r.retained=0 AND r.expires_at IS NOT NULL AND r.expires_at <= ? AND NOT EXISTS (SELECT 1 FROM presentation_session_pins p WHERE p.revision_id=r.revision_id)`).all(now.toISOString());
        for (const row of rows) this.db.prepare('DELETE FROM presentation_revisions WHERE revision_id=?').run(row.revision_id);
        return rows.map(row => row.revision_id);
    }

    collectGarbage(now = new Date()) {
        const nowIso = now.toISOString();
        const assets = this.db.prepare('SELECT * FROM presentation_assets').all();
        const referenced = new Set();
        for (const row of this.db.prepare('SELECT current_draft_asset_id AS asset_id FROM presentation_projects').all()) referenced.add(row.asset_id);
        for (const row of this.db.prepare('SELECT asset_id FROM presentation_checkpoints').all()) referenced.add(row.asset_id);
        for (const row of this.db.prepare('SELECT asset_id FROM presentation_revisions').all()) referenced.add(row.asset_id);
        for (const row of this.db.prepare('SELECT asset_id FROM presentation_session_pins').all()) referenced.add(row.asset_id);
        const candidates = [];
        for (const asset of assets) {
            if (referenced.has(asset.asset_id)) {
                if (asset.gc_candidate_at) this.db.prepare('UPDATE presentation_assets SET gc_candidate_at=NULL WHERE asset_id=?').run(asset.asset_id);
                continue;
            }
            if (!asset.gc_candidate_at) {
                this.db.prepare('UPDATE presentation_assets SET gc_candidate_at=? WHERE asset_id=?').run(nowIso, asset.asset_id);
                candidates.push({ assetId: asset.asset_id, action: 'marked' });
                continue;
            }
            if (Date.parse(asset.gc_candidate_at) + this.policy.gcGracePeriodMs > now.getTime()) continue;
            const filename = this.#assetPath(asset.asset_id);
            try { fs.unlinkSync(filename); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            this.db.prepare('DELETE FROM presentation_assets WHERE asset_id=?').run(asset.asset_id);
            candidates.push({ assetId: asset.asset_id, action: 'deleted' });
        }
        return candidates;
    }

    #requireProject(presentationId, ownerUserId) {
        const project = this.getPresentation(presentationId, ownerUserId);
        if (!project || project.deletedAt) throw new PresentationLibraryError('presentation-not-found');
        return project;
    }
}
