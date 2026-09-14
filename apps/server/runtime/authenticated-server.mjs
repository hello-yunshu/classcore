import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthenticatedClassroomRuntime } from '../../../dist/apps/server/src/classroom-runtime.js';
import { InMemoryClassroomAuthority } from '../../../dist/packages/runtime/src/index.js';
import { SqliteClassroomStateStore } from './sqlite-store.mjs';
import { PresentationLibraryStore, PresentationMaintenanceRunner } from './presentation-library.mjs';
import { CourseLibraryError, CourseLibraryStore } from './course-library.mjs';
import { acceptWebSocketUpgrade } from './websocket.mjs';
import { applyValidatedPresentationControl } from '../../../dist/packages/presentation/src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 9602);
const localToolsHost = process.env.LOCAL_TOOLS_HOST ?? '127.0.0.1';
const localToolsPort = Number(process.env.LOCAL_TOOLS_PORT ?? (port === 9602 ? 9688 : port < 65535 ? port + 1 : 9688));
const dataDir = process.env.CLASSROOM_DATA_DIR ?? path.join(root, '.runtime-data-authenticated');
const lessonSlug = process.env.CLASSROOM_LESSON;
if (!lessonSlug) throw new Error('authenticated-runtime-lesson-required');
if (!/^[a-z0-9][a-z0-9-]*$/.test(lessonSlug)) throw new Error('authenticated-runtime-invalid-lesson-slug');
const lessonDir = path.join(root, 'lessons', lessonSlug);
if (!lessonDir.startsWith(path.join(root, 'lessons') + path.sep)) throw new Error('authenticated-runtime-lesson-path-invalid');
const sessionLocator = process.env.CLASSROOM_SESSION_LOCATOR ?? 'class:authenticated-demo';
const publicBaseUrl = process.env.CLASSROOM_PUBLIC_BASE_URL ?? `http://${host}:${port}`;
const presentationAssetPath = process.env.CLASSROOM_PRESENTATION_PPTX ?? path.join(root, 'dist', 'public', 'assets', 'presentation-webppt-blank.pptx');
const bundledFontFamilies = ['LXGW WenKai GB Lite', '霞鹜文楷 GB 轻便版', 'Noto Serif'];
const bundledFontSubstitutions = { 楷体: 'LXGW WenKai GB Lite', KaiTi: 'LXGW WenKai GB Lite', '楷体_GB2312': 'LXGW WenKai GB Lite', 'Times New Roman': 'Noto Serif' };
const configuredDisplayFontFamilies = process.env.CLASSROOM_DISPLAY_FONT_FAMILIES?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
const displayFontFamilies = [...new Set([...bundledFontFamilies, ...configuredDisplayFontFamilies])];
const now = () => new Date().toISOString();

function loadJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(lessonDir, relativePath), 'utf8'));
}

const lesson = loadJson('lesson.json');
const activities = loadJson('activities.json');
const configs = loadJson('configs.json');
const manifests = loadJson('applets.manifest.json');
const analyticsModulePath = path.join(lessonDir, 'analytics/profile.mjs');
const analyticsModule = fs.existsSync(analyticsModulePath) ? await import(analyticsModulePath) : {};
const analyticsProvider = analyticsModule.analyticsProvider ?? null;
const demoMode = process.env.CLASSROOM_DEMO_MODE === 'true';
const configuredCredentials = process.env.CLASSROOM_CREDENTIALS_JSON ? JSON.parse(process.env.CLASSROOM_CREDENTIALS_JSON) : null;
const demoCredentialsPath = path.join(root, 'fixtures', 'authenticated-demo-credentials.json');
const credentials = Array.isArray(configuredCredentials)
    ? configuredCredentials.map(item => ({ ...item, sessionLocator: item.sessionLocator ?? sessionLocator }))
    : demoMode
        ? JSON.parse(fs.readFileSync(demoCredentialsPath, 'utf8')).map(item => ({ ...item, sessionLocator }))
        : [];
if (!credentials.length) throw new Error('authenticated-runtime-credentials-required');
const presentationOwnerId = credentials.find(item => item.role === 'teacher')?.participantId;
if (!presentationOwnerId) throw new Error('authenticated-runtime-teacher-credential-required');
const displayCredentialValue = credentials.find(item => item.role === 'display')?.credentialValue ?? '';
const credentialValueFor = role => credentials.find(item => item.role === role)?.credentialValue ?? '';
const currentActivityId = process.env.CLASSROOM_ACTIVITY ?? 'activity:restore-independent';
const currentActivity = activities.find(item => item.activityId === currentActivityId) ?? activities.find(item => item.applets.length > 0);
if (!currentActivity) throw new Error('authenticated-runtime-current-activity-missing');

function resolveCurrentActivity(session) {
    const activity = activities.find(item => item.activityId === (session.currentActivityId ?? currentActivity.activityId));
    if (!activity) return null;
    return {
        sessionId: session.sessionId,
        lessonId: session.lesson.lessonId,
        lessonTitle: session.courseTitle ?? lesson.title,
        activity,
        applets: activity.applets.map(instance => ({ instance, config: configs[instance.configRef]?.payload ?? {} })),
    };
}

const authority = new InMemoryClassroomAuthority();
const storage = new SqliteClassroomStateStore(path.join(dataDir, 'classroom.sqlite'));
const presentationDescriptor = loadJson('presentation/presentation.json');
const presentationLibrary = new PresentationLibraryStore(dataDir);
const courseLibrary = new CourseLibraryStore(dataDir, path.join(root, 'lessons'));
const presentationMaintenance = new PresentationMaintenanceRunner(presentationLibrary, { intervalMs: Number(process.env.PRESENTATION_MAINTENANCE_INTERVAL_MS ?? 60 * 60 * 1000) });
const session = {
    sessionId: process.env.CLASSROOM_SESSION_ID ?? 'session:authenticated-demo',
    lesson: {
        packageId: `lesson-package:${lessonSlug}`,
        lessonId: lesson.lessonId,
        lessonVersion: lesson.version,
        packageFingerprint: 'sha256:authenticated-development-package',
    },
    status: 'running',
    currentActivityId: currentActivity.activityId,
    revision: 1,
    featurePolicy: { revision: 1, features: { liveMirroring: true, artifactExchange: true, intelligence: true, observer: true, presentationRuntime: true } },
};
const sessionRecords = new Map();
const activeCourseBySession = new Map([[session.sessionId, { courseId: `lesson-package:${lessonSlug}`, title: lesson.title, baseLessonSlug: lessonSlug }]]);
authority.createSession({
    session,
    sessionLocator,
    credentials,
});
await storage.saveSession(session);

