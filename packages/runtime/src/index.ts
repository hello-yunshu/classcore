import type { AcceptedDomainEvent, AppletManifest, AuthenticatedConnectionContext, ClassroomSession, ClientAppletEvent, ClientCommandEnvelope, ControllerLease, JoinGrant, JoinRequest, ProtocolError, SessionFeaturePolicy, SessionMembership, StageState, StateScopeRef, ConnectionPresence, } from '@classroom/contracts';
export interface RuntimeCommandSchemaRegistry {
    has(type: string): boolean;
    validatePayload(type: string, payload: Record<string, unknown>): {
        valid: boolean;
        message?: string;
    };
}
export function validateClientCommand<T extends Record<string, unknown>>(registry: RuntimeCommandSchemaRegistry, input: ClientCommandEnvelope<T>): void {
    if (!registry.has(input.type))
        throw new Error('unknown-command-type');
    const result = registry.validatePayload(input.type, input.payload);
    if (!result.valid)
        throw new Error(`invalid-command-payload${result.message ? `: ${result.message}` : ''}`);
}
export type RuntimeAction = 'session.start' | 'session.pause' | 'session.resume' | 'session.end' | 'activity.activate' | 'activity.advance' | 'activity.pause' | 'activity.resume' | 'activity.close' | 'activity.reopen' | 'stage.set' | 'presentation.control' | 'submission.submit' | 'artifact.transfer' | 'advice.send' | 'live.subscribe' | 'live.publish';
export interface AuthorizationResource {
    activityId?: string | null;
    subject?: StateScopeRef | null;
    publicSubjectId?: string | null;
    submitterScope?: StateScopeRef | null;
    artifactOwnerScope?: StateScopeRef | null;
    recipientScope?: StateScopeRef | null;
    stageContentType?: string | null;
}
export interface AuthorizationDecision {
    allowed: boolean;
    reason?: string;
}
/**
 * Authoritative facts are resolved by the server, never supplied by a browser/app client.
 * Production implementations should back these calls with session/membership/workgroup/
 * projection/lease stores (or a coherent cached read model of those stores).
 */
