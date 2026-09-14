import type {
    ActivityDefinition,
    AppletInstanceRef,
    AppletStateSnapshot,
    AuthenticatedConnectionContext,
    ClientAppletEvent,
    ClassroomSession,
    ConnectionPresence,
    ControllerLease,
    EventAck,
    JoinGrant,
    AnalyticsFeature,
    AnalyticsResult,
    AcceptedDomainEvent,
    LearningArtifact,
    JoinRequest,
    LiveStateFrame,
    ServerHello,
    StudentSelfProjection,
    Submission,
    StageState,
    TeacherStudentProjection,
} from '@classroom/contracts';
import {
    AppletEventRuntime,
    AuthorizationService,
    InMemoryClassroomAuthority,
    LearningResourceRuntime,
    type AppletEventAccessAuthority,
    type AppletEventSchemaRegistry,
    type CreateSessionInput,
    claimControllerLease,
    renewControllerLease,
    releaseControllerLease,
} from '@classroom/runtime';
import type { ClassroomStorage } from '@classroom/storage';

export interface ClassroomActivityProjection {
    sessionId: string;
    lessonId: string;
    lessonTitle?: string | null;
    activity: ActivityDefinition;
    applets: Array<{ instance: AppletInstanceRef; config: Record<string, unknown> }>;
}

export interface AuthenticatedClassroomRuntimeOptions {
    authority: InMemoryClassroomAuthority;
    storage: ClassroomStorage;
    resolveCurrentActivity: (session: ClassroomSession) => ClassroomActivityProjection | null;
    lessonEventRegistry: AppletEventSchemaRegistry;
    appletAccess: AppletEventAccessAuthority;
    resolveStudentSelf?: (session: ClassroomSession, participantId: string) => StudentSelfProjection | null;
    resolveTeacherStudent?: (session: ClassroomSession, participantId: string) => TeacherStudentProjection | null;
    serverBuild?: string;
    deploymentProfile?: ServerHello['deploymentProfile'];
    heartbeatIntervalMs?: number;
    idFactory?: () => string;
    analyticsProvider?: {
        provenance: AnalyticsResult['provider'];
        analyze(input: {
            sessionId: string;
            activityId: string;
            subject: { type: 'participant'; id: string };
            events: AcceptedDomainEvent[];
            snapshots: AppletStateSnapshot[];
            artifacts: LearningArtifact[];
            features?: AnalyticsFeature[];
        }): Promise<Pick<AnalyticsResult, 'classifications' | 'metrics' | 'recommendations'>>;
    };
}

export interface ClassroomJoinResult {
    grant: JoinGrant;
    self: StudentSelfProjection | null;
    currentActivity: ClassroomActivityProjection | null;
    snapshots: AppletStateSnapshot[];
}

export interface ClassroomSubmissionEvidence extends Record<string, unknown> {
    appletInstanceId: string;
    snapshot?: Record<string, unknown>;
    recordTokens?: unknown[];
    recordText?: string;
    operationSummary?: Record<string, unknown>;
    elapsedMs?: number;
    solved?: boolean;
    puzzleVersion?: string;
    eventRange?: Record<string, unknown>;
}

/**
 * Authenticated classroom product seam.
 *
 * The reference HTTP server intentionally does not instantiate this class yet;
 * it remains the transport-only, fail-closed vertical slice. This host owns the
 * server-authoritative join, current Activity, durable event, Snapshot and
 * Submission operations that a LAN adapter can expose without trusting browser
 * identity fields.
 */
export class AuthenticatedClassroomRuntime {
    readonly authority: InMemoryClassroomAuthority;
    readonly storage: ClassroomStorage;
    readonly authorization: AuthorizationService;
    private readonly options: AuthenticatedClassroomRuntimeOptions;
    private readonly eventRuntime: AppletEventRuntime;
    private readonly resourceRuntime: LearningResourceRuntime;
    private readonly leases = new Map<string, ControllerLease>();
    private readonly analyticsResults = new Map<string, AnalyticsResult>();

    constructor(options: AuthenticatedClassroomRuntimeOptions) {
        this.options = options;
        this.authority = options.authority;
        this.storage = options.storage;
        this.eventRuntime = new AppletEventRuntime(options.storage);
        this.authorization = new AuthorizationService({
            getFeaturePolicy: sessionId => this.authority.getSession(sessionId)?.featurePolicy ?? null,
            getControllerLease: sessionId => this.leases.get(sessionId) ?? null,
            isPublicSubjectValid: () => false,
            isParticipantInScope: (_sessionId, _activityId, participantId, scope) => scope.type === 'participant' && scope.id === participantId,
            areParticipantsPaired: () => false,
            canTransferArtifact: () => false,
            isActivityInSession: (sessionId, activityId) => activityId ? this.authority.isActivityInSession(sessionId, activityId) : false,
        });
        this.resourceRuntime = new LearningResourceRuntime(options.storage, this.authorization);
    }