async function preparePublishedPresentation() {
    const presentationBytes = fs.readFileSync(presentationAssetPath);
    const presentationFingerprint = crypto.createHash('sha256').update(presentationBytes).digest('hex');
    let project = presentationLibrary.listPresentations(presentationOwnerId).find(item => item.title === presentationDescriptor.title && presentationLibrary.getAsset(item.currentDraftAssetId)?.sha256 === presentationFingerprint);
    if (!project) {
        project = presentationLibrary.createPresentation({
            ownerUserId: presentationOwnerId,
            title: presentationDescriptor.title,
            bytes: presentationBytes,
            mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            document: { format: 'web-ppt-ooxml-v1', deckId: presentationDescriptor.deckId, idPrefix: 'auth-demo' },
        });
    }
    let revision = presentationLibrary.getLatestRevision(project.presentationId, presentationOwnerId, 'published');
    if (!revision || project.draftHasUnpublishedChanges) {
        revision = await presentationLibrary.createTrustedRevision(project.presentationId, presentationOwnerId, {
            kind: 'published',
            acknowledgeWarnings: true,
            classroomBindings: presentationDescriptor.classroomBindings,
            availableFonts: displayFontFamilies,
            fontSubstitutions: bundledFontSubstitutions,
        });
    }
    return presentationLibrary.prepareClassroom(session.sessionId, presentationOwnerId, { presentationId: project.presentationId, revisionId: revision.revisionId });
}

const preparedPresentation = await preparePublishedPresentation();
sessionRecords.set(session.sessionId, { session, sessionLocator, preparedPresentation, course: activeCourseBySession.get(session.sessionId) });
presentationMaintenance.start();

const manifestByType = new Map(manifests.map(item => [item.appletTypeId, item]));
const appletInstanceIds = new Set(currentActivity.applets.map(item => item.appletInstanceId));
const eventRegistry = {
    getInstancePolicy(appletInstanceId) {
        const instance = currentActivity.applets.find(item => item.appletInstanceId === appletInstanceId);
        const manifest = instance ? manifestByType.get(instance.appletTypeId) : null;
        return manifest ? { appletTypeId: manifest.appletTypeId, eventSchemaVersion: manifest.eventSchemaVersion, emittedEventTypes: new Set(manifest.emittedEventTypes) } : null;
    },
    validatePayload(_appletTypeId, _version, type, payload) {
        if (!payload || typeof payload !== 'object') return { valid: false, message: 'payload-object-required' };
        if (type.startsWith('object.') && typeof payload.objectId !== 'string') return { valid: false, message: 'object-id-required' };
        return { valid: true };
    },
};
const appletAccess = {
    getAccessMode(_sessionId, _activityId, participantId, appletInstanceId) {
        return appletInstanceIds.has(appletInstanceId) && participantId.startsWith('student:') ? 'interactive' : null;
    },
};
const runtime = new AuthenticatedClassroomRuntime({
    authority,
    storage,
    resolveCurrentActivity,
    lessonEventRegistry: eventRegistry,
    appletAccess,
    resolveStudentSelf: (_session, participantId) => ({
        participantId,
        displayName: participantId.startsWith('teacher:') ? `教师 ${participantId.split(':').at(-1) ?? participantId}` : participantId.startsWith('display:') ? '课堂大屏' : `学生 ${participantId.split(':').at(-1) ?? participantId}`,
        seatNo: participantId.startsWith('student:') ? participantId.split(':').at(-1) ?? null : null,
    }),
    resolveTeacherStudent: (_session, participantId) => ({ participantId, displayName: `学生 ${participantId.split(':').at(-1) ?? participantId}`, seatNo: participantId.split(':').at(-1) ?? null }),
    analyticsProvider,
    serverBuild: 'authenticated-classroom-server-dev',
});

