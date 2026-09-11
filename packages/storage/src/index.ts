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
    saveSubmission(submission: Submission): Promise<void>;
    saveTransfer(transfer: ArtifactTransfer): Promise<void>;
}
/** Content-addressed lesson store used by Session pinning/restart recovery. */
export interface ImmutableLessonPackageStore {
    putResolvedPackage(reference: ResolvedLessonReference, sourcePath: string): Promise<ImmutableLessonPackageLocation>;
    resolveByFingerprint(packageFingerprint: string): Promise<ImmutableLessonPackageLocation | null>;
    verify(location: ImmutableLessonPackageLocation): Promise<boolean>;
}