    createSession(input: CreateSessionInput): ClassroomSession { return this.authority.createSession(input); }

    async join(request: JoinRequest, now?: number): Promise<ClassroomJoinResult> {
        const grant = this.authority.join(request, now);
        const membership = this.authority.getMembership(grant.membershipId);
        if (!membership) throw new Error('membership-not-created');
        await this.storage.saveMembership(membership);
        const currentActivity = this.currentActivity(grant.sessionId);
        const snapshots = currentActivity
            ? await Promise.all(currentActivity.applets.map(item => this.storage.getLatestSnapshot(grant.sessionId, currentActivity.activity.activityId, item.instance.appletInstanceId, `participant:${grant.participantId}`)))
            : [];
        return {
            grant,
            self: this.options.resolveStudentSelf?.(this.authority.getSession(grant.sessionId)!, grant.participantId) ?? null,
            currentActivity,
            snapshots: snapshots.filter((item): item is AppletStateSnapshot => item !== null),
        };
    }

    presence(sessionId: string): ConnectionPresence[] { return this.authority.listPresence(sessionId); }

    async currentStage(sessionId: string): Promise<StageState | null> {
        return this.storage.loadStageState(sessionId);
    }

    async controllerLease(sessionId: string): Promise<ControllerLease | null> {
        if (this.leases.has(sessionId)) return structuredClone(this.leases.get(sessionId)!);
        const persisted = await this.storage.loadControllerLease(sessionId);
        if (persisted) this.leases.set(sessionId, persisted);
        return persisted ? structuredClone(persisted) : null;
    }

    async restoreLease(sessionId: string): Promise<ControllerLease | null> {
        return this.controllerLease(sessionId);
    }

    async claimLease(context: AuthenticatedConnectionContext, expectedRevision = 0, ttlMs = 45_000): Promise<ControllerLease> {
        let current = await this.controllerLease(context.sessionId) ?? {
            leaseId: `lease:${context.sessionId}`,
            sessionId: context.sessionId,
            revision: 0,
            holderConnectionId: null,
            holderParticipantId: null,
            expiresAt: null,
        } satisfies ControllerLease;
        const holderOnline = current.holderConnectionId !== null && this.authority.listPresence(context.sessionId).some(item => item.connectionId === current.holderConnectionId && item.status === 'online');
        if (current.holderConnectionId !== null && current.holderParticipantId === context.participantId && !holderOnline) {
            current = { ...current, holderConnectionId: null, holderParticipantId: null, expiresAt: null };
        }
        const next = claimControllerLease(current, context, ttlMs, expectedRevision);
        this.leases.set(context.sessionId, next);
        await this.storage.saveControllerLease(next);
        return structuredClone(next);
    }

    async renewLease(context: AuthenticatedConnectionContext, expectedRevision: number, ttlMs = 45_000): Promise<ControllerLease> {
        const current = await this.controllerLease(context.sessionId);
        if (!current) throw new Error('controller-lease-missing');
        const next = renewControllerLease(current, context, ttlMs, expectedRevision);
        this.leases.set(context.sessionId, next);
        await this.storage.saveControllerLease(next);
        return structuredClone(next);
    }

    async releaseLease(context: AuthenticatedConnectionContext, expectedRevision: number): Promise<ControllerLease> {
        const current = await this.controllerLease(context.sessionId);
        if (!current) throw new Error('controller-lease-missing');
        const next = releaseControllerLease(current, context, expectedRevision);
        this.leases.set(context.sessionId, next);
        await this.storage.saveControllerLease(next);
        return structuredClone(next);
    }

    async setStage(context: AuthenticatedConnectionContext, contentType: string, payload: Record<string, unknown>, expectedRevision?: number): Promise<StageState> {
        await this.controllerLease(context.sessionId);
        const decision = this.authorization.authorize(context, 'stage.set', { stageContentType: contentType });
        if (!decision.allowed) throw new Error(decision.reason ?? 'stage-set-forbidden');
        const current = await this.currentStage(context.sessionId);
        if (expectedRevision !== undefined && expectedRevision !== (current?.revision ?? 0)) throw new Error('stale-revision');
        const next: StageState = { sessionId: context.sessionId, revision: (current?.revision ?? 0) + 1, contentType, payload: structuredClone(payload) };
        await this.storage.saveStageState(next);
        return next;
    }

