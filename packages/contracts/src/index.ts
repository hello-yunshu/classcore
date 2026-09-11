export { PRIVATE_IDENTITY_FIELD_NAMES, PRIVATE_PARTICIPANT_REFERENCE_PREFIXES, isPrivateIdentityFieldName, isPrivateParticipantReference, findPrivateIdentityViolations } from './private-identity-policy.generated.js';
export type { PrivateIdentityViolation } from './private-identity-policy.generated.js';
export type Role = 'student' | 'teacher' | 'observer' | 'display' | 'system';
export type ClientRole = Exclude<Role, 'system'>;
export type ProductSurface = 'student' | 'teacher-runtime' | 'display' | 'observer' | 'backstage' | 'authoring-studio';
export type EngineeringSurface = 'simulation-rehearsal';
export type SurfaceId = ProductSurface | EngineeringSurface;
export type RuntimeProfile = 'student-light' | 'teacher-rich' | 'display-render' | 'observer-rich' | 'backstage-ops' | 'authoring-rich' | 'simulation-engineering';
export type IdentityView = 'self-identifiable' | 'teacher-identifiable' | 'public-pseudonymous' | 'operations-identifiable' | 'none' | 'synthetic-only';
export type AdviceMode = 'off' | 'auto' | 'teacher-confirm';
export type ParticipantMode = 'individual' | 'pair' | 'group' | 'whole-class';
export type SubmissionPolicy = 'none' | 'optional' | 'required';
export type IntelligenceMode = 'rule' | 'llm' | 'hybrid';
export type AccessMode = 'interactive' | 'monitor' | 'mirror-readonly' | 'display-readonly';
export type DeploymentProfile = 'lan-http' | 'lan-https' | 'remote-https' | 'native-app';
export type ProtocolErrorCode = 'unauthorized' | 'forbidden' | 'invalid-state' | 'stale-revision' | 'duplicate' | 'not-found' | 'unsupported' | 'rate-limited' | 'temporary-unavailable' | 'invalid-payload' | 'version-mismatch' | 'capability-missing' | 'membership-required';
export interface Participant {
    participantId: string;
    role: ClientRole;
}
export interface SessionMembership {
    membershipId: string;
    sessionId: string;
    participantId: string;
    role: ClientRole;
    status: 'pending' | 'active' | 'left' | 'revoked' | 'expired';
    joinedAt: string;
    expiresAt?: string | null;
}
export interface JoinRequestBase {
    joinRequestId: string;
    runtimeApiVersion: 1;
    sessionLocator: string;
    participantHint?: string | null;
}
export type JoinRequest = JoinRequestBase & ({
    requestedRole: 'student';
    credential: {
        type: 'class-code' | 'external';
        value: string;
        provider?: string | null;
    };
} | {
    requestedRole: 'observer';
    credential: {
        type: 'observer-token' | 'external';
        value: string;
        provider?: string | null;
    };
} | {
    requestedRole: 'teacher';
    credential: {
        type: 'teacher-issued' | 'external';
        value: string;
        provider?: string | null;
    };
} | {
    requestedRole: 'display';
    credential: {
        type: 'display-token' | 'external';
        value: string;
        provider?: string | null;
    };
});
export interface JoinGrant {
    membershipId: string;
    sessionId: string;
    participantId: string;
    role: ClientRole;
    accessToken: string;
    expiresAt: string;
}
export interface ConnectionPresence {
    connectionId: string;
    sessionId: string;
    membershipId: string;
    participantId: string;
    status: 'online' | 'offline';
    deviceId?: string | null;
    connectedAt: string;
    lastSeenAt: string;
}
export interface AuthenticatedConnectionContext {
    connectionId: string;
    sessionId: string;
    membershipId: string;
    participantId: string;
    role: ClientRole;
}
export type ControllerLease = {
    leaseId: string;
    sessionId: string;
    revision: number;
    holderConnectionId: null;
    holderParticipantId: null;
    expiresAt: null;
} | {
    leaseId: string;
    sessionId: string;
    revision: number;
    holderConnectionId: string;
    holderParticipantId: string;
    expiresAt: number;
};
export interface ResolvedLessonReference {
    packageId: string;
    lessonId: string;
    lessonVersion: string;
    packageFingerprint: string;
}
export interface ClassroomSession {
    sessionId: string;
    lesson: ResolvedLessonReference;
    status: 'created' | 'ready' | 'running' | 'paused' | 'ended';
    currentActivityId?: string | null;
    revision: number;
    featurePolicy: SessionFeaturePolicy;
}
export interface ClientCapabilityReport {
    capabilityReportVersion: 1;
    secureContext: boolean;
    indexedDb: boolean;
    pointerEvents: boolean;
    webWorkers: boolean;
    webSocket: boolean;
    offscreenCanvas?: boolean | null;
    serviceWorker?: boolean | null;
    maxTouchPoints?: number | null;
    deviceMemoryGb?: number | null;
    userAgentFamily?: string | null;
}
export interface ClientHello {
    protocolVersion: 1;
    runtimeApiVersion: 1;
    clientBuild: string;
    capabilityReport: ClientCapabilityReport;
}
export interface ServerHello {
    protocolVersion: 1;
    runtimeApiVersion: 1;
    serverBuild: string;
    connectionId: string;
    sessionId: string;
    membershipId: string;
    participantId: string;
    role: ClientRole;
    heartbeatIntervalMs: number;
    deploymentProfile: DeploymentProfile;
    featurePolicyRevision: number;
}
export interface ClientCommandEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
    commandId: string;
    runtimeApiVersion: 1;
    activityId?: string | null;
    type: string;
    target?: Record<string, unknown> | null;
    payload: T;
    expectedRevision?: number | null;
}
export interface ProtocolError {
    code: ProtocolErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
}
export type CommandResult = {
    commandId: string;
    ok: true;
    revision?: number | null;
    error?: null;
} | {
    commandId: string;
    ok: false;
    revision?: number | null;
    error: ProtocolError;
};
export interface AppletEventIntent<T extends Record<string, unknown> = Record<string, unknown>> {
    type: string;
    payload: T;
    clientMonotonicTime?: number | null;
}
export interface ClientAppletEvent<T extends Record<string, unknown> = Record<string, unknown>> {
    clientEventId: string;
    eventEnvelopeVersion: 1;
    appletEventSchemaVersion: number;
    appletInstanceId: string;
    streamId: string;
    streamSeq: number;
    type: string;
    payload: T;
    clientMonotonicTime?: number | null;
}
export interface AcceptedDomainEvent<T extends Record<string, unknown> = Record<string, unknown>> {
    eventId: string;
    eventEnvelopeVersion: 1;
    appletEventSchemaVersion?: number | null;
    sessionId: string;
    lessonId: string | null;
    activityId: string | null;
    actor: {
        role: Role;
        participantId: string;
    };
    appletInstanceId: string | null;
    type: string;
    payload: T;
    origin: 'client' | 'server' | 'system';
    clientStream: {
        streamId: string;
        streamSeq: number;
        clientMonotonicTime?: number | null;
    } | null;
    serverSeq: number;
    serverReceivedAt: string;
}
export type EventAck = {
    clientEventId: string;
    accepted: true;
    eventId: string;
    serverSeq: number;
    duplicate: boolean;
    error?: null;
} | {
    clientEventId: string;
    accepted: false;
    eventId?: null;
    serverSeq?: null;
    duplicate: false;
    error: ProtocolError;
};
export type AssetManifest = {
    assetId: string;
    path: string;
    mimeType: string;
    preload: true;
    size: number;
    sha256: string;
} | {
    assetId: string;
    path: string;
    mimeType: string;
    preload: false;
    size?: number | null;
    sha256?: string | null;
};
export interface LessonDefinition {
    lessonSchemaVersion: 1;
    lessonId: string;
    version: string;
    title: string;
    activities: string[];
    assets: AssetManifest[];
    metadata?: Record<string, unknown>;
}
export interface LessonPackageManifest {
    packageSchemaVersion: 1;
    runtimeApiVersion: 1;
    packageId: string;
    lessonRef: string;
    activitiesRef: string;
    appletManifestsRef: string;
    configsRef: string;
    optionalRefs?: Record<string, string>;
}
export interface AppletConfigEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
    configRef: string;
    appletTypeId: string;
    configSchemaVersion: number;
    payload: T;
}
export interface AppletInstanceRef {
    appletInstanceId: string;
    appletTypeId: string;
    configRef?: string | null;
    requiredCapabilities: string[];
}
export interface ActivityDefinition {
    activitySchemaVersion: 1;
    activityId: string;
    type: string;
    participantMode: ParticipantMode;
    applets: AppletInstanceRef[];
    adviceMode: AdviceMode;
    submissionPolicy: SubmissionPolicy;
    completionPolicy?: Record<string, unknown>;
    stagePolicy?: Record<string, unknown>;
}
export interface AppletManifest {
    appletTypeId: string;
    version: string;
    hostApiVersion: 1;
    configSchemaVersion: number;
    stateSchemaVersion: number;
    eventSchemaVersion: number;
    commandSchemaVersion: number;
    capabilities: string[];
    emittedEventTypes: string[];
    handledCommandTypes: string[];
    configSchemaRef: string;
    stateSchemaRef: string;
    eventSchemaRefs: Record<string, string>;
    commandSchemaRefs: Record<string, string>;
    requiredPlatformCapabilities?: string[];
    optionalPlatformCapabilities?: string[];
    displayName?: string | null;
}
export interface StateScopeRef {
    type: 'participant' | 'pair' | 'group' | 'session';
    id: string;
}
export interface AppletStateSnapshot<T extends Record<string, unknown> = Record<string, unknown>> {
    sessionId: string;
    activityId: string;
    appletInstanceId: string;
    scope: StateScopeRef;
    stateSchemaVersion: number;
    revision: number;
    state: T;
    capturedAt: string;
}
export interface LiveStateFrame<T extends Record<string, unknown> = Record<string, unknown>> {
    sessionId: string;
    activityId: string;
    appletInstanceId: string;
    scope: StateScopeRef;
    streamId: string;
    seq: number;
    revision?: number | null;
    payload: T;
}
export type LiveQuality = 'background' | 'thumbnail' | 'focus';
export interface LiveSubscriptionRequest {
    subscriptionId: string;
    /** Optional for legacy in-process callers; server subscriptions should provide both. */
    sessionId?: string | null;
    activityId?: string | null;
    appletInstanceId: string;
    quality: LiveQuality;
    subject?: StateScopeRef | null;
    publicSubjectId?: string | null;
}
export interface LiveSubscriptionGrant {
    subscriptionId: string;
    accepted: boolean;
    quality: LiveQuality;
    effectiveHz: number;
    expiresAt?: string | null;
    error?: ProtocolError | null;
}
export interface ArtifactRef {
    artifactId: string;
    revision: number;
}
export interface LearningArtifact<T extends Record<string, unknown> = Record<string, unknown>> {
    artifactId: string;
    sessionId: string;
    activityId: string;
    ownerScope: StateScopeRef;
    artifactType: string;
    revision: number;
    payload: T;
    createdAt: string;
}
export interface Submission {
    submissionId: string;
    sessionId: string;
    activityId: string;
    submitterScope: StateScopeRef;
    submittedBy: string;
    artifacts: ArtifactRef[];
    status: 'draft' | 'submitted' | 'accepted';
    submittedAt?: string | null;
}
export interface ArtifactTransfer {
    transferId: string;
    sessionId: string;
    activityId: string;
    senderId: string;
    recipientScope: StateScopeRef;
    artifact: ArtifactRef;
    status: 'queued' | 'sent' | 'received' | 'opened' | 'completed' | 'failed';
    createdAt: string;
    updatedAt?: string | null;
}
export type Workgroup = {
    workgroupId: string;
    sessionId: string;
    activityId: string;
    type: 'pair';
    memberIds: [
        string,
        string
    ];
    status: 'active' | 'closed';
} | {
    workgroupId: string;
    sessionId: string;
    activityId: string;
    type: 'group';
    memberIds: [
        string,
        string,
        ...string[]
    ];
    status: 'active' | 'closed';
};
export interface StageState<T extends Record<string, unknown> = Record<string, unknown>> {
    sessionId: string;
    revision: number;
    contentType: string;
    payload: T;
}
export type StageAudience = 'teacher-runtime' | 'observer' | 'display';
export interface ProjectedStageState<T extends Record<string, unknown> = Record<string, unknown>> {
    sessionId: string;
    revision: number;
    contentType: string;
    audience: StageAudience;
    payload: T;
}
export interface PublicStudentProjection {
    subjectId: string;
    label: string;
}
export interface TeacherStudentProjection {
    participantId: string;
    displayName: string;
    seatNo?: string | null;
    classId?: string | null;
}
export interface StudentSelfProjection {
    participantId: string;
    displayName: string;
    seatNo?: string | null;
}
export interface BackstageStudentProjection {
    participantId: string;
    displayName: string;
    seatNo?: string | null;
    classId?: string | null;
    rosterId?: string | null;
}
export interface SurfaceDescriptor {
    surfaceId: SurfaceId;
    kind: 'product' | 'engineering';
    participantRole: ClientRole | null;
    runtimeProfile: RuntimeProfile;
    identityView: IdentityView;
    stageAccess: 'none' | 'control' | 'read-only';
    classroomDataAccess: 'self' | 'teacher-projection' | 'public-projection' | 'operations-projection' | 'none' | 'synthetic';
    production: boolean;
}
export interface SessionFeaturePolicy {
    revision: number;
    features: Record<string, boolean>;
}
export interface ReadinessCheck {
    checkId: string;
    status: 'ready' | 'warning' | 'failed';
    message: string;
    details?: Record<string, unknown>;
}
export interface ClientReadinessReport {
    sessionId: string;
    connectionId: string;
    status: 'ready' | 'warning' | 'failed';
    checks: ReadinessCheck[];
    capabilityReport: ClientCapabilityReport;
    checkedAt: string;
}
export interface PreflightReadiness {
    sessionId: string;
    status: 'ready' | 'warning' | 'failed';
    checks: ReadinessCheck[];
    clients?: {
        ready: number;
        warning: number;
        failed: number;
        total: number;
    };
    checkedAt: string;
}
export interface ProviderProvenance {
    mode: IntelligenceMode;
    name: string;
    version: string;
    model?: string | null;
    promptVersion?: string | null;
}
export interface DiagnosisRecord {
    diagnosisId: string;
    schemaVersion: 1;
    sessionId: string;
    activityId: string;
    studentId: string;
    code: string;
    confidence: number;
    evidence: Record<string, unknown>[];
    provider: ProviderProvenance;
    createdAt: string;
}
export interface InterventionDecision {
    interventionId: string;
    schemaVersion: 1;
    diagnosisId: string;
    needed: boolean;
    level: 0 | 1 | 2 | 3 | 4;
    provider: ProviderProvenance;
    createdAt: string;
}
export interface AdviceViews {
    student?: string | null;
    teacher?: string | null;
    observer?: string | null;
    templateFamily?: string | null;
    variantId?: string | null;
}
export interface AdviceRecord {
    adviceId: string;
    schemaVersion: 1;
    diagnosisId: string;
    interventionId: string;
    studentId: string;
    views?: AdviceViews | null;
    status: 'observing' | 'triggered' | 'shown' | 'waiting' | 'resolved' | 'escalated' | 'expired';
    provider: ProviderProvenance;
    createdAt: string;
    outcome?: Record<string, unknown> | null;
}
export interface IntelligenceContext {
    sessionId: string;
    lessonId: string;
    activityId: string;
    studentId: string;
    studentState?: Record<string, unknown>;
    recentEvents: AcceptedDomainEvent[];
    historySummary?: Record<string, unknown>;
    previousAdvice?: AdviceRecord[];
    learningGoal?: Record<string, unknown>;
}
export interface AppletViewerContext {
    viewer: {
        participantId: string;
        role: ClientRole;
        connectionId: string;
    };
    subject: StateScopeRef;
    accessMode: AccessMode;
    publicSubjectId?: string | null;
}

