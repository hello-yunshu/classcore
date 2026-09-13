import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const now = () => new Date().toISOString();
function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function comparableEvent(value) {
    const { eventId: _eventId, serverSeq: _serverSeq, serverReceivedAt: _serverReceivedAt, ...input } = value;
    return canonicalJson(input);
}
function comparableSnapshot(value) {
    const { capturedAt: _capturedAt, ...payload } = value;
    return canonicalJson(payload);
}
function artifactContext(value) {
    return canonicalJson({ sessionId: value.sessionId, activityId: value.activityId, ownerScope: value.ownerScope });
}
function submissionContext(value) {
    return canonicalJson({ sessionId: value.sessionId, activityId: value.activityId, submitterScope: value.submitterScope, submittedBy: value.submittedBy });
}
function submissionTransitionAllowed(from, to) {
    return from === 'draft' ? to === 'draft' || to === 'submitted' : from === 'submitted' ? to === 'submitted' || to === 'accepted' : to === 'accepted';
}
function transferTransitionAllowed(from, to) {
    const allowed = { queued: ['queued', 'sent', 'failed'], sent: ['sent', 'received', 'failed'], received: ['received', 'opened', 'failed'], opened: ['opened', 'completed', 'failed'], completed: ['completed'], failed: ['failed'] };
    return allowed[from]?.includes(to) ?? false;
}
export class SqliteClassroomStateStore {
    constructor(filename) {
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        this.db = new DatabaseSync(filename, { timeout: 3000 });
        this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=3000;

      CREATE TABLE IF NOT EXISTS state_json(
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        item_key TEXT NOT NULL,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(session_id, kind, item_key)
      );

      CREATE TABLE IF NOT EXISTS transport_events(
        session_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(session_id, event_id)
      );

      CREATE TABLE IF NOT EXISTS transport_controls(
        session_id TEXT NOT NULL,
        control_id TEXT NOT NULL,
        json TEXT NOT NULL,
        outcome_json TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY(session_id, control_id)
      );

      CREATE TABLE IF NOT EXISTS transport_session_sequence(
        session_id TEXT PRIMARY KEY,
        last_seq INTEGER NOT NULL CHECK(last_seq >= 0)
      );

      CREATE TABLE IF NOT EXISTS transport_sequence_assignment(
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('event', 'control')),
        item_id TEXT NOT NULL,
        server_seq INTEGER NOT NULL CHECK(server_seq > 0),
        PRIMARY KEY(session_id, kind, item_id),
        UNIQUE(session_id, server_seq)
      );