    async setCurrentActivity(context: AuthenticatedConnectionContext, activityId: string, expectedRevision?: number): Promise<ClassroomActivityProjection> {
        const decision = this.authorization.authorize(context, 'activity.advance', { activityId });
        if (!decision.allowed) throw new Error(decision.reason ?? 'activity-advance-forbidden');
        this.authority.setCurrentActivity(context.sessionId, activityId, expectedRevision);
        const next = this.currentActivity(context.sessionId);
        if (!next) throw new Error('current-activity-not-found');
        return next;
    }

    async teacherStudents(sessionId: string): Promise<TeacherStudentProjection[]> {
        const session = this.authority.getSession(sessionId);
        if (!session) throw new Error('session-not-found');
        const memberships = this.authority.listPresence(sessionId);
        const participantIds = new Set(
            memberships.filter(item => item.status === 'online').map(item => item.participantId),
        );
        const allMemberships = await this.storage.loadMemberships(sessionId);
        for (const membership of allMemberships) if (membership.role === 'student' && membership.status === 'active') participantIds.add(membership.participantId);
        return [...participantIds]
            .filter(participantId => allMemberships.some(item => item.participantId === participantId && item.role === 'student'))
            .map(participantId => this.options.resolveTeacherStudent?.(session, participantId) ?? { participantId, displayName: participantId, seatNo: null });
    }

    async submissions(sessionId: string, activityId?: string): Promise<Submission[]> {
        return this.storage.listSubmissions(sessionId, activityId);
    }

    async analyzeStudent(context: AuthenticatedConnectionContext, participantId: string): Promise<AnalyticsResult> {
        if (!this.options.analyticsProvider) throw new Error('analytics-provider-unavailable');
        const decision = this.authorization.authorize(context, 'advice.send');
        if (!decision.allowed) throw new Error(decision.reason ?? 'analytics-forbidden');
        const activity = this.#requireActivity(context.sessionId);
        const memberships = await this.storage.loadMemberships(context.sessionId);
        if (!memberships.some(item => item.role === 'student' && item.participantId === participantId && item.status === 'active')) throw new Error('analytics-student-not-found');
        const events = (await this.storage.listEvents(context.sessionId)).filter(event => event.activityId === activity.activity.activityId && event.actor.participantId === participantId);
        const submissions = await this.storage.listSubmissions(context.sessionId, activity.activity.activityId);
        const artifacts = (await Promise.all(submissions
            .filter(item => item.submitterScope.type === 'participant' && item.submitterScope.id === participantId)
            .flatMap(item => item.artifacts)
            .map(item => this.storage.getArtifact(item.artifactId, item.revision))))
            .filter((item): item is LearningArtifact => item !== null);
        const result = await this.options.analyticsProvider.analyze({
            sessionId: context.sessionId,
            activityId: activity.activity.activityId,
            subject: { type: 'participant', id: participantId },
            events,
            snapshots: [],
            artifacts,
            features: [],
        });
        const analyticsResult: AnalyticsResult = {
            resultId: `analytics:${context.sessionId}:${participantId}:${Date.now()}`,
            sessionId: context.sessionId,
            activityId: activity.activity.activityId,
            subject: { type: 'participant', id: participantId },
            classifications: result.classifications,
            metrics: result.metrics,
            recommendations: result.recommendations,
            provider: this.options.analyticsProvider.provenance,
            createdAt: new Date().toISOString(),
        };
        this.analyticsResults.set(analyticsResult.resultId, structuredClone(analyticsResult));
        return structuredClone(analyticsResult);
    }

    async confirmAnalyticsRecommendation(context: AuthenticatedConnectionContext, resultId: string, recommendationId: string, expectedRevision?: number): Promise<{ result: AnalyticsResult; stage: StageState }> {
        const stored = this.analyticsResults.get(resultId);
        if (!stored || stored.sessionId !== context.sessionId) throw new Error('analytics-result-not-found');
        const recommendation = stored.recommendations.find(item => item.recommendationId === recommendationId);
        if (!recommendation || recommendation.status !== 'candidate') throw new Error('analytics-recommendation-not-confirmable');
        recommendation.status = 'confirmed';
        const evidence = structuredClone(recommendation.evidence);
        const artifactCount = evidence.filter(item => item.kind === 'artifact').length;
        const stage = await this.setStage(context, 'core:student-comparison', {
            recommendationId: recommendation.recommendationId,
            evidence,
            widget: { selector: 'selected-artifact', evidenceCount: evidence.length, artifactCount },
        }, expectedRevision);
        this.analyticsResults.set(resultId, structuredClone(stored));
        return { result: structuredClone(stored), stage };
    }