let activeSessionId = session.sessionId;
function newSessionCredentials(locator) {
    return credentials.map(item => ({ ...item, sessionLocator: locator }));
}
async function preparePresentationForSession(nextSession, course) {
    const initialPin = presentationLibrary.getSessionPin(session.sessionId);
    const presentationId = course.presentationId ?? initialPin?.presentationId;
    if (!presentationId) throw new Error('course-presentation-required');
    const revisionId = course.presentationId ? null : initialPin?.revisionId ?? null;
    return presentationLibrary.prepareClassroom(nextSession.sessionId, presentationOwnerId, { presentationId, revisionId });
}
async function startCourse(courseId) {
    const course = courseLibrary.getCourse(courseId);
    if (!course) throw new Error('course-not-found');
    if (course.kind === 'workspace' && course.status !== 'published') throw new Error('course-publish-required');
    if (course.baseLessonSlug !== lessonSlug) throw new Error(`course-base-lesson-not-loaded:${course.baseLessonSlug}`);
    const idSuffix = crypto.randomUUID().slice(0, 8);
    const nextSession = {
        sessionId: `session:${course.slug ?? lessonSlug}:${idSuffix}`,
        lesson: { packageId: `lesson-package:${lessonSlug}`, lessonId: lesson.lessonId, lessonVersion: lesson.version, packageFingerprint: 'sha256:authenticated-development-package' },
        courseId: course.courseId,
        courseTitle: course.title,
        status: 'running',
        currentActivityId: currentActivity.activityId,
        revision: 1,
        featurePolicy: { revision: 1, features: { liveMirroring: true, artifactExchange: true, intelligence: true, observer: true, presentationRuntime: true } },
    };
    const nextLocator = `class:${course.slug ?? lessonSlug}:${idSuffix}`;
    runtime.createSession({ session: nextSession, sessionLocator: nextLocator, credentials: newSessionCredentials(nextLocator) });
    await storage.saveSession(nextSession);
    const prepared = await preparePresentationForSession(nextSession, course);
    const courseInfo = { courseId: course.courseId, title: course.title, baseLessonSlug: course.baseLessonSlug };
    sessionRecords.set(nextSession.sessionId, { session: nextSession, sessionLocator: nextLocator, preparedPresentation: prepared, course: courseInfo });
    activeCourseBySession.set(nextSession.sessionId, courseInfo);
    activeSessionId = nextSession.sessionId;
    const displayUrl = new URL('/display/index.html', publicBaseUrl);
    displayUrl.searchParams.set('mode', 'classroom'); displayUrl.searchParams.set('sessionId', nextSession.sessionId); displayUrl.searchParams.set('locator', nextLocator); displayUrl.searchParams.set('code', displayCredentialValue);
    return {
        course: courseLibrary.getCourse(course.courseId),
        session: nextSession,
        sessionLocator: nextLocator,
        credentials: { teacher: credentialValueFor('teacher'), display: credentialValueFor('display'), observer: credentialValueFor('observer'), student: credentialValueFor('student') },
        joinUrls: {
            teacher: `${publicBaseUrl}/teacher/index.html?mode=classroom&locator=${encodeURIComponent(nextLocator)}&code=${encodeURIComponent(credentialValueFor('teacher'))}`,
            display: displayUrl.toString(),
            observer: `${publicBaseUrl}/observer/index.html?session=${encodeURIComponent(nextLocator)}&code=${encodeURIComponent(credentialValueFor('observer'))}`,
            student: `${publicBaseUrl}/student/index.html?mode=classroom&session=${encodeURIComponent(nextLocator)}`,
        },
    };
}
const connections = new Map();
const publicSubjectsBySession = new Map();
const liveSummariesBySession = new Map();

