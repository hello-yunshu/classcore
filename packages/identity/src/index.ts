/**
 * SERVER-ONLY identity directory. Browser surfaces must never import this package.
 * Durable learning events refer to participantId only; names/roster data live here.
 */
export interface StudentIdentityRecord {
    sessionId: string;
    participantId: string;
    displayName: string;
    seatNo?: string | null;
    rosterId?: string | null;
    classId?: string | null;
    updatedAt: string;
}
export type StudentIdentityRosterIssueCode = 'duplicate-participant-id' | 'duplicate-seat-no' | 'duplicate-roster-id' | 'ambiguous-participant-hint';
export interface StudentIdentityRosterIssue {
    code: StudentIdentityRosterIssueCode;
    sessionId: string;
    value: string;
    participantIds: string[];
}
export function normalizeStudentIdentityHint(value: string): string {
    return value.trim();
}
export function validateStudentIdentityRoster(records: StudentIdentityRecord[]): StudentIdentityRosterIssue[] {
    const issues: StudentIdentityRosterIssue[] = [];
    const grouped = new Map<string, StudentIdentityRecord[]>();
    for (const record of records) {
        const list = grouped.get(record.sessionId) ?? [];
        list.push(record);
        grouped.set(record.sessionId, list);
    }
    for (const [sessionId, list] of grouped) {
        const participantOccurrences = new Map<string, number>();
        for (const item of list) {
            const participantId = normalizeStudentIdentityHint(item.participantId);
            if (!participantId)
                continue;
            participantOccurrences.set(participantId, (participantOccurrences.get(participantId) ?? 0) + 1);
        }
        for (const [value, count] of participantOccurrences) {
            if (count > 1)
                issues.push({ code: 'duplicate-participant-id', sessionId, value, participantIds: [value] });
        }
        const scanSharedHint = (field: 'seatNo' | 'rosterId', code: StudentIdentityRosterIssueCode) => {
            const seen = new Map<string, Set<string>>();
            for (const item of list) {
                const raw = item[field];
                if (raw === null || raw === undefined)
                    continue;
                const value = normalizeStudentIdentityHint(String(raw));
                if (!value)
                    continue;
                const ids = seen.get(value) ?? new Set<string>();
                ids.add(normalizeStudentIdentityHint(item.participantId));
                seen.set(value, ids);
            }
            for (const [value, participantIds] of seen) {
                if (participantIds.size > 1)
                    issues.push({ code, sessionId, value, participantIds: [...participantIds] });
            }
        };
        scanSharedHint('seatNo', 'duplicate-seat-no');
        scanSharedHint('rosterId', 'duplicate-roster-id');
        const hints = new Map<string, Set<string>>();
        for (const item of list) {
            const participantId = normalizeStudentIdentityHint(item.participantId);
            for (const raw of [item.participantId, item.seatNo, item.rosterId]) {
                if (raw === null || raw === undefined)
                    continue;
                const value = normalizeStudentIdentityHint(String(raw));
                if (!value)
                    continue;
                const ids = hints.get(value) ?? new Set<string>();
                ids.add(participantId);
                hints.set(value, ids);
            }
        }
        for (const [value, ids] of hints) {
            if (ids.size > 1 && !issues.some(i => i.sessionId === sessionId && i.value === value))
                issues.push({ code: 'ambiguous-participant-hint', sessionId, value, participantIds: [...ids] });
        }
    }
    return issues;
}

