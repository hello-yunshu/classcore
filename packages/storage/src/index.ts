import type { AcceptedDomainEvent, AppletStateSnapshot, ArtifactTransfer, ClassroomSession, ControllerLease, LearningArtifact, ResolvedLessonReference, SessionMembership, StageState, Submission } from '@classroom/contracts';
export type AcceptedDomainEventDraft<T extends Record<string, unknown> = Record<string, unknown>> = Omit<AcceptedDomainEvent<T>, 'eventId' | 'serverSeq' | 'serverReceivedAt'>;
export interface PublicSubjectProjectionRecord {
    sessionId: string;
    participantToSubject: Record<string, string>;
    updatedAt: string;
}
export interface StudentIdentityPersistenceRecord {
    sessionId: string;
    participantId: string;
    displayName: string;
    seatNo?: string | null;
    rosterId?: string | null;
    classId?: string | null;
    updatedAt: string;
}
export interface StudentClaimPersistenceRecord {
    sessionId: string;
    participantId: string;
    participantHint: string;
    clientInstanceId: string;
    reconnectToken: string;
    claimedAt: string;
}
export interface StudentClaimPersistenceSnapshot {
    sessionId: string;
    claims: StudentClaimPersistenceRecord[];
}
export interface ImmutableLessonPackageLocation {
    reference: ResolvedLessonReference;
    contentAddress: string;
    storedAt: string;
}
/**
 * D7最小恢复的“唯一权威状态”。FeaturePolicy 已包含在 ClassroomSession 中，
 * 因此这里不再提供独立 FeaturePolicy 存储，避免 Server restart 后出现两份真相。
 */