export interface AuthorizationAuthority {
    getFeaturePolicy(sessionId: string): SessionFeaturePolicy | null;
    getControllerLease(sessionId: string): ControllerLease | null;
    isPublicSubjectValid(sessionId: string, publicSubjectId: string): boolean;
    isParticipantInScope(sessionId: string, activityId: string | null, participantId: string, scope: StateScopeRef): boolean;
    areParticipantsPaired(sessionId: string, activityId: string | null, leftParticipantId: string, rightParticipantId: string): boolean;
    canTransferArtifact(sessionId: string, activityId: string | null, senderParticipantId: string, ownerScope: StateScopeRef, recipientScope: StateScopeRef): boolean;
    isActivityInSession?(sessionId: string, activityId: string): boolean;
    getRequiredFeatureForStageContent?(contentType: string): string | null;
}
const CONTROL_ACTIONS = new Set<RuntimeAction>([
    'session.start', 'session.pause', 'session.resume', 'session.end',
    'activity.activate', 'activity.advance', 'activity.pause', 'activity.resume', 'activity.close', 'activity.reopen',
    'stage.set', 'presentation.control', 'advice.send'
]);
export function requiredFeatureForAction(action: RuntimeAction, resource?: AuthorizationResource, stageResolver?: (contentType: string) => string | null): string | null {
    if (action === 'presentation.control')
        return 'presentationRuntime';
    if (action === 'artifact.transfer')
        return 'artifactExchange';
    if (action === 'advice.send')
        return 'intelligence';
    if (action === 'live.subscribe' || action === 'live.publish')
        return 'liveMirroring';
    if (action === 'stage.set') {
        const type = resource?.stageContentType ?? '';
        if (stageResolver && type) {
            const custom = stageResolver(type);
            if (custom)
                return custom;
        }
        if (type === 'core:scene')
            return 'sceneRuntime';
        if (type.startsWith('presentation:'))
            return 'presentationRuntime';
        if (type === 'core:student-live-view' || type === 'core:student-comparison')
            return 'liveMirroring';
    }
    return null;
}
export function hasValidControllerLease(lease: ControllerLease | undefined | null, ctx: AuthenticatedConnectionContext, now = Date.now()): boolean {
    return !!lease && lease.sessionId === ctx.sessionId && lease.holderConnectionId === ctx.connectionId && lease.holderParticipantId === ctx.participantId && lease.expiresAt !== null && lease.expiresAt > now;
}
export class AuthorizationService {
    constructor(private readonly authority: AuthorizationAuthority) { }
    isActivityInSession(sessionId: string, activityId: string): boolean {
        return this.authority.isActivityInSession?.(sessionId, activityId) ?? true;
    }
    authorize(connection: AuthenticatedConnectionContext, action: RuntimeAction, resource: AuthorizationResource = {}, now = Date.now()): AuthorizationDecision {
        const policy = this.authority.getFeaturePolicy(connection.sessionId);
        if (action === 'stage.set' && !resource.stageContentType)
            return { allowed: false, reason: 'stage-content-type-required' };
        if (action === 'submission.submit' && !resource.submitterScope)
            return { allowed: false, reason: 'submission-scope-required' };
        if (action === 'artifact.transfer' && (!resource.artifactOwnerScope || !resource.recipientScope))
            return { allowed: false, reason: 'artifact-transfer-context-required' };
        const requiredFeature = requiredFeatureForAction(action, resource, this.authority.getRequiredFeatureForStageContent?.bind(this.authority));
        if (requiredFeature) {
            if (!policy)
                return { allowed: false, reason: 'feature-policy-missing' };
            if (policy.features[requiredFeature] !== true)
                return { allowed: false, reason: 'feature-disabled' };
        }
        if (connection.role === 'teacher') {
            if (CONTROL_ACTIONS.has(action)) {
                const lease = this.authority.getControllerLease(connection.sessionId);
                return hasValidControllerLease(lease, connection, now) ? { allowed: true } : { allowed: false, reason: 'controller-lease-required' };
            }
            return { allowed: true };
        }
        if (connection.role === 'observer') {
            if (policy?.features.observer !== true)
                return { allowed: false, reason: 'observer-feature-disabled' };
            if (action !== 'live.subscribe')
                return { allowed: false, reason: 'observer-read-only' };
            const id = resource.publicSubjectId;
            return id && this.authority.isPublicSubjectValid(connection.sessionId, id)
                ? { allowed: true } : { allowed: false, reason: 'public-projection-required' };
        }
        if (connection.role === 'display')
            return { allowed: false, reason: 'display-read-only' };
        if (connection.role === 'student') {
            const activityId = resource.activityId ?? null;
            if (action === 'live.publish') {
                const subject = resource.subject;
                if (!activityId || !subject)
                    return { allowed: false, reason: 'live-publish-context-required' };
                return this.authority.isParticipantInScope(connection.sessionId, activityId, connection.participantId, subject)
                    ? { allowed: true } : { allowed: false, reason: 'live-publish-scope-forbidden' };
            }
            if (action === 'live.subscribe') {
                const subject = resource.subject;
                if (!subject)
                    return { allowed: false, reason: 'student-subject-scope' };
                if (subject.type === 'participant' && subject.id === connection.participantId)
                    return { allowed: true };
                if (subject.type === 'participant' && this.authority.areParticipantsPaired(connection.sessionId, activityId, connection.participantId, subject.id))
                    return { allowed: true };
                if (this.authority.isParticipantInScope(connection.sessionId, activityId, connection.participantId, subject))
                    return { allowed: true };
                return { allowed: false, reason: 'student-subject-scope' };
            }
            if (action === 'submission.submit') {
                const scope = resource.submitterScope;
                if (!scope)
                    return { allowed: false, reason: 'submission-scope-required' };
                return this.authority.isParticipantInScope(connection.sessionId, activityId, connection.participantId, scope)
                    ? { allowed: true } : { allowed: false, reason: 'submission-scope-forbidden' };
            }
            if (action === 'artifact.transfer') {
                if (!resource.artifactOwnerScope || !resource.recipientScope)
                    return { allowed: false, reason: 'artifact-transfer-context-required' };
                return this.authority.canTransferArtifact(connection.sessionId, activityId, connection.participantId, resource.artifactOwnerScope, resource.recipientScope)
                    ? { allowed: true } : { allowed: false, reason: 'artifact-transfer-forbidden' };
            }
        }
        return { allowed: false, reason: 'action-not-permitted' };
    }
}
export function nextSessionState(current: string, transition: string): string {
    const t: Record<string, Record<string, string>> = { created: { 'system.session.ready': 'ready' }, ready: { 'session.start': 'running' }, running: { 'session.pause': 'paused', 'session.end': 'ended' }, paused: { 'session.resume': 'running', 'session.end': 'ended' }, ended: {} };
    const next = t[current]?.[transition];
    if (!next)
        throw new Error(`Invalid session transition: ${current} + ${transition}`);
    return next;
}
export function nextActivityState(current: string, transition: string): string {
    const t: Record<string, Record<string, string>> = { inactive: { 'activity.activate': 'active' }, active: { 'activity.pause': 'paused', 'activity.close': 'closed' }, paused: { 'activity.resume': 'active', 'activity.close': 'closed' }, closed: { 'activity.reopen': 'active' } };
    const next = t[current]?.[transition];
    if (!next)
        throw new Error(`Invalid activity transition: ${current} + ${transition}`);
    return next;
}
export function resolveNextActivity(activityIds: string[], currentActivityId: string | null): string | null {
    if (currentActivityId === null)
        return activityIds[0] ?? null;
    const i = activityIds.indexOf(currentActivityId);
    if (i < 0)
        throw new Error(`Unknown current activity: ${currentActivityId}`);
    return activityIds[i + 1] ?? null;
}
export function claimControllerLease(current: ControllerLease, connection: AuthenticatedConnectionContext, ttlMs: number, expectedRevision: number, now = Date.now()): ControllerLease {
    if (connection.role !== 'teacher')
        throw new Error('teacher-required');
    if (current.revision !== expectedRevision)
        throw new Error('stale-revision');
    const held = current.holderConnectionId !== null && current.expiresAt !== null && current.expiresAt > now;
    if (held && current.holderConnectionId !== connection.connectionId)
        throw new Error('lease-held');
    return { ...current, revision: current.revision + 1, holderConnectionId: connection.connectionId, holderParticipantId: connection.participantId, expiresAt: now + ttlMs };
}
export function renewControllerLease(current: ControllerLease, connection: AuthenticatedConnectionContext, ttlMs: number, expectedRevision: number, now = Date.now()): ControllerLease {
    if (connection.role !== 'teacher')
        throw new Error('teacher-required');
    if (current.revision !== expectedRevision)
        throw new Error('stale-revision');
    if (current.holderConnectionId !== connection.connectionId || current.holderParticipantId !== connection.participantId)
        throw new Error('not-lease-holder');
    if (current.expiresAt === null || current.expiresAt <= now)
        throw new Error('lease-expired');
    return { ...current, revision: current.revision + 1, expiresAt: now + ttlMs };
}
export function takeoverExpiredControllerLease(current: ControllerLease, connection: AuthenticatedConnectionContext, ttlMs: number, expectedRevision: number, now = Date.now()): ControllerLease {
    if (connection.role !== 'teacher')
        throw new Error('teacher-required');
    if (current.revision !== expectedRevision)
        throw new Error('stale-revision');
    const active = current.holderConnectionId !== null && current.expiresAt !== null && current.expiresAt > now;
    if (active)
        throw new Error('lease-held');
    return { ...current, revision: current.revision + 1, holderConnectionId: connection.connectionId, holderParticipantId: connection.participantId, expiresAt: now + ttlMs };
}
export function releaseControllerLease(current: ControllerLease, connection: AuthenticatedConnectionContext, expectedRevision: number): ControllerLease {
    if (connection.role !== 'teacher')
        throw new Error('teacher-required');
    if (current.revision !== expectedRevision)
        throw new Error('stale-revision');
    if (current.holderConnectionId !== connection.connectionId || current.holderParticipantId !== connection.participantId)
        throw new Error('not-lease-holder');
    return { ...current, revision: current.revision + 1, holderConnectionId: null, holderParticipantId: null, expiresAt: null };
}
export interface AppletEventInstancePolicy {
    appletTypeId: string;
    eventSchemaVersion: number;
    emittedEventTypes: Set<string>;
}
export interface AppletEventSchemaRegistry {
    getInstancePolicy(appletInstanceId: string): AppletEventInstancePolicy | null;
    validatePayload(appletTypeId: string, eventSchemaVersion: number, eventType: string, payload: Record<string, unknown>): {
        valid: boolean;
        message?: string;
    };
}
export interface AppletEventAccessAuthority {
    getAccessMode(sessionId: string, activityId: string | null, participantId: string, appletInstanceId: string): 'interactive' | 'monitor' | 'mirror-readonly' | 'display-readonly' | null;
}
export interface EventAcceptanceContext {
    connection: AuthenticatedConnectionContext;
    lessonId?: string | null;
    activityId?: string | null;
    registry: AppletEventSchemaRegistry;
    accessAuthority: AppletEventAccessAuthority;
}
export function clientEventIdempotencyKey(connection: AuthenticatedConnectionContext, input: ClientAppletEvent): string {
    return JSON.stringify([connection.sessionId, connection.participantId, input.appletInstanceId, input.clientEventId]);
}
export type AcceptedEventDraft<T extends Record<string, unknown> = Record<string, unknown>> = Omit<AcceptedDomainEvent<T>, 'eventId' | 'serverSeq' | 'serverReceivedAt'>;
export function prepareClientAppletEvent<T extends Record<string, unknown> = Record<string, unknown>>(ctx: EventAcceptanceContext, input: ClientAppletEvent<T>): AcceptedEventDraft<T> {
    if (ctx.connection.role === 'observer' || ctx.connection.role === 'display')
        throw new Error('applet-event-read-only');
    const activityId = ctx.activityId ?? null;
    const accessMode = ctx.accessAuthority.getAccessMode(ctx.connection.sessionId, activityId, ctx.connection.participantId, input.appletInstanceId);
    if (accessMode !== 'interactive')
        throw new Error('applet-event-read-only');
    const policy = ctx.registry.getInstancePolicy(input.appletInstanceId);
    if (!policy)
        throw new Error('forbidden-applet-instance');
    if (input.appletEventSchemaVersion !== policy.eventSchemaVersion)
        throw new Error('event-schema-version-mismatch');
    if (!policy.emittedEventTypes.has(input.type))
        throw new Error('forbidden-event-type');
    const result = ctx.registry.validatePayload(policy.appletTypeId, policy.eventSchemaVersion, input.type, input.payload);
    if (!result.valid)
        throw new Error(`invalid-event-payload${result.message ? `: ${result.message}` : ''}`);
    return {
        eventEnvelopeVersion: 1,
        appletEventSchemaVersion: input.appletEventSchemaVersion,
        sessionId: ctx.connection.sessionId,
        lessonId: ctx.lessonId ?? null,
        activityId: ctx.activityId ?? null,
        actor: { role: ctx.connection.role, participantId: ctx.connection.participantId },
        appletInstanceId: input.appletInstanceId,
        type: input.type,
        payload: input.payload,
        origin: 'client',
        clientStream: { streamId: input.streamId, streamSeq: input.streamSeq, clientMonotonicTime: input.clientMonotonicTime ?? null },
    };
}
export class StageStore {
    #state: StageState;
    constructor(sessionId: string) { this.#state = { sessionId, revision: 0, contentType: 'core:blank', payload: {} }; }
    get(): StageState { return structuredClone(this.#state); }
    set(contentType: string, payload: Record<string, unknown>, expectedRevision?: number | null): StageState {
        if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== this.#state.revision)
            throw new Error('stale-revision');
        if (!/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(contentType))
            throw new Error('invalid-content-type');
        this.#state = { sessionId: this.#state.sessionId, revision: this.#state.revision + 1, contentType, payload };
        return this.get();
    }
}
export function protocolError(code: ProtocolError['code'], message: string, retryable = false, details: Record<string, unknown> = {}): ProtocolError { return { code, message, retryable, details }; }
export interface AppletMountCompatibility {
    compatible: boolean;
    missingCapabilities: string[];
    reason?: string;
}
export function checkAppletMountCompatibility(manifest: AppletManifest, availablePlatformCapabilities: Set<string>, hostApiVersion = 1): AppletMountCompatibility {
    if (manifest.hostApiVersion !== hostApiVersion)
        return { compatible: false, missingCapabilities: [], reason: 'host-api-version-mismatch' };
    const missing = (manifest.requiredPlatformCapabilities ?? []).filter(c => !availablePlatformCapabilities.has(c));
    return missing.length ? { compatible: false, missingCapabilities: missing, reason: 'platform-capability-missing' } : { compatible: true, missingCapabilities: [] };
}

export interface SessionCredentialRecord {
    sessionLocator: string;
    role: 'student' | 'teacher' | 'observer' | 'display';
    credentialType: string;
    credentialValue: string;
    participantId: string;
    expiresAt?: number | null;
}

export interface CreateSessionInput {
    session: ClassroomSession;
    sessionLocator?: string;
    credentials: SessionCredentialRecord[];
}

/** Minimal authenticated classroom authority. It is deliberately credential-based and does not trust browser identity fields. */
export class InMemoryClassroomAuthority {
    #sessions = new Map<string, ClassroomSession>();
    #locators = new Map<string, string>();
    #credentials = new Map<string, SessionCredentialRecord>();
    #memberships = new Map<string, SessionMembership>();
    #tokens = new Map<string, JoinGrant>();
    #presence = new Map<string, ConnectionPresence>();
    constructor(private readonly idFactory: () => string = () => globalThis.crypto.randomUUID()) {}

    createSession(input: CreateSessionInput): ClassroomSession {
        if (this.#sessions.has(input.session.sessionId)) throw new Error('session-already-exists');
        this.#sessions.set(input.session.sessionId, structuredClone(input.session));
        this.#locators.set(input.sessionLocator ?? input.session.sessionId, input.session.sessionId);
        for (const credential of input.credentials) {
            const key = this.credentialKey(credential.sessionLocator, credential.role, credential.credentialType, credential.credentialValue);
            if (this.#credentials.has(key)) throw new Error('duplicate-session-credential');
            this.#credentials.set(key, structuredClone(credential));
        }
        return structuredClone(input.session);
    }

    transitionSession(sessionId: string, transition: string): ClassroomSession {
        const current = this.#sessions.get(sessionId);
        if (!current) throw new Error('session-not-found');
        const next = nextSessionState(current.status, transition);
        const updated = { ...current, status: next as ClassroomSession['status'], revision: current.revision + 1 };
        this.#sessions.set(sessionId, updated);
        return structuredClone(updated);
    }

    getSession(sessionId: string): ClassroomSession | null {
        const session = this.#sessions.get(sessionId);
        return session ? structuredClone(session) : null;
    }

    isActivityInSession(sessionId: string, activityId: string): boolean {
        return this.#sessions.get(sessionId)?.currentActivityId === activityId;
    }

    join(request: JoinRequest, now = Date.now()): JoinGrant {
        const sessionId = this.#locators.get(request.sessionLocator) ?? request.sessionLocator;
        const session = [...this.#sessions.values()].find(item => item.sessionId === sessionId || item.lesson.lessonId === request.sessionLocator);
        if (!session) throw new Error('session-not-found');
        if (session.status === 'ended') throw new Error('session-ended');
        const credential = request.credential;
        const record = this.#credentials.get(this.credentialKey(request.sessionLocator, request.requestedRole, credential.type, credential.value));
        if (!record || (record.expiresAt != null && record.expiresAt <= now)) throw new Error('credential-invalid');
        if (record.participantId.startsWith('student:') && request.participantHint && record.participantId !== request.participantHint && `student:${request.participantHint}` !== record.participantId)
            throw new Error('participant-hint-mismatch');
        const existing = [...this.#memberships.values()].find(item => item.sessionId === session.sessionId && item.participantId === record.participantId && item.status === 'active');
        const previous = existing ? [...this.#tokens.values()].find(item => item.membershipId === existing.membershipId) : undefined;
        if (previous && Date.parse(previous.expiresAt) > now) return structuredClone(previous);
        const membership: SessionMembership = existing ?? {
            membershipId: `membership:${this.idFactory()}`,
            sessionId: session.sessionId,
            participantId: record.participantId,
            role: record.role,
            status: 'active',
            joinedAt: new Date(now).toISOString(),
            expiresAt: null,
        };
        const grant: JoinGrant = { membershipId: membership.membershipId, sessionId: session.sessionId, participantId: record.participantId, role: record.role, accessToken: `access:${this.idFactory()}`, expiresAt: new Date(now + 8 * 60 * 60 * 1000).toISOString() };
        this.#memberships.set(membership.membershipId, membership);
        this.#tokens.set(grant.accessToken, grant);
        return structuredClone(grant);
    }

    authenticate(accessToken: string, now = Date.now()): AuthenticatedConnectionContext {
        const grant = this.#tokens.get(accessToken);
        if (!grant || Date.parse(grant.expiresAt) <= now) throw new Error('access-token-invalid');
        const membership = this.#memberships.get(grant.membershipId);
        if (!membership || membership.status !== 'active') throw new Error('membership-required');
        return { connectionId: '', sessionId: grant.sessionId, membershipId: grant.membershipId, participantId: grant.participantId, role: grant.role };
    }

    connect(accessToken: string, connectionId = `connection:${this.idFactory()}`, deviceId: string | null = null, now = Date.now()): AuthenticatedConnectionContext {
        const context = this.authenticate(accessToken, now);
        const existing = [...this.#presence.values()].find(item => item.membershipId === context.membershipId && item.status === 'online');
        if (existing) this.#presence.delete(existing.connectionId);
        this.#presence.set(connectionId, { connectionId, sessionId: context.sessionId, membershipId: context.membershipId, participantId: context.participantId, status: 'online', deviceId, connectedAt: new Date(now).toISOString(), lastSeenAt: new Date(now).toISOString() });
        return { ...context, connectionId };
    }

    heartbeat(connectionId: string, now = Date.now()): ConnectionPresence {
        const current = this.#presence.get(connectionId);
        if (!current || current.status !== 'online') throw new Error('presence-offline');
        const updated = { ...current, lastSeenAt: new Date(now).toISOString() };
        this.#presence.set(connectionId, updated);
        return structuredClone(updated);
    }

    disconnect(connectionId: string, now = Date.now()): ConnectionPresence {
        const current = this.#presence.get(connectionId);
        if (!current) throw new Error('connection-not-found');
        const updated = { ...current, status: 'offline' as const, lastSeenAt: new Date(now).toISOString() };
        this.#presence.set(connectionId, updated);
        return structuredClone(updated);
    }

    listPresence(sessionId: string): ConnectionPresence[] { return [...this.#presence.values()].filter(item => item.sessionId === sessionId).map(item => structuredClone(item)); }
    revokeMembership(membershipId: string): void {
        const membership = this.#memberships.get(membershipId);
        if (!membership) throw new Error('membership-not-found');
        this.#memberships.set(membershipId, { ...membership, status: 'revoked' });
        for (const [token, grant] of this.#tokens) if (grant.membershipId === membershipId) this.#tokens.delete(token);
    }

    private credentialKey(locator: string, role: string, type: string, value: string): string { return JSON.stringify([locator, role, type, value]); }
}

export interface DurableEventPort {
    acceptClientEventAtomically<T extends Record<string, unknown>>(idempotencyKey: string, event: Omit<AcceptedDomainEvent<T>, 'eventId' | 'serverSeq' | 'serverReceivedAt'>): Promise<{ inserted: boolean; event: AcceptedDomainEvent<T> }>;
}
export interface AppletRuntimePorts extends DurableEventPort {
    saveSnapshot(snapshot: import('@classroom/contracts').AppletStateSnapshot): Promise<void>;
    saveArtifact(artifact: import('@classroom/contracts').LearningArtifact): Promise<void>;
    saveSubmission(submission: import('@classroom/contracts').Submission): Promise<void>;
    saveTransfer(transfer: import('@classroom/contracts').ArtifactTransfer): Promise<void>;
    getArtifact(artifactId: string, revision?: number): Promise<import('@classroom/contracts').LearningArtifact | null>;
    getSubmission?(submissionId: string): Promise<import('@classroom/contracts').Submission | null>;
}

/** Wires Applet intent to validation, durable event persistence and snapshot/artifact operations. */
export class AppletEventRuntime {
    constructor(private readonly ports: AppletRuntimePorts) {}
    async accept<T extends Record<string, unknown>>(context: EventAcceptanceContext, input: ClientAppletEvent<T>): Promise<{ inserted: boolean; event: AcceptedDomainEvent<T> }> {
        const draft = prepareClientAppletEvent(context, input);
        return this.ports.acceptClientEventAtomically(clientEventIdempotencyKey(context.connection, input), draft);
    }
    async snapshot(snapshot: import('@classroom/contracts').AppletStateSnapshot): Promise<void> { await this.ports.saveSnapshot(snapshot); }
}

export class LearningResourceRuntime {
    constructor(private readonly ports: Pick<AppletRuntimePorts, 'saveArtifact' | 'saveSubmission' | 'saveTransfer' | 'getArtifact'> & Partial<Pick<AppletRuntimePorts, 'getSubmission'>>, private readonly authorization: AuthorizationService, private readonly clock: () => string = () => new Date().toISOString()) {}
    async saveArtifact(connection: AuthenticatedConnectionContext, artifact: import('@classroom/contracts').LearningArtifact): Promise<import('@classroom/contracts').LearningArtifact> {
        this.assertSessionAndActivity(connection, artifact.sessionId, artifact.activityId);
        const decision = this.authorization.authorize(connection, 'submission.submit', { activityId: artifact.activityId, submitterScope: artifact.ownerScope });
        if (!decision.allowed) throw new Error(decision.reason ?? 'artifact-forbidden');
        const next = { ...artifact, sessionId: connection.sessionId, createdAt: this.clock() };
        await this.ports.saveArtifact(next);
        return structuredClone(next);
    }
    async createSubmissionDraft(connection: AuthenticatedConnectionContext, submission: import('@classroom/contracts').Submission): Promise<import('@classroom/contracts').Submission> {
        this.assertSessionAndActivity(connection, submission.sessionId, submission.activityId);
        const decision = this.authorization.authorize(connection, 'submission.submit', { activityId: submission.activityId, submitterScope: submission.submitterScope });
        if (!decision.allowed) throw new Error(decision.reason ?? 'submission-forbidden');
        const existing = await this.ports.getSubmission?.(submission.submissionId);
        if (existing && existing.submittedBy !== connection.participantId) throw new Error('submission-owner-immutable');
        const next = { ...submission, sessionId: connection.sessionId, submittedBy: existing?.submittedBy ?? connection.participantId, status: 'draft' as const, submittedAt: null };
        await this.ports.saveSubmission(next);
        return structuredClone(next);
    }
    async submitSubmission(connection: AuthenticatedConnectionContext, submission: import('@classroom/contracts').Submission): Promise<import('@classroom/contracts').Submission> {
        this.assertSessionAndActivity(connection, submission.sessionId, submission.activityId);
        const decision = this.authorization.authorize(connection, 'submission.submit', { activityId: submission.activityId, submitterScope: submission.submitterScope });
        if (!decision.allowed) throw new Error(decision.reason ?? 'submission-forbidden');
        if (submission.status !== 'submitted') throw new Error('submission-must-be-submitted');
        const existing = await this.ports.getSubmission?.(submission.submissionId);
        if (existing?.status === 'accepted') throw new Error('submission-state-regression');
        if (existing && existing.submittedBy !== connection.participantId) throw new Error('submission-owner-immutable');
        const next = { ...submission, sessionId: connection.sessionId, submittedBy: existing?.submittedBy ?? connection.participantId, submittedAt: existing?.submittedAt ?? this.clock() };
        await this.ports.saveSubmission(next);
        return structuredClone(next);
    }
    /** Backward-compatible name for the explicit draft -> submitted transition. */
    async submit(connection: AuthenticatedConnectionContext, submission: import('@classroom/contracts').Submission): Promise<import('@classroom/contracts').Submission> {
        return this.submitSubmission(connection, submission);
    }
    async acceptSubmission(connection: AuthenticatedConnectionContext, submission: import('@classroom/contracts').Submission): Promise<import('@classroom/contracts').Submission> {
        this.assertSessionAndActivity(connection, submission.sessionId, submission.activityId);
        if (connection.role !== 'teacher') throw new Error('teacher-required');
        const existing = await this.ports.getSubmission?.(submission.submissionId);
        if (!existing) throw new Error('submission-not-found');
        if (existing.sessionId !== connection.sessionId || existing.activityId !== submission.activityId) throw new Error('submission-session-mismatch');
        if (existing.status === 'draft') throw new Error('submission-state-regression');
        const next = { ...existing, status: 'accepted' as const };
        await this.ports.saveSubmission(next);
        return structuredClone(next);
    }
    async transfer(connection: AuthenticatedConnectionContext, transfer: import('@classroom/contracts').ArtifactTransfer, ownerScope: StateScopeRef): Promise<import('@classroom/contracts').ArtifactTransfer> {
        this.assertSessionAndActivity(connection, transfer.sessionId, transfer.activityId);
        const decision = this.authorization.authorize(connection, 'artifact.transfer', { activityId: transfer.activityId, artifactOwnerScope: ownerScope, recipientScope: transfer.recipientScope });
        if (!decision.allowed) throw new Error(decision.reason ?? 'transfer-forbidden');
        const artifact = await this.ports.getArtifact(transfer.artifact.artifactId, transfer.artifact.revision);
        if (!artifact) throw new Error('artifact-not-found');
        if (artifact.sessionId !== connection.sessionId || artifact.activityId !== transfer.activityId) throw new Error('artifact-session-mismatch');
        if (JSON.stringify(artifact.ownerScope) !== JSON.stringify(ownerScope)) throw new Error('artifact-owner-scope-mismatch');
        const next = { ...transfer, sessionId: connection.sessionId, senderId: connection.participantId, createdAt: transfer.createdAt || this.clock(), updatedAt: this.clock() };
        await this.ports.saveTransfer(next);
        return structuredClone(next);
    }
    private assertSessionAndActivity(connection: AuthenticatedConnectionContext, sessionId: string, activityId: string): void {
        if (sessionId !== connection.sessionId) throw new Error('session-mismatch');
        if (!this.authorization.isActivityInSession(connection.sessionId, activityId)) throw new Error('activity-session-mismatch');
    }
}