function sendTo(peer, message) { peer.ws.send(message); }
function broadcast(sessionId, message, predicate = () => true) {
    for (const peer of connections.values()) if (peer.context.sessionId === sessionId && predicate(peer.context)) sendTo(peer, message);
}
function isPublicViewer(context) {
    return context.role === 'display' || (context.role === 'observer' && context.observerSubscribed === true);
}
async function broadcastPublicStage(sessionId, stage) {
    const projected = await publicStage(stage);
    for (const peer of connections.values()) {
        if (peer.context.sessionId !== sessionId || !isPublicViewer(peer.context)) continue;
        sendTo(peer, { type: 'stage.state', audience: peer.context.role, stage: projected });
    }
}
function broadcastPublicPresentation(sessionId, state) {
    for (const peer of connections.values()) {
        if (peer.context.sessionId !== sessionId || !isPublicViewer(peer.context)) continue;
        sendTo(peer, { type: 'presentation.sync', audience: peer.context.role, state: publicPresentationState(state) });
    }
}
function publicPresence(sessionId, presence) {
    const subjects = publicSubjectsBySession.get(sessionId) ?? new Map();
    publicSubjectsBySession.set(sessionId, subjects);
    const latestByParticipant = new Map();
    for (const item of presence) {
        const previous = latestByParticipant.get(item.participantId);
        const itemTime = Date.parse(item.lastSeenAt);
        const previousTime = previous ? Date.parse(previous.lastSeenAt) : Number.NEGATIVE_INFINITY;
        if (!previous || itemTime > previousTime || (itemTime === previousTime && item.status === 'online' && previous.status !== 'online')) latestByParticipant.set(item.participantId, item);
    }
    return [...latestByParticipant.values()].map(item => {
        if (!subjects.has(item.participantId)) subjects.set(item.participantId, `anon:${String(subjects.size + 1).padStart(2, '0')}`);
        return { subjectId: subjects.get(item.participantId), status: item.status };
    });
}
function broadcastPresence(sessionId) {
    const presence = runtime.presence(sessionId);
    broadcast(sessionId, { type: 'classroom.presence', presence }, item => item.role === 'teacher');
    broadcast(sessionId, { type: 'classroom.presence.public', presence: publicPresence(sessionId, presence) }, isPublicViewer);
}
function selectedLiveWidget(sessionId, participantIds) {
    const summaries = liveSummariesBySession.get(sessionId) ?? new Map();
    const selected = participantIds.map(participantId => summaries.get(participantId)).filter(Boolean);
    return {
        selector: 'selected-live-view',
        selectedCount: participantIds.length,
        activeCount: selected.length,
        objectCount: selected.reduce((total, item) => total + item.objectCount, 0),
        latestSeq: selected.reduce((latest, item) => Math.max(latest, item.seq), 0),
    };
}
function currentActivityWidget(sessionId) {
    const activity = runtime.currentActivity(sessionId)?.activity;
    return {
        selector: 'current-activity-summary',
        activityId: typeof activity?.activityId === 'string' ? activity.activityId : null,
        activityType: typeof activity?.type === 'string' ? activity.type : 'unknown',
        participantMode: typeof activity?.participantMode === 'string' ? activity.participantMode : 'unknown',
        appletCount: Array.isArray(activity?.applets) ? activity.applets.length : 0,
        adviceMode: typeof activity?.adviceMode === 'string' ? activity.adviceMode : 'off',
        submissionPolicy: typeof activity?.submissionPolicy === 'string' ? activity.submissionPolicy : 'none',
    };
}
function displayJoinUrl(sessionId) {
    const record = sessionRecords.get(sessionId);
    if (!record) throw new Error('session-not-found');
    const url = new URL('/display/index.html', publicBaseUrl);
    url.searchParams.set('mode', 'classroom');
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('locator', record.sessionLocator);
    url.searchParams.set('code', displayCredentialValue);
    return url.toString();
}
function authoritativePresentationState(sessionId) {
    const record = sessionRecords.get(sessionId);
    if (!record?.preparedPresentation) throw new Error('presentation-session-not-prepared');
    const revision = record.preparedPresentation.revision;
    const current = storage.loadPresentationPlayback(sessionId);
    if (current && current.presentationRevisionId === revision.revisionId && current.assetId === revision.assetId && current.deckId === revision.runtimeIndex.deckId) return current;
    const first = revision.runtimeIndex.scenes[0];
    if (!first) throw new Error('presentation-runtime-index-empty');
    const state = { sessionId, presentationRevisionId: revision.revisionId, assetId: revision.assetId, deckId: revision.runtimeIndex.deckId, sceneId: first.sceneId, step: 0, playState: 'idle', revision: 0 };
    storage.savePresentationPlayback(state);
    return state;
}
function publicPresentationState(state) {
    return {
        sessionId: state.sessionId,
        presentationRevisionId: state.presentationRevisionId,
        deckId: state.deckId,
        sceneId: state.sceneId,
        step: state.step,
        playState: state.playState,
        revision: state.revision,
    };
}
function resolvePresentationRuntime(requestedSessionId) {
    const record = sessionRecords.get(requestedSessionId);
    if (!record) return null;
    const pin = presentationLibrary.getSessionPin(requestedSessionId);
    if (!pin || pin.revisionId !== record.preparedPresentation.revision.revisionId || pin.assetId !== record.preparedPresentation.revision.assetId) return null;
    const revision = presentationLibrary.getRevision(pin.revisionId, presentationOwnerId);
    if (!revision || revision.assetId !== pin.assetId) return null;
    return {
        pin,
        revision: {
            revisionId: revision.revisionId,
            assetId: revision.assetId,
            fingerprint: revision.fingerprint,
            document: revision.document,
            runtimeIndex: revision.runtimeIndex,
        },
        state: authoritativePresentationState(requestedSessionId),
    };
}
function finiteNumber(value, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function publicArtifactContent(artifact) {
    const payload = artifact?.payload && typeof artifact.payload === 'object' ? artifact.payload : {};
    const snapshot = payload.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : {};
    const rawObjects = snapshot.objects && typeof snapshot.objects === 'object' ? snapshot.objects : {};
    const objects = Object.values(rawObjects).slice(0, 24).map(item => {
        const object = item && typeof item === 'object' ? item : {};
        const rotationCenter = object.rotationCenter && typeof object.rotationCenter === 'object' ? object.rotationCenter : {};
        return {
            shape: typeof object.shape === 'string' ? object.shape.slice(0, 48) : 'unknown',
            x: finiteNumber(object.x),
            y: finiteNumber(object.y),
            width: finiteNumber(object.width),
            height: finiteNumber(object.height),
            rotation: finiteNumber(object.rotation),
            rotationCenter: { x: finiteNumber(rotationCenter.x), y: finiteNumber(rotationCenter.y) },
        };
    });
    const tokens = Array.isArray(payload.recordTokens)
        ? payload.recordTokens.slice(0, 64).map(token => ({
            kind: token && typeof token === 'object' && typeof token.kind === 'string' ? token.kind.slice(0, 32) : 'unknown',
            display: token && typeof token === 'object' && typeof token.display === 'string' ? token.display.slice(0, 32) : '',
        }))
        : [];
    return {
        artifactType: typeof artifact?.artifactType === 'string' ? artifact.artifactType : 'unknown',
        revision: Number.isInteger(artifact?.revision) ? artifact.revision : 0,
        recordText: typeof payload.recordText === 'string' ? payload.recordText.slice(0, 240) : '',
        tokens,
        objectCount: Number.isInteger(payload.objectCount) ? payload.objectCount : objects.length,
        solved: typeof payload.solved === 'boolean' ? payload.solved : null,
        objects,
    };
}
async function stageArtifactContents(stage) {
    const payload = stage?.payload && typeof stage.payload === 'object' ? stage.payload : {};
    const refs = Array.isArray(payload.evidence) ? payload.evidence.filter(item => item && typeof item === 'object' && item.kind === 'artifact' && typeof item.id === 'string') : [];
    const artifacts = await Promise.all(refs.map(item => storage.getArtifact(item.id, Number.isInteger(item.revision) ? item.revision : undefined)));
    return artifacts.filter(Boolean).map(publicArtifactContent);
}
async function teacherStage(stage) {
    const artifactContents = await stageArtifactContents(stage);
    if (!artifactContents.length) return stage;
    return { ...stage, payload: { ...stage.payload, artifactContents } };
}
async function publicStage(stage) {
    if (!stage) return null;
    const payload = stage.payload && typeof stage.payload === 'object' ? stage.payload : {};
    const artifactContents = await stageArtifactContents(stage);
    const widget = payload.widget && typeof payload.widget === 'object' && payload.widget.selector === 'selected-artifact'
        ? {
            selector: 'selected-artifact',
            evidenceCount: Number.isInteger(payload.widget.evidenceCount) ? payload.widget.evidenceCount : 0,
            artifactCount: Number.isInteger(payload.widget.artifactCount) ? payload.widget.artifactCount : 0,
        }
        : payload.widget && typeof payload.widget === 'object' && payload.widget.selector === 'selected-live-view'
            ? {
                selector: 'selected-live-view',
                selectedCount: Number.isInteger(payload.widget.selectedCount) ? payload.widget.selectedCount : 0,
                activeCount: Number.isInteger(payload.widget.activeCount) ? payload.widget.activeCount : 0,
                objectCount: Number.isInteger(payload.widget.objectCount) ? payload.widget.objectCount : 0,
                latestSeq: Number.isInteger(payload.widget.latestSeq) ? payload.widget.latestSeq : 0,
            }
        : payload.widget && typeof payload.widget === 'object' && payload.widget.selector === 'current-activity-summary'
            ? {
                selector: 'current-activity-summary',
                activityId: typeof payload.widget.activityId === 'string' ? payload.widget.activityId : null,
                activityType: typeof payload.widget.activityType === 'string' ? payload.widget.activityType : 'unknown',
                participantMode: typeof payload.widget.participantMode === 'string' ? payload.widget.participantMode : 'unknown',
                appletCount: Number.isInteger(payload.widget.appletCount) ? payload.widget.appletCount : 0,
                adviceMode: typeof payload.widget.adviceMode === 'string' ? payload.widget.adviceMode : 'off',
                submissionPolicy: typeof payload.widget.submissionPolicy === 'string' ? payload.widget.submissionPolicy : 'none',
            }
        : null;
    return {
        sessionId: stage.sessionId,
        revision: stage.revision,
        contentType: stage.contentType,
        payload: {
            source: typeof payload.source === 'string' ? payload.source : 'activity',
            selectedCount: Array.isArray(payload.selectedParticipantIds) ? payload.selectedParticipantIds.length : 0,
            annotation: typeof payload.annotation === 'string' ? payload.annotation.slice(0, 160) : null,
            presentationRevisionId: typeof payload.presentationRevisionId === 'string' ? payload.presentationRevisionId : null,
            presentationSceneId: typeof payload.presentationSceneId === 'string' ? payload.presentationSceneId : null,
            presentationStep: Number.isInteger(payload.presentationStep) ? payload.presentationStep : null,
            presentationPlayState: typeof payload.presentationPlayState === 'string' ? payload.presentationPlayState : null,
            ...(widget ? { widget } : {}),
            ...(artifactContents.length ? { artifactContents } : {}),
        },
    };
}
async function sendClassroomSnapshot(peer) {
    const { context } = peer;
    if (context.role !== 'display' && context.role !== 'observer') {
        const self = context.role === 'teacher'
            ? { participantId: context.participantId, displayName: `教师 ${context.participantId.split(':').at(-1)}` }
            : { participantId: context.participantId, displayName: `学生 ${context.participantId.split(':').at(-1)}`, seatNo: context.participantId.split(':').at(-1) };
        sendTo(peer, { type: 'classroom.self', self });
    }
    if (context.role === 'teacher') sendTo(peer, { type: 'classroom.presence', presence: runtime.presence(context.sessionId) });
    if (isPublicViewer(context)) sendTo(peer, { type: 'classroom.presence.public', presence: publicPresence(context.sessionId, runtime.presence(context.sessionId)) });
    const activity = runtime.currentActivity(context.sessionId);
    if (context.role === 'teacher') sendTo(peer, { type: 'classroom.submissions', submissions: await runtime.submissions(context.sessionId, activity?.activity.activityId) });
    const stage = await runtime.currentStage(context.sessionId);
    if (stage) sendTo(peer, { type: 'stage.state', audience: context.role === 'teacher' ? 'teacher-runtime' : 'display', stage: context.role === 'teacher' ? await teacherStage(stage) : await publicStage(stage) });
    if (context.role === 'teacher' || isPublicViewer(context)) sendTo(peer, { type: 'presentation.sync', audience: context.role === 'teacher' ? 'teacher-runtime' : context.role, state: publicPresentationState(authoritativePresentationState(context.sessionId)), reason: 'reconnect' });
    if (context.role === 'teacher') {
        const record = sessionRecords.get(context.sessionId);
        sendTo(peer, { type: 'classroom.course', course: record?.course ?? null });
        sendTo(peer, { type: 'classroom.display-link', url: displayJoinUrl(context.sessionId) });
        sendTo(peer, { type: 'classroom.join-links', links: { studentCode: credentials.find(item => item.role === 'student')?.credentialValue ?? null, observerCode: credentials.find(item => item.role === 'observer')?.credentialValue ?? null } });
    }
    if (context.role === 'teacher') sendTo(peer, { type: 'teacher.students', students: await runtime.teacherStudents(context.sessionId) });
}

function sendJson(res, status, value) {
    const body = JSON.stringify(value);
    const headers = {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
        'access-control-allow-origin': `http://${localToolsHost}:${localToolsPort}`,
        'access-control-allow-headers': 'content-type,x-classcore-user-id,x-classcore-resource-name',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
    };
    res.writeHead(status, headers);
    res.end(body);
}

async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > 256 * 1024) throw new Error('request-too-large');
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function readBytes(req, maxBytes = 128 * 1024 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) throw new Error('request-too-large');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function contentType(file) {
    return file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/octet-stream';
}