export interface RuntimeRecoveryStorage {
    saveSession(session: ClassroomSession): Promise<void>;
    loadSession(sessionId: string): Promise<ClassroomSession | null>;
    saveMembership(membership: SessionMembership): Promise<void>;
    loadMemberships(sessionId: string): Promise<SessionMembership[]>;
    saveControllerLease(lease: ControllerLease): Promise<void>;
    loadControllerLease(sessionId: string): Promise<ControllerLease | null>;
    saveStageState(state: StageState): Promise<void>;
    loadStageState(sessionId: string): Promise<StageState | null>;
}
export interface StudentClaimPersistenceStore {
    saveStudentClaims(snapshot: StudentClaimPersistenceSnapshot): Promise<void>;
    loadStudentClaims(sessionId: string): Promise<StudentClaimPersistenceSnapshot | null>;
}
export interface StudentIdentityPersistenceStore {
    saveStudentIdentity(record: StudentIdentityPersistenceRecord): Promise<void>;
    loadStudentIdentities(sessionId: string): Promise<StudentIdentityPersistenceRecord[]>;
}
export interface PublicSubjectProjectionPersistenceStore {
    savePublicSubjectProjection(record: PublicSubjectProjectionRecord): Promise<void>;
    loadPublicSubjectProjection(sessionId: string): Promise<PublicSubjectProjectionRecord | null>;
}
/** 参考实现只用于契约与恢复流程验证；真实课堂使用 SQLite adapter。 */
export class InMemoryRuntimeRecoveryStorage implements RuntimeRecoveryStorage, StudentClaimPersistenceStore {
    #sessions = new Map<string, ClassroomSession>();
    #memberships = new Map<string, Map<string, SessionMembership>>();
    #leases = new Map<string, ControllerLease>();
    #stages = new Map<string, StageState>();
    #claims = new Map<string, StudentClaimPersistenceSnapshot>();
    async saveSession(session: ClassroomSession) { this.#sessions.set(session.sessionId, structuredClone(session)); }
    async loadSession(sessionId: string) { const v = this.#sessions.get(sessionId); return v ? structuredClone(v) : null; }
    async saveMembership(membership: SessionMembership) {
        let map = this.#memberships.get(membership.sessionId);
        if (!map) {
            map = new Map();
            this.#memberships.set(membership.sessionId, map);
        }
        map.set(membership.membershipId, structuredClone(membership));
    }
    async loadMemberships(sessionId: string) { return [...(this.#memberships.get(sessionId)?.values() ?? [])].map(v => structuredClone(v)); }
    async saveControllerLease(lease: ControllerLease) { this.#leases.set(lease.sessionId, structuredClone(lease)); }
    async loadControllerLease(sessionId: string) { const v = this.#leases.get(sessionId); return v ? structuredClone(v) : null; }
    async saveStageState(state: StageState) { this.#stages.set(state.sessionId, structuredClone(state)); }
    async loadStageState(sessionId: string) { const v = this.#stages.get(sessionId); return v ? structuredClone(v) : null; }
    async saveStudentClaims(snapshot: StudentClaimPersistenceSnapshot) { this.#claims.set(snapshot.sessionId, structuredClone(snapshot)); }
    async loadStudentClaims(sessionId: string) { const v = this.#claims.get(sessionId); return v ? structuredClone(v) : null; }
}
/** Internal implementation contract; NOT part of the public v1 compatibility promise. */
export interface ClassroomStorage extends RuntimeRecoveryStorage, StudentClaimPersistenceStore, StudentIdentityPersistenceStore, PublicSubjectProjectionPersistenceStore {
    /** One transaction: dedup -> allocate eventId/serverSeq/time -> insert -> return original on retry. */
    acceptClientEventAtomically<T extends Record<string, unknown> = Record<string, unknown>>(idempotencyKey: string, event: AcceptedDomainEventDraft<T>): Promise<{
        inserted: boolean;
        event: AcceptedDomainEvent<T>;
    }>;
    saveSnapshot(snapshot: AppletStateSnapshot): Promise<void>;
    getLatestSnapshot(sessionId: string, activityId: string, appletInstanceId: string, scopeKey: string): Promise<AppletStateSnapshot | null>;
    saveArtifact(artifact: LearningArtifact): Promise<void>;
    getArtifact(artifactId: string, revision?: number): Promise<LearningArtifact | null>;
    saveSubmission(submission: Submission): Promise<void>;
    getSubmission(submissionId: string): Promise<Submission | null>;
    listSubmissions(sessionId: string, activityId?: string): Promise<Submission[]>;
    saveTransfer(transfer: ArtifactTransfer): Promise<void>;
    getTransfer(transferId: string): Promise<ArtifactTransfer | null>;
    listEvents(sessionId: string): Promise<AcceptedDomainEvent[]>;
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
    return JSON.stringify(value);
}

function comparableEvent(value: AcceptedDomainEvent): string {
    const { eventId: _eventId, serverSeq: _serverSeq, serverReceivedAt: _serverReceivedAt, ...input } = value;
    return canonical(input);
}

function comparableSnapshot(value: AppletStateSnapshot): string {
    // capturedAt is a server/runtime observation, not the snapshot payload.
    const { capturedAt: _capturedAt, ...payload } = value;
    return canonical(payload);
}

function artifactContext(value: LearningArtifact): string {
    return canonical({ sessionId: value.sessionId, activityId: value.activityId, ownerScope: value.ownerScope });
}

function submissionContext(value: Submission): string {
    return canonical({ sessionId: value.sessionId, activityId: value.activityId, submitterScope: value.submitterScope, submittedBy: value.submittedBy });
}

function submissionTransitionAllowed(from: Submission['status'], to: Submission['status']): boolean {
    return from === 'draft' ? to === 'draft' || to === 'submitted' : from === 'submitted' ? to === 'submitted' || to === 'accepted' : to === 'accepted';
}

/** Complete deterministic in-memory adapter used by unit/integration/rehearsal paths. */
export class InMemoryClassroomStorage extends InMemoryRuntimeRecoveryStorage implements ClassroomStorage, StudentIdentityPersistenceStore, PublicSubjectProjectionPersistenceStore {
    #events = new Map<string, Map<string, AcceptedDomainEvent>>();
    #eventKeys = new Map<string, string>();
    #snapshots = new Map<string, AppletStateSnapshot>();
    #artifacts = new Map<string, Map<number, LearningArtifact>>();
    #submissions = new Map<string, Submission>();
    #transfers = new Map<string, ArtifactTransfer>();
    #identities = new Map<string, Map<string, StudentIdentityPersistenceRecord>>();
    #publicSubjects = new Map<string, PublicSubjectProjectionRecord>();
    constructor(private readonly idFactory: () => string = () => globalThis.crypto.randomUUID(), private readonly clock: () => string = () => new Date().toISOString()) { super(); }

    async acceptClientEventAtomically<T extends Record<string, unknown> = Record<string, unknown>>(idempotencyKey: string, draft: AcceptedDomainEventDraft<T>): Promise<{ inserted: boolean; event: AcceptedDomainEvent<T> }> {
        const scopedKey = `${draft.sessionId}\u0000${idempotencyKey}`;
        const existingKey = this.#eventKeys.get(scopedKey);
        if (existingKey) {
            const existing = this.#events.get(draft.sessionId)?.get(existingKey);
            if (!existing) throw new Error('event-index-corrupt');
            if (comparableEvent(existing) !== comparableEvent({ ...draft, eventId: existing.eventId, serverSeq: existing.serverSeq, serverReceivedAt: existing.serverReceivedAt })) throw new Error('event-idempotency-payload-mismatch');
            return { inserted: false, event: structuredClone(existing) as AcceptedDomainEvent<T> };
        }
        const sessionEvents = this.#events.get(draft.sessionId) ?? new Map<string, AcceptedDomainEvent>();
        this.#events.set(draft.sessionId, sessionEvents);
        const event: AcceptedDomainEvent<T> = { ...draft, eventId: `event:${this.idFactory()}`, serverSeq: sessionEvents.size + 1, serverReceivedAt: this.clock() } as AcceptedDomainEvent<T>;
        sessionEvents.set(event.eventId, structuredClone(event));
        this.#eventKeys.set(scopedKey, event.eventId);
        return { inserted: true, event: structuredClone(event) };
    }

    async listEvents(sessionId: string): Promise<AcceptedDomainEvent[]> { return [...(this.#events.get(sessionId)?.values() ?? [])].sort((a, b) => a.serverSeq - b.serverSeq).map(item => structuredClone(item)); }

    async saveStudentIdentity(record: StudentIdentityPersistenceRecord): Promise<void> {
        const session = this.#identities.get(record.sessionId) ?? new Map<string, StudentIdentityPersistenceRecord>();
        session.set(record.participantId, structuredClone(record));
        this.#identities.set(record.sessionId, session);
    }
    async loadStudentIdentities(sessionId: string): Promise<StudentIdentityPersistenceRecord[]> { return [...(this.#identities.get(sessionId)?.values() ?? [])].map(item => structuredClone(item)); }
    async savePublicSubjectProjection(record: PublicSubjectProjectionRecord): Promise<void> { this.#publicSubjects.set(record.sessionId, structuredClone(record)); }
    async loadPublicSubjectProjection(sessionId: string): Promise<PublicSubjectProjectionRecord | null> { const value = this.#publicSubjects.get(sessionId); return value ? structuredClone(value) : null; }

    async saveSnapshot(snapshot: AppletStateSnapshot): Promise<void> {
        const key = this.snapshotKey(snapshot);
        const existing = this.#snapshots.get(key);
        if (existing && existing.revision > snapshot.revision) throw new Error('snapshot-revision-regression');
        if (existing && existing.revision === snapshot.revision) {
            if (comparableSnapshot(existing) !== comparableSnapshot(snapshot)) throw new Error('snapshot-revision-payload-mismatch');
            return;
        }
        this.#snapshots.set(key, structuredClone(snapshot));
    }
    async getLatestSnapshot(sessionId: string, activityId: string, appletInstanceId: string, scopeKey: string): Promise<AppletStateSnapshot | null> {
        const value = this.#snapshots.get(`${sessionId}|${activityId}|${appletInstanceId}|${scopeKey}`);
        return value ? structuredClone(value) : null;
    }
    async saveArtifact(artifact: LearningArtifact): Promise<void> {
        const revisions = this.#artifacts.get(artifact.artifactId) ?? new Map<number, LearningArtifact>();
        const existing = revisions.get(artifact.revision);
        if (existing && canonical(existing) !== canonical(artifact)) throw new Error('artifact-revision-immutable');
        if (existing) return;
        const latest = Math.max(0, ...revisions.keys());
        if (artifact.revision < latest) throw new Error('artifact-revision-regression');
        const latestArtifact = revisions.get(latest);
        if (latestArtifact && artifactContext(latestArtifact) !== artifactContext(artifact)) throw new Error('artifact-revision-context-mismatch');
        revisions.set(artifact.revision, structuredClone(artifact));
        this.#artifacts.set(artifact.artifactId, revisions);
    }
    async getArtifact(artifactId: string, revision?: number): Promise<LearningArtifact | null> {
        const revisions = this.#artifacts.get(artifactId);
        if (!revisions) return null;
        const selected = revision ?? Math.max(...revisions.keys());
        const value = revisions.get(selected);
        return value ? structuredClone(value) : null;
    }
    async saveSubmission(submission: Submission): Promise<void> {
        const existing = this.#submissions.get(submission.submissionId);
        if (existing) {
            if (canonical(existing) === canonical(submission)) return;
            if (submissionContext(existing) !== submissionContext(submission)) throw new Error('submission-authority-immutable');
            if (!submissionTransitionAllowed(existing.status, submission.status)) throw new Error('submission-state-regression');
            if (existing.status !== 'draft' && existing.status === submission.status) throw new Error('submission-state-immutable');
        }
        this.#submissions.set(submission.submissionId, structuredClone(submission));
    }
    async getSubmission(submissionId: string): Promise<Submission | null> { const value = this.#submissions.get(submissionId); return value ? structuredClone(value) : null; }
    async listSubmissions(sessionId: string, activityId?: string): Promise<Submission[]> {
        return [...this.#submissions.values()]
            .filter(value => value.sessionId === sessionId && (!activityId || value.activityId === activityId))
            .map(value => structuredClone(value));
    }
    async saveTransfer(transfer: ArtifactTransfer): Promise<void> {
        const existing = this.#transfers.get(transfer.transferId);
        if (existing) {
            if (canonical(existing) === canonical(transfer)) return;
            if (!isTransferTransitionAllowed(existing.status, transfer.status)) throw new Error('transfer-state-regression');
            if (existing.status === transfer.status) throw new Error('transfer-state-immutable');
        }
        this.#transfers.set(transfer.transferId, structuredClone(transfer));
    }
    async getTransfer(transferId: string): Promise<ArtifactTransfer | null> { const value = this.#transfers.get(transferId); return value ? structuredClone(value) : null; }
    private snapshotKey(snapshot: AppletStateSnapshot): string { return `${snapshot.sessionId}|${snapshot.activityId}|${snapshot.appletInstanceId}|${snapshot.scope.type}:${snapshot.scope.id}`; }
}

export function isTransferTransitionAllowed(from: ArtifactTransfer['status'], to: ArtifactTransfer['status']): boolean {
    const allowed: Record<ArtifactTransfer['status'], readonly ArtifactTransfer['status'][]> = {
        queued: ['queued', 'sent', 'failed'],
        sent: ['sent', 'received', 'failed'],
        received: ['received', 'opened', 'failed'],
        opened: ['opened', 'completed', 'failed'],
        completed: ['completed'],
        failed: ['failed'],
    };
    return allowed[from].includes(to);
}
/** Content-addressed lesson store used by Session pinning/restart recovery. */
export interface ImmutableLessonPackageStore {
    putResolvedPackage(reference: ResolvedLessonReference, sourcePath: string): Promise<ImmutableLessonPackageLocation>;
    resolveByFingerprint(packageFingerprint: string): Promise<ImmutableLessonPackageLocation | null>;
    verify(location: ImmutableLessonPackageLocation): Promise<boolean>;
}