export function assertStudentIdentityRosterReady(records: StudentIdentityRecord[]): void {
    const issues = validateStudentIdentityRoster(records);
    if (issues.length)
        throw new Error(`student-roster-not-ready:${issues.map(i => `${i.code}:${i.value}`).join(',')}`);
}
export interface IdentityDirectory {
    getStudent(sessionId: string, participantId: string): StudentIdentityRecord | null;
    listStudents(sessionId: string): StudentIdentityRecord[];
    upsertStudent(record: StudentIdentityRecord): void;
    removeSession(sessionId: string): void;
}
export class InMemoryIdentityDirectory implements IdentityDirectory {
    #sessions = new Map<string, Map<string, StudentIdentityRecord>>();
    getStudent(sessionId: string, participantId: string): StudentIdentityRecord | null {
        const value = this.#sessions.get(sessionId)?.get(participantId);
        return value ? structuredClone(value) : null;
    }
    listStudents(sessionId: string): StudentIdentityRecord[] { return [...(this.#sessions.get(sessionId)?.values() ?? [])].map(v => structuredClone(v)); }
    upsertStudent(record: StudentIdentityRecord): void {
        if (!record.participantId.startsWith('student:'))
            throw new Error('identity-record-must-be-student');
        let map = this.#sessions.get(record.sessionId);
        if (!map) {
            map = new Map();
            this.#sessions.set(record.sessionId, map);
        }
        const candidate = [...map.values()].filter(item => item.participantId !== record.participantId).concat(record);
        assertStudentIdentityRosterReady(candidate);
        map.set(record.participantId, structuredClone(record));
    }
    removeSession(sessionId: string): void { this.#sessions.delete(sessionId); }
}
/**
 * D7 的学生身份认领规则：第一次认领建立设备绑定；刷新/重连凭 reconnect token 恢复；
 * 同一学生被第二台设备直接认领时拒绝，由 Backstage 显式重置。
 * 这是课堂稳定性规则，不是通用账号系统。
 */
export interface StudentClaimRecord {
    sessionId: string;
    participantId: string;
    participantHint: string;
    clientInstanceId: string;
    reconnectToken: string;
    claimedAt: string;
}
export interface StudentClaimSnapshot {
    sessionId: string;
    claims: StudentClaimRecord[];
}
export interface StudentClaimDirectory {
    claim(sessionId: string, participantHint: string, clientInstanceId: string, reconnectToken?: string | null): {
        ok: true;
        participantId: string;
        reconnectToken: string;
        reconnected: boolean;
    } | {
        ok: false;
        reason: 'unknown-student' | 'ambiguous-student' | 'already-claimed' | 'invalid-reconnect-token';
    };
    reset(sessionId: string, participantId: string): void;
    get(sessionId: string, participantId: string): StudentClaimRecord | null;
    snapshot(sessionId: string): StudentClaimSnapshot;
    restore(snapshot: StudentClaimSnapshot): void;
    removeSession(sessionId: string): void;
}
export class InMemoryStudentClaimDirectory implements StudentClaimDirectory {
    #claims = new Map<string, Map<string, StudentClaimRecord>>();
    constructor(private readonly identities: IdentityDirectory, private readonly tokenFactory: () => string = () => crypto.randomUUID()) { }
    claim(sessionId: string, participantHint: string, clientInstanceId: string, reconnectToken?: string | null): {
        ok: true;
        participantId: string;
        reconnectToken: string;
        reconnected: boolean;
    } | {
        ok: false;
        reason: 'unknown-student' | 'ambiguous-student' | 'already-claimed' | 'invalid-reconnect-token';
    } {
        const normalizedHint = normalizeStudentIdentityHint(participantHint);
        if (!normalizedHint)
            return { ok: false as const, reason: 'unknown-student' as const };
        const matches = this.identities.listStudents(sessionId).filter(item =>
            normalizeStudentIdentityHint(item.seatNo ?? '') === normalizedHint ||
            normalizeStudentIdentityHint(item.rosterId ?? '') === normalizedHint ||
            normalizeStudentIdentityHint(item.participantId) === normalizedHint);
        if (matches.length === 0)
            return { ok: false as const, reason: 'unknown-student' as const };
        if (matches.length > 1)
            return { ok: false as const, reason: 'ambiguous-student' as const };
        const identity = matches[0];
        let session = this.#claims.get(sessionId);
        if (!session) {
            session = new Map();
            this.#claims.set(sessionId, session);
        }
        const existing = session.get(identity.participantId);
        if (existing) {
            if (reconnectToken && reconnectToken === existing.reconnectToken) {
                existing.clientInstanceId = clientInstanceId;
                return { ok: true as const, participantId: existing.participantId, reconnectToken: existing.reconnectToken, reconnected: true };
            }
            return reconnectToken
                ? { ok: false as const, reason: 'invalid-reconnect-token' as const }
                : { ok: false as const, reason: 'already-claimed' as const };
        }
        const record: StudentClaimRecord = {
            sessionId,
            participantId: identity.participantId,
            participantHint: normalizedHint,
            clientInstanceId,
            reconnectToken: this.tokenFactory(),
            claimedAt: new Date().toISOString(),
        };
        session.set(identity.participantId, record);
        return { ok: true as const, participantId: record.participantId, reconnectToken: record.reconnectToken, reconnected: false };
    }
    reset(sessionId: string, participantId: string): void { this.#claims.get(sessionId)?.delete(participantId); }
    get(sessionId: string, participantId: string): StudentClaimRecord | null {
        const record = this.#claims.get(sessionId)?.get(participantId);
        return record ? structuredClone(record) : null;
    }
    snapshot(sessionId: string): StudentClaimSnapshot {
        return { sessionId, claims: [...(this.#claims.get(sessionId)?.values() ?? [])].map(item => structuredClone(item)) };
    }
    restore(snapshot: StudentClaimSnapshot): void {
        const map = new Map<string, StudentClaimRecord>();
        const tokens = new Set<string>();
        for (const claim of snapshot.claims) {
            if (claim.sessionId !== snapshot.sessionId)
                throw new Error('student-claim-session-mismatch');
            if (!claim.participantId.startsWith('student:'))
                throw new Error('student-claim-invalid-participant');
            if (!this.identities.getStudent(snapshot.sessionId, claim.participantId))
                throw new Error('student-claim-identity-not-found');
            if (map.has(claim.participantId))
                throw new Error('student-claim-duplicate-participant');
            if (tokens.has(claim.reconnectToken))
                throw new Error('student-claim-duplicate-token');
            tokens.add(claim.reconnectToken);
            map.set(claim.participantId, structuredClone(claim));
        }
        this.#claims.set(snapshot.sessionId, map);
    }
    removeSession(sessionId: string): void { this.#claims.delete(sessionId); }
}