function servePublic(res, pathname) {
    const route = pathname === '/' ? '/student/index.html' : /^\/(student|teacher|display|observer|backstage|authoring|simulation)$/.test(pathname) ? `${pathname}/index.html` : pathname;
    const file = path.resolve(path.join(root, 'dist', 'public', route.replace(/^\/+/, '')));
    const publicRoot = path.resolve(path.join(root, 'dist', 'public')) + path.sep;
    if (!file.startsWith(publicRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': contentType(file), 'content-length': body.length, 'cache-control': 'no-store' });
    res.end(body);
    return true;
}

const classroomServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}:${port}`);
    try {
        if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': `http://${localToolsHost}:${localToolsPort}`, 'access-control-allow-headers': 'content-type,x-classcore-user-id,x-classcore-resource-name', 'access-control-allow-methods': 'GET,POST,OPTIONS' }); return res.end(); }
        if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, service: 'authenticated-classroom-server', revision: 'R3.10', runtime: 'authenticated-classroom-server', runtimeMode: 'authenticated-classroom-server', arch: process.arch, platform: process.platform });
        if (url.pathname === '/readyz') return sendJson(res, 200, { ok: true, runtimeMode: 'authenticated-classroom-server', authentication: true, productReady: true, currentActivityId: sessionRecords.get(activeSessionId)?.session.currentActivityId ?? session.currentActivityId, activeSessionId });
        if (url.pathname === '/api/courses' && req.method === 'GET') return sendJson(res, 200, { courses: courseLibrary.listCourses(), activeSessionId });
        if (url.pathname === '/api/courses' && req.method === 'POST') {
            const body = await readJson(req);
            return sendJson(res, 201, { course: courseLibrary.createCourse({ title: body.title, baseLessonSlug: body.baseLessonSlug ?? lessonSlug }) });
        }
        if (url.pathname === '/api/classroom/join' && req.method === 'POST') {
            const body = await readJson(req);
            const result = await runtime.join(body);
            return sendJson(res, 200, result);
        }
        const apiParts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
        if (req.method === 'POST' && apiParts[0] === 'api' && apiParts[1] === 'courses' && apiParts[2] && apiParts[3] === 'resources') {
            const body = await readBytes(req);
            const course = courseLibrary.getCourse(`course:${apiParts[2]}`) ?? courseLibrary.getCourse(apiParts[2]);
            if (!course) return sendJson(res, 404, { error: 'course-not-found' });
            const encodedName = String(req.headers['x-classcore-resource-name'] ?? 'resource.bin');
            let name = encodedName;
            try { name = decodeURIComponent(encodedName); } catch {}
            const mimeType = String(req.headers['content-type'] ?? 'application/octet-stream');
            const result = courseLibrary.addResource(course.courseId, { name, mimeType, bytes: body });
            let presentation = null;
            if (/\.pptx?$/i.test(name) || mimeType.includes('presentation')) {
                const created = presentationLibrary.createPresentation({ ownerUserId: presentationOwnerId, title: result.course.title, bytes: body, mimeType, document: { format: 'web-ppt-ooxml-v1', idPrefix: `course-${result.course.slug}`, deckId: `deck:${result.course.slug}` } });
                const revision = await presentationLibrary.createTrustedRevision(created.presentationId, presentationOwnerId, { kind: 'published', acknowledgeWarnings: true });
                courseLibrary.attachPresentation(result.course.courseId, created.presentationId);
                presentation = { presentationId: created.presentationId, revisionId: revision.revisionId };
            }
            return sendJson(res, 201, { course: courseLibrary.getCourse(result.course.courseId), resource: result.resource, presentation });
        }
        if (req.method === 'POST' && apiParts[0] === 'api' && apiParts[1] === 'courses' && apiParts[2] && apiParts[3] === 'publish') {
            const courseId = apiParts[2].startsWith('course:') ? apiParts[2] : `course:${apiParts[2]}`;
            return sendJson(res, 200, { course: courseLibrary.publishCourse(courseId) });
        }
        if (req.method === 'POST' && apiParts[0] === 'api' && apiParts[1] === 'courses' && apiParts[2] && apiParts[3] === 'start') {
            const courseId = apiParts[2].startsWith('lesson-package:') || apiParts[2].startsWith('course:') ? apiParts[2] : `course:${apiParts[2]}`;
            return sendJson(res, 201, await startCourse(courseId));
        }
        if (req.method === 'GET' && apiParts[0] === 'api' && apiParts[1] === 'sessions' && apiParts[3] === 'presentation-runtime') {
            const requestedSessionId = apiParts[2];
            if (!sessionRecords.has(requestedSessionId)) return sendJson(res, 404, { error: 'presentation-session-not-found' });
            const resolved = resolvePresentationRuntime(requestedSessionId);
            if (!resolved) return sendJson(res, 410, { error: 'session-ended' });
            if (apiParts[4] === 'asset') {
                const cached = presentationLibrary.getPreparedRuntimeAsset(resolved.pin.assetId);
                const bytes = fs.readFileSync(cached.cachePath);
                res.writeHead(200, {
                    'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'content-length': bytes.length,
                    'x-content-sha256': resolved.revision.fingerprint,
                    'cache-control': 'no-store',
                });
                return res.end(bytes);
            }
            return sendJson(res, 200, { runtime: resolved });
        }
        if (servePublic(res, url.pathname)) return;
        sendJson(res, 404, { error: 'not-found' });
    } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
});

