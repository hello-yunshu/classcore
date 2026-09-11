import type { AcceptedDomainEvent, AppletManifest, AuthenticatedConnectionContext, ClientAppletEvent, ClientCommandEnvelope, ControllerLease, ProtocolError, SessionFeaturePolicy, StageState, StateScopeRef, } from '@classroom/contracts';
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