      CREATE TABLE IF NOT EXISTS classroom_events(
        session_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        event_id TEXT NOT NULL,
        server_seq INTEGER NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(session_id, idempotency_key),
        UNIQUE(session_id, event_id),
        UNIQUE(session_id, server_seq)
      );
      CREATE TABLE IF NOT EXISTS classroom_snapshots(
        session_id TEXT NOT NULL,
        activity_id TEXT NOT NULL,
        applet_instance_id TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        revision INTEGER NOT NULL,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(session_id, activity_id, applet_instance_id, scope_key)
      );
      CREATE TABLE IF NOT EXISTS classroom_artifacts(
        artifact_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(artifact_id, revision)
      );
      CREATE TABLE IF NOT EXISTS classroom_submissions(
        submission_id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS classroom_transfers(
        transfer_id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
        const controlColumns = this.db.prepare('PRAGMA table_info(transport_controls)').all().map((row) => row.name);
        if (!controlColumns.includes('outcome_json'))
            this.db.exec('ALTER TABLE transport_controls ADD COLUMN outcome_json TEXT');
        this.putStmt = this.db.prepare(`
      INSERT INTO state_json(session_id, kind, item_key, json, updated_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(session_id, kind, item_key)
      DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at
    `);
        this.getStmt = this.db.prepare('SELECT json FROM state_json WHERE session_id=? AND kind=? AND item_key=?');
        this.listStmt = this.db.prepare('SELECT json FROM state_json WHERE session_id=? AND kind=? ORDER BY item_key');
        this.eventInsertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO transport_events(session_id, event_id, json, created_at)
      VALUES(?, ?, ?, ?)
    `);
        this.controlInsertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO transport_controls(session_id, control_id, json, created_at)
      VALUES(?, ?, ?, ?)
    `);
        this.eventGetStmt = this.db.prepare('SELECT json FROM transport_events WHERE session_id=? AND event_id=?');
        this.controlGetStmt = this.db.prepare('SELECT json FROM transport_controls WHERE session_id=? AND control_id=?');
        this.controlOutcomeGetStmt = this.db.prepare('SELECT outcome_json FROM transport_controls WHERE session_id=? AND control_id=?');
        this.assignmentGetStmt = this.db.prepare(`
      SELECT server_seq
      FROM transport_sequence_assignment
      WHERE session_id=? AND kind=? AND item_id=?
    `);
        this.assignmentInsertStmt = this.db.prepare(`
      INSERT INTO transport_sequence_assignment(session_id, kind, item_id, server_seq)
      VALUES(?, ?, ?, ?)
    `);
        this.sequenceNextStmt = this.db.prepare(`
      INSERT INTO transport_session_sequence(session_id, last_seq)
      VALUES(?, 1)
      ON CONFLICT(session_id)
      DO UPDATE SET last_seq=last_seq + 1
      RETURNING last_seq
    `);
    this.sequenceCurrentStmt = this.db.prepare('SELECT last_seq FROM transport_session_sequence WHERE session_id=?');
        this.classroomEventGetStmt = this.db.prepare('SELECT json FROM classroom_events WHERE session_id=? AND idempotency_key=?');
        this.classroomEventListStmt = this.db.prepare('SELECT json FROM classroom_events WHERE session_id=? ORDER BY server_seq');
        this.classroomSnapshotGetStmt = this.db.prepare('SELECT json FROM classroom_snapshots WHERE session_id=? AND activity_id=? AND applet_instance_id=? AND scope_key=?');
        this.classroomArtifactGetStmt = this.db.prepare('SELECT json FROM classroom_artifacts WHERE artifact_id=? AND revision=?');
        this.classroomArtifactLatestStmt = this.db.prepare('SELECT json FROM classroom_artifacts WHERE artifact_id=? ORDER BY revision DESC LIMIT 1');
        this.classroomSubmissionGetStmt = this.db.prepare('SELECT json FROM classroom_submissions WHERE submission_id=?');
        this.classroomTransferGetStmt = this.db.prepare('SELECT json FROM classroom_transfers WHERE transfer_id=?');
    }
    close() {
        this.db.close();
    }
    put(sessionId, kind, key, value) {
        this.putStmt.run(sessionId, kind, key, JSON.stringify(value), now());
    }
    get(sessionId, kind, key = 'singleton') {
        const row = this.getStmt.get(sessionId, kind, key);
        return row ? JSON.parse(row.json) : null;
    }
    list(sessionId, kind) {
        return this.listStmt.all(sessionId, kind).map((row) => JSON.parse(row.json));
    }
    async saveSession(value) {
        this.put(value.sessionId, 'session', 'singleton', value);
    }
    async loadSession(sessionId) {
        return this.get(sessionId, 'session');
    }
    async saveMembership(value) {
        this.put(value.sessionId, 'membership', value.membershipId, value);
    }
    async loadMemberships(sessionId) {
        return this.list(sessionId, 'membership');
    }
    saveControllerLease(value) {
        this.put(value.sessionId, 'controller-lease', 'singleton', value);
    }
    loadControllerLease(sessionId) {
        return this.get(sessionId, 'controller-lease');
    }
    async saveStageState(value) {
        this.put(value.sessionId, 'stage', 'singleton', value);
    }
    async loadStageState(sessionId) {
        return this.get(sessionId, 'stage');
    }
    async saveStudentIdentity(value) {
        this.put(value.sessionId, 'student-identity', value.participantId, value);
    }
    async loadStudentIdentities(sessionId) {
        return this.list(sessionId, 'student-identity');
    }
    async saveStudentClaims(value) {
        this.put(value.sessionId, 'student-claims', 'singleton', value);
    }
    async loadStudentClaims(sessionId) {
        return this.get(sessionId, 'student-claims');
    }
    async savePublicSubjectProjection(value) {
        this.put(value.sessionId, 'public-projection', 'singleton', value);
    }
    async loadPublicSubjectProjection(sessionId) {
        return this.get(sessionId, 'public-projection');
    }
    savePresentationPlayback(value) {
        this.put(value.sessionId, 'presentation-playback', 'singleton', value);
    }
    loadPresentationPlayback(sessionId) {
        return this.get(sessionId, 'presentation-playback');
    }
    // PresentationPlaybackStore-compatible aliases.
    async save(value) {
        return this.savePresentationPlayback(value);
    }
    async load(sessionId) {
        return this.loadPresentationPlayback(sessionId);
    }
    currentTransportSeq(sessionId) {
        const row = this.sequenceCurrentStmt.get(sessionId);
        return row ? Number(row.last_seq) : 0;
    }
    acceptTransportEvent(sessionId, eventId, payload) {
        return this.#acceptTransport('event', sessionId, eventId, payload);
    }
    acceptTransportControl(sessionId, controlId, payload) {
        return this.#acceptTransport('control', sessionId, controlId, payload);
    }
    /**
     * Presentation controls need a stronger idempotency contract than the
     * generic transport path: a rejected apply is a durable result and must
     * be replayed as the same rejection on retry.
     */
    acceptPresentationControl(sessionId, controlId, payload, apply) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const payloadJson = canonicalJson(payload);
            const existingAssignment = this.assignmentGetStmt.get(sessionId, 'control', controlId);
            const persisted = this.controlGetStmt.get(sessionId, controlId);
            if (persisted && canonicalJson(JSON.parse(persisted.json)) !== payloadJson)
                throw new Error(`transport-id-payload-mismatch:control:${controlId}`);
            if (existingAssignment || persisted) {
                const outcomeRow = this.controlOutcomeGetStmt.get(sessionId, controlId);
                const outcome = outcomeRow?.outcome_json ? JSON.parse(outcomeRow.outcome_json) : null;
                this.db.exec('COMMIT');
                return { inserted: false, serverSeq: existingAssignment ? Number(existingAssignment.server_seq) : null, outcome };
            }
            const outcome = (() => {
                try {
                    return { ok: true, value: apply() };
                }
                catch (error) {
                    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
                }
            })();
            this.controlInsertStmt.run(sessionId, controlId, payloadJson, now());
            let serverSeq = null;
            if (outcome.ok) {
                const sequenceRow = this.sequenceNextStmt.get(sessionId);
                serverSeq = Number(sequenceRow.last_seq);
                this.assignmentInsertStmt.run(sessionId, 'control', controlId, serverSeq);
            }
            this.db.prepare('UPDATE transport_controls SET outcome_json=? WHERE session_id=? AND control_id=?').run(JSON.stringify(outcome), sessionId, controlId);
            this.db.exec('COMMIT');
            return { inserted: true, serverSeq, outcome };
        }
        catch (error) {
            try { this.db.exec('ROLLBACK'); } catch { /* preserve original */ }
            throw error;
        }
    }
    #acceptTransport(kind, sessionId, itemId, payload) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const payloadJson = canonicalJson(payload);
            const getStmt = kind === 'event' ? this.eventGetStmt : this.controlGetStmt;
            const existingAssignment = this.assignmentGetStmt.get(sessionId, kind, itemId);
            if (existingAssignment) {
                const persisted = getStmt.get(sessionId, itemId);
                if (!persisted || canonicalJson(JSON.parse(persisted.json)) !== payloadJson) throw new Error(`transport-id-payload-mismatch:${kind}:${itemId}`);
                this.db.exec('COMMIT');
                return { inserted: false, serverSeq: Number(existingAssignment.server_seq) };
            }
            const insertStmt = kind === 'event' ? this.eventInsertStmt : this.controlInsertStmt;
            const persisted = getStmt.get(sessionId, itemId);
            const alreadyPersisted = Boolean(persisted);
            if (persisted && canonicalJson(JSON.parse(persisted.json)) !== payloadJson) throw new Error(`transport-id-payload-mismatch:${kind}:${itemId}`);
            if (!alreadyPersisted) {
                insertStmt.run(sessionId, itemId, payloadJson, now());
            }
            const sequenceRow = this.sequenceNextStmt.get(sessionId);
            const serverSeq = Number(sequenceRow.last_seq);
            this.assignmentInsertStmt.run(sessionId, kind, itemId, serverSeq);
            this.db.exec('COMMIT');
            return { inserted: !alreadyPersisted, serverSeq };
        }
        catch (error) {
            try {
                this.db.exec('ROLLBACK');
            }
            catch {
                // Preserve the original database error.
            }
            throw error;
        }
    }
    transportCounts() {
        return {
            events: Number(this.db.prepare('SELECT COUNT(*) AS n FROM transport_events').get().n),
            controls: Number(this.db.prepare('SELECT COUNT(*) AS n FROM transport_controls').get().n),
            sessionsWithSequence: Number(this.db.prepare('SELECT COUNT(*) AS n FROM transport_session_sequence').get().n),
        };
    }

    acceptClientEventAtomically(idempotencyKey, draft) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const existing = this.classroomEventGetStmt.get(draft.sessionId, idempotencyKey);
            if (existing) {
                const event = JSON.parse(existing.json);
                if (comparableEvent(event) !== comparableEvent({ ...draft, eventId: event.eventId, serverSeq: event.serverSeq, serverReceivedAt: event.serverReceivedAt }))
                    throw new Error('event-idempotency-payload-mismatch');
                this.db.exec('COMMIT');
                return { inserted: false, event };
            }
            const row = this.sequenceNextStmt.get(draft.sessionId);
            const event = { ...draft, eventId: `event:${crypto.randomUUID()}`, serverSeq: Number(row.last_seq), serverReceivedAt: now() };
            this.db.prepare('INSERT INTO classroom_events(session_id,idempotency_key,event_id,server_seq,json,created_at) VALUES(?,?,?,?,?,?)').run(draft.sessionId, idempotencyKey, event.eventId, event.serverSeq, JSON.stringify(event), event.serverReceivedAt);
            this.db.exec('COMMIT');
            return { inserted: true, event };
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch {}
            throw error;
        }
    }
    listEvents(sessionId) { return this.classroomEventListStmt.all(sessionId).map(row => JSON.parse(row.json)); }
    saveSnapshot(snapshot) {
        const scopeKey = `${snapshot.scope.type}:${snapshot.scope.id}`;
        const existing = this.classroomSnapshotGetStmt.get(snapshot.sessionId, snapshot.activityId, snapshot.appletInstanceId, scopeKey);
        if (existing && JSON.parse(existing.json).revision > snapshot.revision) throw new Error('snapshot-revision-regression');
        if (existing && JSON.parse(existing.json).revision === snapshot.revision) {
            if (comparableSnapshot(JSON.parse(existing.json)) !== comparableSnapshot(snapshot)) throw new Error('snapshot-revision-payload-mismatch');
            return;
        }
        this.db.prepare(`INSERT INTO classroom_snapshots(session_id,activity_id,applet_instance_id,scope_key,revision,json,updated_at)
            VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(session_id,activity_id,applet_instance_id,scope_key)
            DO UPDATE SET revision=excluded.revision,json=excluded.json,updated_at=excluded.updated_at`).run(snapshot.sessionId, snapshot.activityId, snapshot.appletInstanceId, scopeKey, snapshot.revision, JSON.stringify(snapshot), now());
    }
    getLatestSnapshot(sessionId, activityId, appletInstanceId, scopeKey) {
        const row = this.classroomSnapshotGetStmt.get(sessionId, activityId, appletInstanceId, scopeKey);
        return row ? JSON.parse(row.json) : null;
    }
    saveArtifact(artifact) {
        const existing = this.classroomArtifactGetStmt.get(artifact.artifactId, artifact.revision);
        if (existing && canonicalJson(JSON.parse(existing.json)) !== canonicalJson(artifact)) throw new Error('artifact-revision-immutable');
        if (existing) return;
        const latest = this.classroomArtifactLatestStmt.get(artifact.artifactId);
        if (latest && JSON.parse(latest.json).revision > artifact.revision) throw new Error('artifact-revision-regression');
        if (latest && artifactContext(JSON.parse(latest.json)) !== artifactContext(artifact)) throw new Error('artifact-revision-context-mismatch');
        this.db.prepare('INSERT OR REPLACE INTO classroom_artifacts(artifact_id,revision,json,created_at) VALUES(?,?,?,?)').run(artifact.artifactId, artifact.revision, JSON.stringify(artifact), now());
    }
    getArtifact(artifactId, revision) {
        const row = revision == null ? this.classroomArtifactLatestStmt.get(artifactId) : this.classroomArtifactGetStmt.get(artifactId, revision);
        return row ? JSON.parse(row.json) : null;
    }
    saveSubmission(submission) {
        const existing = this.classroomSubmissionGetStmt.get(submission.submissionId);
        if (existing) {
            const current = JSON.parse(existing.json);
            if (canonicalJson(current) === canonicalJson(submission)) return;
            if (submissionContext(current) !== submissionContext(submission)) throw new Error('submission-authority-immutable');
            if (!submissionTransitionAllowed(current.status, submission.status)) throw new Error('submission-state-regression');
            if (current.status !== 'draft' && current.status === submission.status) throw new Error('submission-state-immutable');
        }
        this.db.prepare('INSERT OR REPLACE INTO classroom_submissions(submission_id,json,updated_at) VALUES(?,?,?)').run(submission.submissionId, JSON.stringify(submission), now());
    }
    getSubmission(submissionId) { const row = this.classroomSubmissionGetStmt.get(submissionId); return row ? JSON.parse(row.json) : null; }
    saveTransfer(transfer) {
        const existing = this.classroomTransferGetStmt.get(transfer.transferId);
        if (existing) {
            const current = JSON.parse(existing.json);
            if (canonicalJson(current) === canonicalJson(transfer)) return;
            if (!transferTransitionAllowed(current.status, transfer.status)) throw new Error('transfer-state-regression');
            if (current.status === transfer.status) throw new Error('transfer-state-immutable');
        }
        this.db.prepare('INSERT OR REPLACE INTO classroom_transfers(transfer_id,json,updated_at) VALUES(?,?,?)').run(transfer.transferId, JSON.stringify(transfer), now());
    }
    getTransfer(transferId) { const row = this.classroomTransferGetStmt.get(transferId); return row ? JSON.parse(row.json) : null; }
}