classroomServer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') return socket.destroy();
    let context = null;
    const connection = acceptWebSocketUpgrade(req, socket, head, async (text, ws) => {
        let message;
        try { message = JSON.parse(text); } catch { ws.send({ type: 'error', code: 'invalid-json' }); return; }
        if (!context) {
            if (message.type !== 'client.hello' || typeof message.accessToken !== 'string') {
                ws.send({ type: 'server.hello', ok: false, reason: 'authenticated-client-hello-required' });
                ws.close(1008, 'authentication-required');
                return;
            }
            try {
                const connected = runtime.connect(message.accessToken, `connection:${crypto.randomUUID?.() ?? Date.now()}`);
                context = connected.context;
                connections.set(context.connectionId, { ws, context });
                ws.send({ type: 'server.hello', ...connected.hello });
                const activity = runtime.currentActivity(context.sessionId);
                if (activity && context.role !== 'display' && context.role !== 'observer') ws.send({ type: 'activity.current', activity });
                for (const item of context.role === 'display' || context.role === 'observer' ? [] : activity?.applets ?? []) {
                    const snapshot = await storage.getLatestSnapshot(context.sessionId, activity.activity.activityId, item.instance.appletInstanceId, `participant:${context.participantId}`);
                    if (snapshot) ws.send({ type: 'snapshot.state', snapshot });
                }
                await sendClassroomSnapshot({ ws, context });
                await runtime.restoreLease(context.sessionId);
                if (context.role === 'teacher') {
                    const lease = await runtime.controllerLease(context.sessionId);
                    if (lease) ws.send({ type: 'teacher.lease.state', lease });
                }
                broadcastPresence(context.sessionId);
                const students = await runtime.teacherStudents(context.sessionId);
                broadcast(context.sessionId, { type: 'teacher.students', students }, item => item.role === 'teacher');
            } catch (error) { ws.send({ type: 'server.hello', ok: false, reason: error instanceof Error ? error.message : String(error) }); ws.close(1008, 'authentication-failed'); }
            return;
        }
        try {
            if (message.type === 'heartbeat') {
                runtime.authority.heartbeat(context.connectionId);
                ws.send({ type: 'heartbeat.ack', ok: true });
                return;
            }
            if (message.type === 'observer.subscribe') {
                if (context.role !== 'observer') throw new Error('observer-role-required');
                context.observerSubscribed = true;
                ws.send({ type: 'observer.subscribe.ack', ok: true, subscriptionId: typeof message.subscriptionId === 'string' ? message.subscriptionId : null });
                await sendClassroomSnapshot({ ws, context });
                broadcastPresence(context.sessionId);
                return;
            }
            if (message.type === 'teacher.lease.claim') {
                const lease = await runtime.claimLease(context, Number(message.expectedRevision ?? 0));
                ws.send({ type: 'teacher.lease.ack', ok: true, lease });
                return;
            }
            if (message.type === 'teacher.lease.renew') {
                const lease = await runtime.renewLease(context, Number(message.expectedRevision ?? 0));
                ws.send({ type: 'teacher.lease.ack', ok: true, lease });
                return;
            }
            if (message.type === 'teacher.lease.release') {
                const lease = await runtime.releaseLease(context, Number(message.expectedRevision ?? 0));
                ws.send({ type: 'teacher.lease.ack', ok: true, lease });
                return;
            }
            if (message.type === 'teacher.students.refresh') {
                ws.send({ type: 'teacher.students', students: await runtime.teacherStudents(context.sessionId) });
                return;
            }
            if (message.type === 'teacher.analytics.request') {
                const participantId = typeof message.participantId === 'string' ? message.participantId : '';
                const result = await runtime.analyzeStudent(context, participantId);
                ws.send({ type: 'teacher.analytics.result', ok: true, result });
                return;
            }
            if (message.type === 'teacher.analytics.confirm') {
                const resultId = typeof message.resultId === 'string' ? message.resultId : '';
                const recommendationId = typeof message.recommendationId === 'string' ? message.recommendationId : '';
                const confirmed = await runtime.confirmAnalyticsRecommendation(context, resultId, recommendationId, typeof message.expectedRevision === 'number' ? message.expectedRevision : undefined);
                ws.send({ type: 'teacher.analytics.confirmed', ok: true, result: confirmed.result, stage: await teacherStage(confirmed.stage) });
                await broadcastPublicStage(context.sessionId, confirmed.stage);
                return;
            }
            if (message.type === 'presentation.control') {
                if (context.role !== 'teacher') throw new Error('teacher-role-required');
                const decision = runtime.authorization.authorize(context, 'presentation.control');
                if (!decision.allowed) throw new Error(decision.reason ?? 'presentation-control-forbidden');
                const record = sessionRecords.get(context.sessionId);
                if (!record) throw new Error('session-not-found');
                const current = authoritativePresentationState(context.sessionId);
                if (typeof message.expectedRevision === 'number' && message.expectedRevision !== current.revision) throw new Error('stale-revision');
                const next = applyValidatedPresentationControl(current, message, record.preparedPresentation.revision.runtimeIndex);
                storage.savePresentationPlayback(next);
                ws.send({ type: 'presentation.control.ack', ok: true, controlId: message.controlId ?? null, state: publicPresentationState(next) });
                broadcast(context.sessionId, { type: 'presentation.sync', audience: 'teacher-runtime', state: publicPresentationState(next) }, item => item.role === 'teacher');
                broadcastPublicPresentation(context.sessionId, next);
                const currentStage = await runtime.currentStage(context.sessionId);
                if (currentStage?.payload && typeof currentStage.payload === 'object' && currentStage.payload.source === 'presentation') {
                    const stage = await runtime.setStage(context, 'presentation:deck', {
                        ...currentStage.payload,
                        presentationRevisionId: next.presentationRevisionId,
                        presentationSceneId: next.sceneId,
                        presentationStep: next.step,
                        presentationPlayState: next.playState,
                    }, currentStage.revision);
                    ws.send({ type: 'stage.state', audience: 'teacher-runtime', stage });
                    await broadcastPublicStage(context.sessionId, stage);
                }
                return;
            }
            if (message.type === 'teacher.selection.random') {
                const students = await runtime.teacherStudents(context.sessionId);
                const online = new Set(runtime.presence(context.sessionId).filter(item => item.status === 'online').map(item => item.participantId));
                const candidates = students.filter(item => online.has(item.participantId));
                const selected = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
                const selectedParticipantIds = selected ? [selected.participantId] : [];
                const stage = await runtime.setStage(context, 'core:teacher-stage', { source: 'student-live', selectedParticipantIds, widget: selectedLiveWidget(context.sessionId, selectedParticipantIds), annotation: null }, typeof message.expectedRevision === 'number' ? message.expectedRevision : undefined);
                ws.send({ type: 'teacher.selection.ack', ok: true, selected: selected ? [selected] : [], stage });
                await broadcastPublicStage(context.sessionId, stage);
                return;
            }
            if (message.type === 'teacher.selection.set') {
                const requested = Array.isArray(message.participantIds) ? [...new Set(message.participantIds.filter(item => typeof item === 'string'))].slice(0, 4) : [];
                const students = await runtime.teacherStudents(context.sessionId);
                const allowed = new Set(students.map(item => item.participantId));
                const selected = requested.filter(item => allowed.has(item));
                const stage = await runtime.setStage(context, 'core:teacher-stage', { source: 'student-live', selectedParticipantIds: selected, widget: selectedLiveWidget(context.sessionId, selected), annotation: null }, typeof message.expectedRevision === 'number' ? message.expectedRevision : undefined);
                ws.send({ type: 'teacher.selection.ack', ok: true, selected: students.filter(item => selected.includes(item.participantId)), stage });
                await broadcastPublicStage(context.sessionId, stage);
                return;
            }
            if (message.type === 'teacher.stage.source') {
                const source = message.source === 'presentation' ? 'presentation' : message.source === 'activity' ? 'activity' : 'student-live';
                const current = await runtime.currentStage(context.sessionId);
                const existing = current?.payload && typeof current.payload === 'object' ? current.payload : {};
                const playback = source === 'presentation' ? authoritativePresentationState(context.sessionId) : null;
                const selectedParticipantIds = Array.isArray(existing.selectedParticipantIds) ? existing.selectedParticipantIds.filter(item => typeof item === 'string') : [];
                const stage = await runtime.setStage(context, source === 'presentation' ? 'presentation:deck' : 'core:teacher-stage', {
                    ...existing,
                    source,
                    ...(source === 'student-live' ? { selectedParticipantIds, widget: selectedLiveWidget(context.sessionId, selectedParticipantIds) } : source === 'activity' ? { selectedParticipantIds: [], widget: currentActivityWidget(context.sessionId) } : { widget: null }),
                    ...(playback ? { presentationRevisionId: playback.presentationRevisionId, presentationSceneId: playback.sceneId, presentationStep: playback.step, presentationPlayState: playback.playState } : {}),
                }, typeof message.expectedRevision === 'number' ? message.expectedRevision : undefined);
                ws.send({ type: 'stage.state', audience: 'teacher-runtime', stage });
                await broadcastPublicStage(context.sessionId, stage);
                return;
            }
            if (message.type === 'teacher.annotation') {
                const current = await runtime.currentStage(context.sessionId);
                const existing = current?.payload && typeof current.payload === 'object' ? current.payload : {};
                const annotation = typeof message.text === 'string' ? message.text.slice(0, 160) : '';
                const stage = await runtime.setStage(context, 'core:teacher-stage', { ...existing, annotation }, typeof message.expectedRevision === 'number' ? message.expectedRevision : undefined);
                ws.send({ type: 'teacher.annotation.ack', ok: true, stage });
                await broadcastPublicStage(context.sessionId, stage);
                return;
            }
            if (message.type === 'applet.event') {
                const ack = await runtime.acceptAppletEvent(context, message.event);
                ws.send({ type: 'event.ack', ok: ack.accepted, ...ack });
                return;
            }
            if (message.type === 'applet.snapshot') {
                await runtime.saveSnapshot(context, message.snapshot);
                ws.send({ type: 'snapshot.ack', ok: true, clientEventId: message.clientEventId, eventId: `snapshot:${message.clientEventId}`, serverSeq: message.snapshot.revision, duplicate: false });
                return;
            }
            if (message.type === 'submission.submit') {
                const activity = runtime.currentActivity(context.sessionId);
                const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
                const submission = await runtime.submit(context, {
                    submissionId: `submission:${message.clientEventId}`,
                    sessionId: context.sessionId,
                    activityId: activity.activity.activityId,
                    submitterScope: { type: 'participant', id: context.participantId },
                    submittedBy: context.participantId,
                    artifacts: [],
                    status: 'submitted',
                    submittedAt: now(),
                }, payload);
                ws.send({ type: 'submission.ack', ok: true, clientEventId: message.clientEventId, eventId: submission.submissionId, serverSeq: 0, duplicate: false });
                broadcast(context.sessionId, { type: 'classroom.submissions', submissions: await runtime.submissions(context.sessionId, activity.activity.activityId) }, item => item.role === 'teacher');
                return;
            }
            if (message.type === 'live.state') {
                const frame = await runtime.publishLiveState(context, message.frame);
                const participantId = frame.scope?.type === 'participant' && typeof frame.scope.id === 'string' ? frame.scope.id : null;
                if (participantId) {
                    const summaries = liveSummariesBySession.get(context.sessionId) ?? new Map();
                    const payload = frame.payload && typeof frame.payload === 'object' ? frame.payload : {};
                    summaries.set(participantId, { seq: Number.isInteger(frame.seq) ? frame.seq : 0, objectCount: payload.objects && typeof payload.objects === 'object' ? Object.keys(payload.objects).length : 0 });
                    liveSummariesBySession.set(context.sessionId, summaries);
                }
                broadcast(context.sessionId, { type: 'live.state', frame }, item => item.role === 'teacher' || (item.role === 'student' && item.participantId === context.participantId));
                return;
            }
            ws.send({ type: 'error', code: 'unknown-message' });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            const type = message.type === 'applet.event' ? 'event.ack' : message.type === 'applet.snapshot' ? 'snapshot.ack' : message.type === 'submission.submit' ? 'submission.ack' : 'error';
            ws.send({ type, ok: false, clientEventId: message.clientEventId ?? message.event?.clientEventId, reason });
        }
    }, () => {
        if (context) {
            connections.delete(context.connectionId);
            try { runtime.authority.disconnect(context.connectionId); } catch {}
            broadcastPresence(context.sessionId);
            void runtime.teacherStudents(context.sessionId).then(students => broadcast(context.sessionId, { type: 'teacher.students', students }, item => item.role === 'teacher'));
        }
    });
    if (!connection) socket.destroy();
});

const localToolsServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${localToolsHost}:${localToolsPort}`);
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, service: 'authenticated-local-tools', revision: 'R3.10', runtime: 'authenticated-local-tools', arch: process.arch, platform: process.platform });
    if (servePublic(res, url.pathname)) return;
    sendJson(res, 404, { error: 'not-found' });
});

function shutdown() {
    classroomServer.close();
    localToolsServer.close();
    storage.close();
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
localToolsServer.listen(localToolsPort, localToolsHost, () => console.log(`LOCAL_TOOLS_SERVER_READY http://${localToolsHost}:${localToolsPort}/backstage`));
classroomServer.listen(port, host, () => console.log(`CLASSROOM_SERVER_READY http://${host}:${port} authenticated=true`));
