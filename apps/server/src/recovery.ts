import type { ClassroomSession, ControllerLease, SessionMembership, StageState } from '@classroom/contracts';
import type { IdentityDirectory, StudentClaimDirectory, StudentIdentityRecord } from '@classroom/server-identity';
import type { SessionPseudonymDirectory } from '@classroom/server-projections';
import type { PublicSubjectProjectionPersistenceStore, RuntimeRecoveryStorage, StudentClaimPersistenceStore, StudentIdentityPersistenceStore } from '@classroom/storage';
import type { PresentationPlaybackState, PresentationPlaybackStore } from '@classroom/presentation';
export interface RecoveryPersistencePorts {
    runtime: RuntimeRecoveryStorage;
    identities: StudentIdentityPersistenceStore;
    claims: StudentClaimPersistenceStore;
    pseudonyms: PublicSubjectProjectionPersistenceStore;
    presentation: PresentationPlaybackStore;
}
export interface RecoveryRuntimeTargets {
    identities: IdentityDirectory;
    claims: StudentClaimDirectory;
    pseudonyms: SessionPseudonymDirectory;
}
export interface RecoveredClassroomState {
    session: ClassroomSession;
    memberships: SessionMembership[];
    controllerLease: ControllerLease | null;
    stage: StageState | null;
    presentationPlayback: PresentationPlaybackState | null;
}
/**
 * Server restart 的单一恢复编排入口。FeaturePolicy 只从 ClassroomSession 恢复，
 * 防止同一状态在多个存储接口中形成两份真相。
 */
export class RecoveryCoordinator {
    constructor(private readonly persistence: RecoveryPersistencePorts, private readonly targets: RecoveryRuntimeTargets) { }
    async restore(sessionId: string): Promise<RecoveredClassroomState> {
        const session = await this.persistence.runtime.loadSession(sessionId);
        if (!session)
            throw new Error('recovery-session-not-found');
        const [memberships, lease, stage, identityRows, claimSnapshot, pseudonymRow, presentationPlayback] = await Promise.all([
            this.persistence.runtime.loadMemberships(sessionId),
            this.persistence.runtime.loadControllerLease(sessionId),
            this.persistence.runtime.loadStageState(sessionId),
            this.persistence.identities.loadStudentIdentities(sessionId),
            this.persistence.claims.loadStudentClaims(sessionId),
            this.persistence.pseudonyms.loadPublicSubjectProjection(sessionId),
            this.persistence.presentation.load(sessionId),
        ]);
        this.targets.claims.removeSession(sessionId);
        this.targets.identities.removeSession(sessionId);
        this.targets.pseudonyms.removeSession(sessionId);
        for (const row of identityRows) {
            const record: StudentIdentityRecord = { ...row };
            this.targets.identities.upsertStudent(record);
        }
        this.targets.pseudonyms.restore({ sessionId, participantToSubject: pseudonymRow?.participantToSubject ?? {} });
        this.targets.claims.restore({ sessionId, claims: claimSnapshot?.claims ?? [] });
        return { session, memberships, controllerLease: lease, stage, presentationPlayback };
    }
    async persistStudentClaims(sessionId: string): Promise<void> {
        const snapshot = this.targets.claims.snapshot(sessionId);
        await this.persistence.claims.saveStudentClaims(snapshot);
    }
}