/** Generic framework records. These types deliberately avoid lesson-specific vocabulary. */
export interface PresenceConnectionRecord extends ConnectionPresence {
    deviceId: string | null;
}
export interface AuthenticatedJoinContext extends AuthenticatedConnectionContext {
    membershipId: string;
    accessTokenId: string;
}
export interface AnalyticsEvidenceRef {
    kind: 'event' | 'snapshot' | 'artifact' | 'submission' | 'metric';
    id: string;
    revision?: number | null;
    pointer?: string | null;
}
export interface AnalyticsMetric {
    name: string;
    value: number;
    unit?: string | null;
}
export interface AnalyticsFeature {
    name: string;
    value: string | number | boolean | null;
}
export interface AnalyticsInput {
    sessionId: string;
    activityId: string;
    subject: StateScopeRef;
    events: AcceptedDomainEvent[];
    snapshots: AppletStateSnapshot[];
    artifacts: LearningArtifact[];
    metrics?: AnalyticsMetric[];
    features?: AnalyticsFeature[];
}
export interface ClassificationResult {
    code: string;
    confidence: number;
    evidence: AnalyticsEvidenceRef[];
}
export interface AnalyticsResult {
    resultId: string;
    sessionId: string;
    activityId: string;
    subject: StateScopeRef;
    classifications: ClassificationResult[];
    metrics: AnalyticsMetric[];
    recommendations: RecommendationCandidate[];
    provider: ProviderProvenance;
    createdAt: string;
}
export interface RecommendationCandidate {
    recommendationId: string;
    kind: string;
    label: string;
    evidence: AnalyticsEvidenceRef[];
    status: 'candidate' | 'confirmed' | 'dismissed';
}
export interface StageContentRecord {
    contentType: string;
    payload: Record<string, unknown>;
}
export interface WidgetBinding {
    widgetId: string;
    widgetType: string;
    selector: string;
    audience: StageAudience[];
    parameters?: Record<string, unknown>;
}
