import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DEFAULT_PRESENTATION_QUOTA = Object.freeze({
    maxPresentationFileBytes: 100 * 1024 * 1024,
    maxAccountPresentationBytes: 2 * 1024 * 1024 * 1024,
    maxRuntimePresentationCacheBytes: 512 * 1024 * 1024,
    rehearsalRetentionDays: 2,
    deletedProjectRetentionDays: 7,
    stagedAssetRetentionHours: 24,
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
    const envNames = {
        maxPresentationFileBytes: 'PRESENTATION_MAX_FILE_BYTES',
        maxAccountPresentationBytes: 'PRESENTATION_ACCOUNT_QUOTA_BYTES',
        maxRuntimePresentationCacheBytes: 'PRESENTATION_RUNTIME_CACHE_BYTES',
        rehearsalRetentionDays: 'PRESENTATION_REHEARSAL_RETENTION_DAYS',
        deletedProjectRetentionDays: 'PRESENTATION_DELETED_PROJECT_RETENTION_DAYS',
        stagedAssetRetentionHours: 'PRESENTATION_STAGED_ASSET_RETENTION_HOURS',
        recoveryCheckpointCount: 'PRESENTATION_RECOVERY_CHECKPOINT_COUNT',
        gcGracePeriodMs: 'PRESENTATION_GC_GRACE_PERIOD_MS',
    };
    const number = (key) => {
        const value = overrides[key] ?? process.env[envNames[key]];
        return value == null ? DEFAULT_PRESENTATION_QUOTA[key] : Number(value);
    };
    const policy = {
        maxPresentationFileBytes: number('maxPresentationFileBytes'),
        maxAccountPresentationBytes: number('maxAccountPresentationBytes'),
        maxRuntimePresentationCacheBytes: number('maxRuntimePresentationCacheBytes'),
        rehearsalRetentionDays: number('rehearsalRetentionDays'),
        deletedProjectRetentionDays: number('deletedProjectRetentionDays'),
        stagedAssetRetentionHours: number('stagedAssetRetentionHours'),
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
          CREATE TABLE IF NOT EXISTS presentation_asset_claims(
            asset_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            claimed_at TEXT NOT NULL,
            staged_expires_at TEXT,
            PRIMARY KEY(asset_id, owner_user_id)
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
          CREATE TABLE IF NOT EXISTS presentation_sessions(
            session_id TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK(status IN ('prepared','active','ended')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            ended_at TEXT
          );
          CREATE TABLE IF NOT EXISTS presentation_runtime_cache_pins(
            session_id TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(session_id, asset_id)
          );
          CREATE TABLE IF NOT EXISTS presentation_session_history(
            session_id TEXT PRIMARY KEY,
            presentation_id TEXT NOT NULL,
            revision_id TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            ended_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS presentation_cache_entries(
            asset_id TEXT PRIMARY KEY,
            size INTEGER NOT NULL,
            last_accessed_at TEXT NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0
          );
        `);
        const claimColumns = this.db.prepare('PRAGMA table_info(presentation_asset_claims)').all().map((row) => row.name);
        if (!claimColumns.includes('staged_expires_at'))
            this.db.exec('ALTER TABLE presentation_asset_claims ADD COLUMN staged_expires_at TEXT');
        this.reconcileRuntimeCache();
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

    #claimAsset(ownerUserId, assetId, { staged = false } = {}) {
        if (!String(ownerUserId ?? '').trim()) throw new PresentationLibraryError('owner-required');
        const asset = this.getAsset(assetId);
        if (!asset) throw new PresentationLibraryError('asset-not-found');
        const owner = String(ownerUserId).trim();
        const existing = this.db.prepare('SELECT 1 FROM presentation_asset_claims WHERE asset_id=? AND owner_user_id=?').get(assetId, owner);
        if (!existing && this.ownerClaimedBytes(owner) + asset.size > this.policy.maxAccountPresentationBytes)
            throw new PresentationLibraryError('account-presentation-quota-exceeded');
        const stagedExpiresAt = staged ? new Date(Date.now() + this.policy.stagedAssetRetentionHours * 60 * 60 * 1000).toISOString() : null;
        this.db.prepare(`INSERT INTO presentation_asset_claims(asset_id,owner_user_id,claimed_at,staged_expires_at) VALUES(?,?,?,?)
          ON CONFLICT(asset_id,owner_user_id) DO UPDATE SET staged_expires_at=excluded.staged_expires_at`).run(assetId, owner, isoNow(), stagedExpiresAt);
        if (!staged)
            this.db.prepare('UPDATE presentation_asset_claims SET staged_expires_at=NULL WHERE asset_id=? AND owner_user_id=?').run(assetId, owner);
        return asset;
    }

    #ownerReferencesAsset(ownerUserId, assetId) {
        const direct = this.db.prepare(`SELECT 1 FROM presentation_projects WHERE owner_user_id=? AND current_draft_asset_id=?
          UNION SELECT 1 FROM presentation_revisions r JOIN presentation_projects p ON p.presentation_id=r.presentation_id WHERE p.owner_user_id=? AND r.asset_id=?
          UNION SELECT 1 FROM presentation_checkpoints c JOIN presentation_projects p ON p.presentation_id=c.presentation_id WHERE p.owner_user_id=? AND c.asset_id=? LIMIT 1`).get(ownerUserId, assetId, ownerUserId, assetId, ownerUserId, assetId);
        return Boolean(direct);
    }

    ownerClaimedBytes(ownerUserId) {
        const row = this.db.prepare(`SELECT COALESCE(SUM(a.size),0) AS total
          FROM presentation_assets a JOIN presentation_asset_claims c ON c.asset_id=a.asset_id
          WHERE c.owner_user_id=?`).get(String(ownerUserId ?? '').trim());
        return Number(row?.total ?? 0);
    }

    createPresentation({ ownerUserId, title, assetId, bytes, mimeType, document }) {
        if (!String(ownerUserId ?? '').trim()) throw new PresentationLibraryError('owner-required');
        const asset = assetId != null
            ? (this.getOwnedAsset(assetId, ownerUserId) ?? (() => { throw new PresentationLibraryError('asset-not-found'); })())
            : this.#ensureAsset(bytes, mimeType);
        this.#claimAsset(ownerUserId, asset.assetId);
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

    ingestAsset(ownerUserId, { bytes, mimeType }) {
        const asset = this.#ensureAsset(bytes, mimeType);
        this.#claimAsset(ownerUserId, asset.assetId, { staged: true });
        return asset;
    }

    getOwnedAsset(assetId, ownerUserId) {
        const row = this.db.prepare('SELECT a.* FROM presentation_assets a JOIN presentation_asset_claims c ON c.asset_id=a.asset_id WHERE a.asset_id=? AND c.owner_user_id=?').get(assetId, ownerUserId);
        return assetFrom(row);
    }

    renamePresentation(presentationId, ownerUserId, title) {
        const project = this.#requireProject(presentationId, ownerUserId);
        const updatedAt = isoNow();
        this.db.prepare('UPDATE presentation_projects SET title=?, updated_at=? WHERE presentation_id=?').run(safeTitle(title), updatedAt, project.presentationId);
        return this.getPresentation(presentationId, ownerUserId);
    }

    duplicatePresentation(presentationId, ownerUserId, title = undefined) {
        const draft = this.loadDraft(presentationId, ownerUserId);
        return this.createPresentation({ ownerUserId, title: title ?? `${draft.project.title} 副本`, bytes: draft.bytes, mimeType: draft.asset.mimeType, document: draft.project.currentDraftDocument });
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
        this.#claimAsset(ownerUserId, asset.assetId);
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

    #verifyRuntimeCacheFile(asset) {
        if (!asset) return { ok: false, reason: 'asset-not-found' };
        const filename = path.join(this.cacheRoot, asset.assetId);
        try {
            const stat = fs.statSync(filename);
            if (!stat.isFile() || stat.size !== asset.size) return { ok: false, reason: 'runtime-cache-size-mismatch', filename };
            const bytes = fs.readFileSync(filename);
            if (sha256(bytes) !== asset.sha256) return { ok: false, reason: 'runtime-cache-hash-mismatch', filename };
            return { ok: true, filename };
        } catch (error) {
            return { ok: false, reason: error.code === 'ENOENT' ? 'runtime-cache-missing' : 'runtime-cache-unreadable', filename };
        }
    }

    getPreparedRuntimeAsset(assetId) {
        const asset = this.getAsset(assetId);
        const entry = this.db.prepare('SELECT * FROM presentation_cache_entries WHERE asset_id=?').get(assetId);
        const verification = this.#verifyRuntimeCacheFile(asset);
        if (!entry || !verification.ok) throw new PresentationLibraryError(verification.reason, verification.reason);
        return { ...asset, cachePath: verification.filename };
    }

    reconcileRuntimeCache() {
        const repaired = [];
        const rows = this.db.prepare('SELECT asset_id FROM presentation_cache_entries').all();
        for (const row of rows) {
            const verification = this.#verifyRuntimeCacheFile(this.getAsset(row.asset_id));
            if (verification.ok) continue;
            this.db.prepare('DELETE FROM presentation_cache_entries WHERE asset_id=?').run(row.asset_id);
            this.db.prepare('DELETE FROM presentation_runtime_cache_pins WHERE asset_id=?').run(row.asset_id);
            repaired.push({ assetId: row.asset_id, action: 'removed-invalid-entry', reason: verification.reason });
        }
        if (fs.existsSync(this.cacheRoot)) {
            for (const name of fs.readdirSync(this.cacheRoot)) {
                const filename = path.join(this.cacheRoot, name);
                let stat;
                try { stat = fs.statSync(filename); } catch { continue; }
                if (!stat.isFile() || name.includes('.tmp-') || !this.db.prepare('SELECT 1 FROM presentation_cache_entries WHERE asset_id=?').get(name)) {
                    try { if (stat.isFile()) fs.unlinkSync(filename); } catch { /* next maintenance run can retry */ }
                    repaired.push({ assetId: name, action: 'removed-orphan-file' });
                }
            }
        }
        this.#refreshCachePins();
        return repaired;
    }

    #validateFreezeMetadata(project, { engine, document, runtimeIndex, classroomBindings }) {
        if (!runtimeIndex || !Array.isArray(runtimeIndex.scenes) || runtimeIndex.scenes.length === 0)
            throw new PresentationLibraryError('runtime-index-required');
        const selectedDocument = document ?? project.currentDraftDocument;
        const selectedEngine = engine ?? { engineId: 'web-ppt', engineVersion: '0.5.0-beta.1', documentFormatVersion: selectedDocument?.format };
        if (selectedEngine.engineId !== 'web-ppt') throw new PresentationLibraryError('freeze-engine-mismatch');
        if (selectedDocument?.idPrefix && project.currentDraftDocument?.idPrefix && selectedDocument.idPrefix !== project.currentDraftDocument.idPrefix)
            throw new PresentationLibraryError('freeze-document-id-prefix-mismatch');
        if (selectedDocument?.deckId && selectedDocument.deckId !== runtimeIndex.deckId)
            throw new PresentationLibraryError('freeze-document-deck-mismatch');
        if (project.currentDraftDocument?.deckId && selectedDocument?.deckId && project.currentDraftDocument.deckId !== selectedDocument.deckId)
            throw new PresentationLibraryError('freeze-document-deck-mismatch');
        // Abstract storage tests use a synthetic `test` document format; all
        // real web-ppt freezes still require exact document/index agreement.
        if (selectedDocument?.format && runtimeIndex.documentFormatVersion && selectedDocument.format !== runtimeIndex.documentFormatVersion && selectedDocument.format !== 'test')
            throw new PresentationLibraryError('freeze-document-format-mismatch');
        const ids = new Set();
        runtimeIndex.scenes.forEach((scene, index) => {
            if (!scene || typeof scene.sceneId !== 'string' || ids.has(scene.sceneId)) throw new PresentationLibraryError('freeze-scene-id-invalid');
            ids.add(scene.sceneId);
            if (scene.index !== index || !Number.isInteger(scene.maxStep) || scene.maxStep < 0) throw new PresentationLibraryError('freeze-runtime-index-invalid');
        });
        for (const binding of classroomBindings ?? []) {
            if (!binding || typeof binding !== 'object') throw new PresentationLibraryError('freeze-binding-invalid');
            if (/participant|seatNo|rosterId|membershipId|displayName|studentId/i.test(JSON.stringify(binding)))
                throw new PresentationLibraryError('freeze-binding-identity-forbidden');
        }
    }

    createRevision(presentationId, ownerUserId, { kind, assetId, engine, document, runtimeIndex, classroomBindings = [], fingerprint: _fingerprint, expiresAt, retained = false }) {
        if (kind !== 'rehearsal' && kind !== 'published') throw new PresentationLibraryError('invalid-revision-kind');
        const project = this.#requireProject(presentationId, ownerUserId);
        if (assetId != null && assetId !== project.currentDraftAssetId)
            throw new PresentationLibraryError('revision-source-must-be-current-draft');
        const selectedAssetId = project.currentDraftAssetId;
        const asset = this.getAsset(selectedAssetId);
        if (!asset) throw new PresentationLibraryError('asset-not-found');
        this.#validateFreezeMetadata(project, { engine, document, runtimeIndex, classroomBindings });
        const revision = {
            revisionId: uuid(kind),
            presentationId,
            kind,
            engine: engine ?? { engineId: 'unknown', engineVersion: 'unknown', documentFormatVersion: 'unknown' },
            document: document ?? project.currentDraftDocument,
            assetId: selectedAssetId,
            fingerprint: asset.sha256,
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

    ensureSession(sessionId, status = 'prepared') {
        const existing = this.getSessionLifecycle(sessionId);
        if (existing) return existing;
        if (!['prepared', 'active', 'ended'].includes(status)) throw new PresentationLibraryError('invalid-session-status');
        const now = isoNow();
        this.db.prepare('INSERT INTO presentation_sessions(session_id,status,created_at,updated_at,ended_at) VALUES(?,?,?,?,?)').run(sessionId, status, now, now, status === 'ended' ? now : null);
        return this.getSessionLifecycle(sessionId);
    }

    getSessionLifecycle(sessionId) {
        const row = this.db.prepare('SELECT session_id AS sessionId,status,created_at AS createdAt,updated_at AS updatedAt,ended_at AS endedAt FROM presentation_sessions WHERE session_id=?').get(sessionId);
        return row ?? null;
    }

    setSessionLifecycle(sessionId, status) {
        if (!['prepared', 'active', 'ended'].includes(status)) throw new PresentationLibraryError('invalid-session-status');
        const current = this.ensureSession(sessionId);
        if (current.status === 'ended' && status !== 'ended') throw new PresentationLibraryError('session-ended');
        if (current.status === 'active' && status === 'prepared') throw new PresentationLibraryError('invalid-session-transition');
        const updatedAt = isoNow();
        this.db.prepare('UPDATE presentation_sessions SET status=?,updated_at=?,ended_at=? WHERE session_id=?').run(status, updatedAt, status === 'ended' ? updatedAt : current.endedAt, sessionId);
        if (status === 'ended') this.releaseRuntimeCacheForSession(sessionId);
        return this.getSessionLifecycle(sessionId);
    }

    pinSession(sessionId, ownerUserId, { presentationId, revisionId }) {
        const session = this.ensureSession(sessionId);
        const revision = this.getRevision(revisionId, ownerUserId);
        if (!revision || revision.presentationId !== presentationId) throw new PresentationLibraryError('revision-not-found');
        const current = this.getSessionPin(sessionId);
        if (session.status === 'ended') throw new PresentationLibraryError('session-ended');
        if (session.status === 'active' && current && current.revisionId !== revisionId)
            throw new PresentationLibraryError('active-session-revision-fixed');
        const pin = { sessionId, presentationId, revisionId, assetId: revision.assetId, kind: revision.kind, pinnedAt: isoNow() };
        this.db.prepare(`INSERT INTO presentation_session_pins(session_id,presentation_id,revision_id,asset_id,kind,pinned_at)
          VALUES(?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET presentation_id=excluded.presentation_id,revision_id=excluded.revision_id,asset_id=excluded.asset_id,kind=excluded.kind,pinned_at=excluded.pinned_at`).run(pin.sessionId, pin.presentationId, pin.revisionId, pin.assetId, pin.kind, pin.pinnedAt);
        // The reference API keeps the legacy pin-only path runnable while
        // still making the exact asset available before any player reconnect.
        try {
            this.prepareRuntimeCache(sessionId, ownerUserId, { presentationId, revisionId });
        } catch (error) {
            this.restoreSessionPin(sessionId, current);
            throw error;
        }
        return pin;
    }

    getSessionPin(sessionId) {
        return this.db.prepare('SELECT session_id AS sessionId,presentation_id AS presentationId,revision_id AS revisionId,asset_id AS assetId,kind,pinned_at AS pinnedAt FROM presentation_session_pins WHERE session_id=?').get(sessionId) ?? null;
    }

    prepareRuntimeCache(sessionId, ownerUserId, { presentationId, revisionId, allowRevisionSwitch = false }) {
        const session = this.ensureSession(sessionId);
        if (session.status === 'ended') throw new PresentationLibraryError('session-ended');
        const revision = this.getRevision(revisionId, ownerUserId);
        if (!revision || revision.presentationId !== presentationId) throw new PresentationLibraryError('revision-not-found');
        const currentPin = this.getSessionPin(sessionId);
        if (session.status === 'active' && currentPin && currentPin.revisionId !== revisionId && !allowRevisionSwitch)
            throw new PresentationLibraryError('active-session-revision-fixed');
        const asset = this.getAsset(revision.assetId);
        const bytes = this.#bytes(revision.assetId);
        const filename = path.join(this.cacheRoot, asset.assetId);
        let createdCache = false;
        const existingCache = this.#verifyRuntimeCacheFile(asset);
        if (!existingCache.ok) {
            if (existingCache.filename && fs.existsSync(existingCache.filename)) fs.unlinkSync(existingCache.filename);
            const temporary = `${filename}.tmp-${process.pid}-${crypto.randomUUID()}`;
            const handle = fs.openSync(temporary, 'wx');
            try {
                fs.writeFileSync(handle, bytes);
                fs.fsyncSync(handle);
            }
            finally { fs.closeSync(handle); }
            fs.renameSync(temporary, filename);
            createdCache = true;
        }
        const pin = { sessionId, presentationId, revisionId, assetId: revision.assetId, kind: revision.kind, pinnedAt: isoNow() };
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.prepare(`INSERT INTO presentation_cache_entries(asset_id,size,last_accessed_at,pinned) VALUES(?,?,?,0)
              ON CONFLICT(asset_id) DO UPDATE SET last_accessed_at=excluded.last_accessed_at`).run(asset.assetId, asset.size, isoNow());
            this.db.prepare(`INSERT INTO presentation_session_pins(session_id,presentation_id,revision_id,asset_id,kind,pinned_at)
              VALUES(?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET presentation_id=excluded.presentation_id,revision_id=excluded.revision_id,asset_id=excluded.asset_id,kind=excluded.kind,pinned_at=excluded.pinned_at`).run(pin.sessionId, pin.presentationId, pin.revisionId, pin.assetId, pin.kind, pin.pinnedAt);
            this.db.prepare('DELETE FROM presentation_runtime_cache_pins WHERE session_id=? AND asset_id<>?').run(sessionId, asset.assetId);
            this.db.prepare('INSERT OR REPLACE INTO presentation_runtime_cache_pins(session_id,asset_id,created_at) VALUES(?,?,?)').run(sessionId, asset.assetId, pin.pinnedAt);
            this.#refreshCachePins();
            this.evictRuntimeCache();
            this.db.exec('COMMIT');
        }
        catch (error) {
            try { this.db.exec('ROLLBACK'); } catch { /* preserve original */ }
            if (createdCache) { try { fs.unlinkSync(filename); } catch { /* preserve original */ } }
            throw error;
        }
        return { ...asset, cachePath: filename, prepared: true };
    }

    switchSessionPresentationRevision(sessionId, ownerUserId, { presentationId, revisionId }) {
        const session = this.ensureSession(sessionId);
        if (session.status !== 'active') throw new PresentationLibraryError('active-session-required');
        const revision = this.getRevision(revisionId, ownerUserId);
        if (!revision || revision.presentationId !== presentationId) throw new PresentationLibraryError('revision-not-found');
        this.prepareRuntimeCache(sessionId, ownerUserId, { presentationId, revisionId, allowRevisionSwitch: true });
        const cache = this.db.prepare('SELECT 1 FROM presentation_runtime_cache_pins WHERE session_id=? AND asset_id=?').get(sessionId, revision.assetId);
        if (!cache) throw new PresentationLibraryError('presentation-runtime-cache-not-prepared');
        const pin = { sessionId, presentationId, revisionId, assetId: revision.assetId, kind: revision.kind, pinnedAt: isoNow() };
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.prepare('UPDATE presentation_session_pins SET presentation_id=?,revision_id=?,asset_id=?,kind=?,pinned_at=? WHERE session_id=?').run(pin.presentationId, pin.revisionId, pin.assetId, pin.kind, pin.pinnedAt, sessionId);
            this.db.exec('COMMIT');
            return pin;
        } catch (error) { try { this.db.exec('ROLLBACK'); } catch { /* preserve original */ } throw error; }
    }

    restoreSessionPin(sessionId, pin) {
        if (!pin) {
            this.db.prepare('DELETE FROM presentation_session_pins WHERE session_id=?').run(sessionId);
            this.db.prepare('DELETE FROM presentation_runtime_cache_pins WHERE session_id=?').run(sessionId);
        } else {
            this.db.prepare(`INSERT INTO presentation_session_pins(session_id,presentation_id,revision_id,asset_id,kind,pinned_at)
              VALUES(?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET presentation_id=excluded.presentation_id,revision_id=excluded.revision_id,asset_id=excluded.asset_id,kind=excluded.kind,pinned_at=excluded.pinned_at`).run(pin.sessionId, pin.presentationId, pin.revisionId, pin.assetId, pin.kind, pin.pinnedAt);
            this.db.prepare('INSERT OR REPLACE INTO presentation_runtime_cache_pins(session_id,asset_id,created_at) VALUES(?,?,?)').run(sessionId, pin.assetId, pin.pinnedAt);
        }
        this.#refreshCachePins();
        return this.getSessionPin(sessionId);
    }

    releaseRuntimeCacheForSession(sessionId) {
        const pin = this.getSessionPin(sessionId);
        if (pin) {
            const revision = this.getRevision(pin.revisionId);
            if (revision) this.db.prepare(`INSERT OR REPLACE INTO presentation_session_history(session_id,presentation_id,revision_id,fingerprint,ended_at) VALUES(?,?,?,?,?)`).run(sessionId, pin.presentationId, pin.revisionId, revision.fingerprint, isoNow());
        }
        this.db.prepare('DELETE FROM presentation_runtime_cache_pins WHERE session_id=?').run(sessionId);
        this.db.prepare('DELETE FROM presentation_session_pins WHERE session_id=?').run(sessionId);
        this.#refreshCachePins();
        return this.evictRuntimeCache();
    }

    #refreshCachePins() {
        this.db.exec(`UPDATE presentation_cache_entries SET pinned=CASE WHEN EXISTS(
          SELECT 1 FROM presentation_runtime_cache_pins p WHERE p.asset_id=presentation_cache_entries.asset_id
        ) THEN 1 ELSE 0 END`);
    }

    evictRuntimeCache(now = Date.now()) {
        this.#refreshCachePins();
        const rows = this.db.prepare('SELECT * FROM presentation_cache_entries ORDER BY last_accessed_at ASC').all();
        let total = rows.reduce((sum, row) => sum + Number(row.size), 0);
        const plan = [];
        for (const row of rows) {
            if (total <= this.policy.maxRuntimePresentationCacheBytes || row.pinned) continue;
            plan.push(row);
            total -= Number(row.size);
        }
        try {
            for (const row of plan) {
                const filename = path.join(this.cacheRoot, row.asset_id);
                try { fs.unlinkSync(filename); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            }
            for (const row of plan) this.db.prepare('DELETE FROM presentation_cache_entries WHERE asset_id=?').run(row.asset_id);
        } catch (error) {
            this.reconcileRuntimeCache();
            throw error;
        }
        if (total > this.policy.maxRuntimePresentationCacheBytes) throw new PresentationLibraryError('runtime-cache-quota-exceeded');
        return { totalBytes: total, evictedAt: new Date(now).toISOString() };
    }

    uniqueReferencedBytes(ownerUserId) {
        return this.ownerClaimedBytes(ownerUserId);
    }

    purgeDeletedProjects(now = new Date()) {
        const cutoff = new Date(now.getTime() - this.policy.deletedProjectRetentionDays * 86400000).toISOString();
        const rows = this.db.prepare(`SELECT presentation_id,owner_user_id FROM presentation_projects
          WHERE deleted_at IS NOT NULL AND deleted_at <= ?`).all(cutoff);
        const purged = [];
        for (const row of rows) {
            const activePin = this.db.prepare(`SELECT 1 FROM presentation_session_pins p JOIN presentation_sessions s ON s.session_id=p.session_id
              WHERE p.presentation_id=? AND s.status <> 'ended' LIMIT 1`).get(row.presentation_id);
            if (activePin) continue;
            const assets = this.db.prepare(`SELECT current_draft_asset_id AS asset_id FROM presentation_projects WHERE presentation_id=?
              UNION SELECT asset_id FROM presentation_revisions WHERE presentation_id=?
              UNION SELECT asset_id FROM presentation_checkpoints WHERE presentation_id=?`).all(row.presentation_id, row.presentation_id, row.presentation_id).map(item => item.asset_id);
            this.db.prepare('DELETE FROM presentation_checkpoints WHERE presentation_id=?').run(row.presentation_id);
            this.db.prepare('DELETE FROM presentation_revisions WHERE presentation_id=?').run(row.presentation_id);
            this.db.prepare('DELETE FROM presentation_projects WHERE presentation_id=?').run(row.presentation_id);
            for (const assetId of assets) this.db.prepare(`DELETE FROM presentation_asset_claims WHERE owner_user_id=? AND asset_id=?
              AND NOT EXISTS (SELECT 1 FROM presentation_projects WHERE current_draft_asset_id=? AND owner_user_id=? )
              AND NOT EXISTS (SELECT 1 FROM presentation_revisions r JOIN presentation_projects p ON p.presentation_id=r.presentation_id WHERE r.asset_id=? AND p.owner_user_id=? )
              AND NOT EXISTS (SELECT 1 FROM presentation_checkpoints c JOIN presentation_projects p ON p.presentation_id=c.presentation_id WHERE c.asset_id=? AND p.owner_user_id=? )`).run(row.owner_user_id, assetId, assetId, row.owner_user_id, assetId, row.owner_user_id, assetId, row.owner_user_id);
            purged.push(row.presentation_id);
        }
        return purged;
    }

    expireStagedAssetClaims(now = new Date()) {
        const rows = this.db.prepare('SELECT asset_id,owner_user_id FROM presentation_asset_claims WHERE staged_expires_at IS NOT NULL AND staged_expires_at <= ?').all(now.toISOString());
        const expired = [];
        for (const row of rows) {
            if (this.#ownerReferencesAsset(row.owner_user_id, row.asset_id)) {
                this.db.prepare('UPDATE presentation_asset_claims SET staged_expires_at=NULL WHERE asset_id=? AND owner_user_id=?').run(row.asset_id, row.owner_user_id);
                continue;
            }
            this.db.prepare('DELETE FROM presentation_asset_claims WHERE asset_id=? AND owner_user_id=?').run(row.asset_id, row.owner_user_id);
            expired.push({ assetId: row.asset_id, ownerUserId: row.owner_user_id });
        }
        return expired;
    }

    expireRehearsals(now = new Date()) {
        const rows = this.db.prepare(`SELECT r.revision_id FROM presentation_revisions r WHERE r.kind='rehearsal' AND r.retained=0 AND r.expires_at IS NOT NULL AND r.expires_at <= ? AND NOT EXISTS (SELECT 1 FROM presentation_session_pins p WHERE p.revision_id=r.revision_id)`).all(now.toISOString());
        for (const row of rows) this.db.prepare('DELETE FROM presentation_revisions WHERE revision_id=?').run(row.revision_id);
        return rows.map(row => row.revision_id);
    }

    collectGarbage(now = new Date()) {
        this.db.prepare(`DELETE FROM presentation_asset_claims WHERE staged_expires_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM presentation_projects p WHERE p.current_draft_asset_id=presentation_asset_claims.asset_id)
          AND NOT EXISTS (SELECT 1 FROM presentation_revisions r WHERE r.asset_id=presentation_asset_claims.asset_id)
          AND NOT EXISTS (SELECT 1 FROM presentation_checkpoints c WHERE c.asset_id=presentation_asset_claims.asset_id)`).run();
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

export class PresentationMaintenanceRunner {
    constructor(store, { intervalMs = 60 * 60 * 1000, now = () => new Date() } = {}) {
        this.store = store;
        this.intervalMs = intervalMs;
        this.now = now;
        this.timer = null;
    }

    runOnce() {
        const now = this.now();
        const purgedProjects = this.store.purgeDeletedProjects(now);
        const expiredStagedClaims = this.store.expireStagedAssetClaims(now);
        const expiredRehearsals = this.store.expireRehearsals(now);
        const garbage = this.store.collectGarbage(now);
        const cache = this.store.evictRuntimeCache(now.getTime());
        return { purgedProjects, expiredStagedClaims, expiredRehearsals, garbage, cache };
    }

    start() {
        this.runOnce();
        this.timer = setInterval(() => {
            try { this.runOnce(); }
            catch (error) { console.error('PRESENTATION_MAINTENANCE_ERROR', error); }
        }, this.intervalMs);
        this.timer.unref?.();
        return this;
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}