    connect(accessToken: string, connectionId?: string, deviceId?: string | null, now?: number): { context: AuthenticatedConnectionContext; hello: ServerHello } {
        const context = this.authority.connect(accessToken, connectionId, deviceId, now);
        const session = this.authority.getSession(context.sessionId);
        if (!session) throw new Error('session-not-found');
        return {
            context,
            hello: {
                protocolVersion: 1,
                runtimeApiVersion: 1,
                serverBuild: this.options.serverBuild ?? 'classroom-server-authenticated-dev',
                connectionId: context.connectionId,
                sessionId: context.sessionId,
                membershipId: context.membershipId,
                participantId: context.participantId,
                role: context.role,
                heartbeatIntervalMs: this.options.heartbeatIntervalMs ?? 5000,
                deploymentProfile: this.options.deploymentProfile ?? 'lan-http',
                featurePolicyRevision: session.featurePolicy.revision,
            },
        };
    }

    currentActivity(sessionId: string): ClassroomActivityProjection | null {
        const session = this.authority.getSession(sessionId);
        if (!session) throw new Error('session-not-found');
        const projection = this.options.resolveCurrentActivity(session);
        return projection ? structuredClone(projection) : null;
    }

    async acceptAppletEvent(context: AuthenticatedConnectionContext, input: ClientAppletEvent): Promise<EventAck> {
        const activity = this.#requireActivity(context.sessionId);
        const result = await this.eventRuntime.accept({
            connection: context,
            lessonId: activity.lessonId,
            activityId: activity.activity.activityId,
            registry: this.options.lessonEventRegistry,
            accessAuthority: this.options.appletAccess,
        }, input);
        return {
            clientEventId: input.clientEventId,
            accepted: true,
            eventId: result.event.eventId,
            serverSeq: result.event.serverSeq,
            duplicate: !result.inserted,
        };
    }

    async saveSnapshot(context: AuthenticatedConnectionContext, snapshot: AppletStateSnapshot): Promise<void> {
        const activity = this.#requireActivity(context.sessionId);
        if (snapshot.sessionId !== context.sessionId || snapshot.activityId !== activity.activity.activityId)
            throw new Error('snapshot-session-or-activity-mismatch');
        if (snapshot.scope.type !== 'participant' || snapshot.scope.id !== context.participantId)
            throw new Error('snapshot-scope-forbidden');
        await this.eventRuntime.snapshot(snapshot);
    }

    async publishLiveState(context: AuthenticatedConnectionContext, frame: LiveStateFrame): Promise<LiveStateFrame> {
        const activity = this.#requireActivity(context.sessionId);
        if (frame.sessionId !== context.sessionId || frame.activityId !== activity.activity.activityId)
            throw new Error('live-state-session-or-activity-mismatch');
        if (frame.scope.type !== 'participant' || frame.scope.id !== context.participantId)
            throw new Error('live-state-scope-forbidden');
        if (frame.appletInstanceId !== activity.applets.find(item => item.instance.appletInstanceId === frame.appletInstanceId)?.instance.appletInstanceId)
            throw new Error('live-state-applet-forbidden');
        return structuredClone(frame);
    }

    async submit(context: AuthenticatedConnectionContext, submission: Submission, evidence?: ClassroomSubmissionEvidence): Promise<Submission> {
        const activity = this.#requireActivity(context.sessionId);
        const serverOwned = {
            ...submission,
            sessionId: context.sessionId,
            activityId: activity.activity.activityId,
            submitterScope: { type: 'participant' as const, id: context.participantId },
            submittedBy: context.participantId,
            status: 'submitted' as const,
        };
        if (evidence) {
            if (evidence.appletInstanceId !== activity.applets.find(item => item.instance.appletInstanceId === evidence.appletInstanceId)?.instance.appletInstanceId)
                throw new Error('submission-applet-forbidden');
            const artifact = await this.resourceRuntime.saveArtifact(context, {
                artifactId: `artifact:${submission.submissionId}:evidence`,
                sessionId: context.sessionId,
                activityId: activity.activity.activityId,
                ownerScope: { type: 'participant', id: context.participantId },
                artifactType: 'student-submission-evidence',
                revision: 1,
                payload: structuredClone(evidence),
                createdAt: new Date().toISOString(),
            });
            serverOwned.artifacts = [{ artifactId: artifact.artifactId, revision: artifact.revision }];
        }
        return this.resourceRuntime.submitSubmission(context, serverOwned);
    }

    #requireActivity(sessionId: string): ClassroomActivityProjection {
        const activity = this.currentActivity(sessionId);
        if (!activity) throw new Error('current-activity-not-found');
        return activity;
    }
}
