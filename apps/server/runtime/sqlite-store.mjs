import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const now = () => new Date().toISOString();
function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
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
    `);
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
    async saveControllerLease(value) {
        this.put(value.sessionId, 'controller-lease', 'singleton', value);
    }
    async loadControllerLease(sessionId) {
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
}
