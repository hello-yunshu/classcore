import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteClassroomStateStore } from './sqlite-store.mjs';
import { PresentationLibraryError, PresentationLibraryStore, PresentationMaintenanceRunner } from './presentation-library.mjs';
import { acceptWebSocketUpgrade } from './websocket.mjs';
import { applyValidatedPresentationControl } from '../../../dist/packages/presentation/src/index.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
function readPositiveInt(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    const raw = process.env[name];
    if (raw == null || raw === '')
        return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}, got ${raw}`);
    }
    return value;
}
const host = process.env.HOST ?? '127.0.0.1';
const port = readPositiveInt('PORT', 9602, { max: 65535 });
const defaultLocalToolsPort = port === 9602 ? 9688 : port < 65535 ? port + 1 : 9688;
const localToolsHost = process.env.LOCAL_TOOLS_HOST ?? '127.0.0.1';
const localToolsPort = readPositiveInt('LOCAL_TOOLS_PORT', defaultLocalToolsPort, { max: 65535 });
function hostsOverlap(left, right) {
    if (left === right)
        return true;
    const wildcard = new Set(['0.0.0.0', '::', '[::]']);
    return wildcard.has(left) || wildcard.has(right);
}
if (port === localToolsPort && hostsOverlap(host, localToolsHost)) {
    throw new Error('classroom and local-tools endpoints overlap; choose different ports or non-overlapping bind addresses');
}
const dataDir = process.env.CLASSROOM_DATA_DIR ?? path.join(root, '.runtime-data');
const publicDir = path.join(root, 'dist', 'public');
const maxWebSocketMessageBytes = readPositiveInt('MAX_WS_MESSAGE_BYTES', 256 * 1024, { max: 8 * 1024 * 1024 });
const observerMaxBufferedBytes = readPositiveInt('OBSERVER_MAX_BUFFER_BYTES', 512 * 1024, { max: 32 * 1024 * 1024 });
const controllerLeaseDurationMs = 45 * 1000;
const controllerLeaseGraceMs = 20 * 1000;
const serverInstanceId = `server-${crypto.randomUUID()}`;
const runtimeMode = process.env.CLASSROOM_RUNTIME_MODE ?? 'reference-transport';
const authentication = process.env.CLASSROOM_AUTHENTICATION === 'true';
const productReady = process.env.CLASSROOM_PRODUCT_READY === 'true';
if (runtimeMode !== 'reference-transport' || authentication || productReady) {
    throw new Error('unsupported-runtime-mode: authenticated-classroom-server is not implemented; reference-transport requires CLASSROOM_AUTHENTICATION=false and CLASSROOM_PRODUCT_READY=false');
}
const store = new SqliteClassroomStateStore(path.join(dataDir, 'classroom.sqlite'));
const presentationLibrary = new PresentationLibraryStore(dataDir);
const presentationMaintenance = new PresentationMaintenanceRunner(presentationLibrary, {
    intervalMs: Number(process.env.PRESENTATION_MAINTENANCE_INTERVAL_MS ?? 60 * 60 * 1000),
}).start();
const clients = new Set();
const stats = {
    connections: 0,
    students: 0,
    observers: 0,
    teachers: 0,
    display: 0,
    messages: 0,
    stageBroadcasts: 0,
    stageDrops: 0,
    presentationBroadcasts: 0,
};
function resolveAuthoritativePresentationState(sessionId) {
    const lifecycle = presentationLibrary.getSessionLifecycle(sessionId);
    if (lifecycle?.status === 'ended') return null;
    const pin = presentationLibrary.getSessionPin(sessionId);
    if (!pin) throw new Error('presentation-session-pin-required');
    const revision = presentationLibrary.getRevision(pin.revisionId);
    if (!revision) throw new Error('presentation-revision-not-found');
    if (revision.assetId !== pin.assetId || revision.fingerprint !== presentationLibrary.getAsset(pin.assetId)?.sha256)
        throw new Error('presentation-session-revision-mismatch');
    presentationLibrary.getPreparedRuntimeAsset(pin.assetId);
    const current = store.loadPresentationPlayback(sessionId);
    if (current && (current.presentationRevisionId !== revision.revisionId || current.assetId !== pin.assetId || current.deckId !== revision.runtimeIndex.deckId))
        throw new Error('presentation-session-revision-mismatch');
    if (current) return { pin, revision, state: current };
    const first = revision.runtimeIndex.scenes[0];
    if (!first) throw new Error('presentation-runtime-index-empty');
    const state = { sessionId, presentationRevisionId: revision.revisionId, assetId: pin.assetId, deckId: revision.runtimeIndex.deckId, sceneId: first.sceneId, step: 0, playState: 'idle', revision: 0 };
    store.savePresentationPlayback(state);
    return { pin, revision, state };
}
const presentationStateForSession = resolveAuthoritativePresentationState;
function applyPresentationTransportControl(sessionId, message) {
    const { revision, state: current } = presentationStateForSession(sessionId);
    const next = applyValidatedPresentationControl(current, message, revision.runtimeIndex);
    store.savePresentationPlayback(next);
    return next;
}
function broadcastPresentationSync(sessionId, state, extra = {}) {
    for (const item of clients) {
        const sameSession = item.meta.sessionId === sessionId;
        const publicViewer = item.meta.role === 'display' || (item.meta.role === 'observer' && item.meta.subscribed);
        if (!sameSession || !publicViewer) continue;
        if (item.ws.bufferedBytes() > observerMaxBufferedBytes) {
            stats.stageDrops++;
            continue;
        }
        item.ws.send({ type: 'presentation.sync', state, ...extra });
        stats.presentationBroadcasts++;
    }
}
function controllerLeaseReason(meta) {
    const lease = store.loadControllerLease(meta.sessionId);
    if (!lease) return 'controller-lease-required';
    if (lease.expiresAt === null || lease.expiresAt <= Date.now()) return 'controller-lease-expired';
    if (lease.holderConnectionId !== meta.clientId || lease.holderParticipantId !== meta.participantId) return 'controller-lease-held-by-other';
    if (lease.disconnectedAt) return 'controller-lease-reconnecting';
    return null;
}
function acquireTeacherLease(meta) {
    const now = Date.now();
    const current = store.loadControllerLease(meta.sessionId);
    if (!current) {
        store.saveControllerLease({ leaseId: `lease-${crypto.randomUUID()}`, sessionId: meta.sessionId, revision: 1, holderConnectionId: meta.clientId, holderParticipantId: meta.participantId, serverInstanceId, expiresAt: now + controllerLeaseDurationMs, disconnectedAt: null, graceUntil: null });
        return true;
    }
    const sameParticipant = current.holderParticipantId === meta.participantId;
    const staleServer = current.serverInstanceId !== serverInstanceId;
    const withinGrace = current.graceUntil != null && current.graceUntil >= now;
    const expired = current.expiresAt == null || current.expiresAt <= now;
    if (!sameParticipant || (!staleServer && !withinGrace && !expired && current.holderConnectionId !== meta.clientId))
        return false;
    store.saveControllerLease({ ...current, holderConnectionId: meta.clientId, serverInstanceId, expiresAt: now + controllerLeaseDurationMs, disconnectedAt: null, graceUntil: null });
    return true;
}
function renewTeacherLease(meta) {
    const lease = store.loadControllerLease(meta.sessionId);
    if (controllerLeaseReason(meta)) return null;
    const renewed = { ...lease, expiresAt: Date.now() + controllerLeaseDurationMs, disconnectedAt: null, graceUntil: null };
    store.saveControllerLease(renewed);
    return renewed;
}
function sendJson(res, status, value) {
    const body = JSON.stringify(value);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
    });
    res.end(body);
}
function requestOwner(req) {
    // Reference transport has no authentication. Keep the library API
    // explicitly owner-scoped so an authenticated host can replace this
    // adapter without changing the storage boundary.
    return String(req.headers['x-classcore-user-id'] ?? 'demo-teacher').trim() || 'demo-teacher';
}
function readRequestBody(req, maxBytes = 128 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(new PresentationLibraryError('request-body-too-large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}
function apiError(res, error) {
    if (error instanceof PresentationLibraryError) {
        const status = error.code === 'draft-conflict' ? 409 : error.code.endsWith('not-found') || error.code === 'asset-not-found' ? 404 : error.code === 'owner-required' ? 401 : 400;
        return sendJson(res, status, { error: error.code, details: error.details ?? null });
    }
    console.error('PRESENTATION_API_ERROR', error);
    return sendJson(res, 500, { error: 'presentation-api-failed' });
}
async function handlePresentationApi(req, res, url) {
    const ownerUserId = requestOwner(req);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    try {
        if (req.method === 'POST' && parts.length === 2 && parts[1] === 'presentation-assets') {
            const asset = presentationLibrary.ingestAsset(ownerUserId, {
                bytes: await readRequestBody(req, presentationLibrary.policy.maxPresentationFileBytes),
                mimeType: String(req.headers['content-type'] ?? 'application/octet-stream'),
            });
            return sendJson(res, 201, { asset: { assetId: asset.assetId, sha256: asset.sha256, size: asset.size } });
        }
        if (req.method === 'GET' && parts.length === 3 && parts[1] === 'presentation-assets') {
            const asset = presentationLibrary.getOwnedAsset(parts[2], ownerUserId);
            if (!asset) return sendJson(res, 404, { error: 'asset-not-found' });
            const bytes = presentationLibrary.getAssetBytes(asset.assetId);
            res.writeHead(200, { 'content-type': asset.mimeType, 'content-length': bytes.length, 'x-content-sha256': asset.sha256, 'cache-control': 'no-store' });
            return res.end(bytes);
        }
        if (parts[1] === 'sessions' && parts.length >= 4 && parts[3] === 'presentation-runtime') {
            const sessionId = parts[2];
            const resolved = resolveAuthoritativePresentationState(sessionId);
            if (parts[4] === 'asset') {
                if (!resolved) return sendJson(res, 410, { error: 'session-ended' });
                const cached = presentationLibrary.getPreparedRuntimeAsset(resolved.pin.assetId);
                const bytes = fs.readFileSync(cached.cachePath);
                res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'content-length': bytes.length, 'x-content-sha256': resolved.revision.fingerprint, 'cache-control': 'no-store' });
                return res.end(bytes);
            }
            if (req.method === 'GET') return sendJson(res, 200, { runtime: resolved ? { pin: resolved.pin, revision: resolved.revision, state: resolved.state } : null });
        }
        if (parts[1] === 'sessions' && parts.length >= 3) {
            const sessionId = parts[2];
            if (req.method === 'GET' && parts[3] === 'presentation-lifecycle') return sendJson(res, 200, { session: presentationLibrary.ensureSession(sessionId) });
            if (req.method === 'POST' && parts[3] === 'presentation-lifecycle') {
                const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString('utf8') || '{}');
                return sendJson(res, 200, { session: presentationLibrary.setSessionLifecycle(sessionId, body.status) });
            }
            if (req.method === 'GET' && parts[3] === 'presentation-pin') return sendJson(res, 200, { pin: presentationLibrary.getSessionPin(sessionId) });
            if (req.method === 'PUT' && parts[3] === 'presentation-pin') {
                const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString('utf8') || '{}');
                return sendJson(res, 200, { pin: presentationLibrary.pinSession(sessionId, ownerUserId, body) });
            }
            if (req.method === 'POST' && parts[3] === 'presentation-prepare') {
                const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString('utf8') || '{}');
                const prepared = body.presentationId
                    ? await presentationLibrary.prepareClassroom(sessionId, ownerUserId, body)
                    : presentationLibrary.prepareRuntimeCache(sessionId, ownerUserId, body);
                return sendJson(res, 200, { prepared });
            }
            if (req.method === 'POST' && parts[3] === 'presentation-switch') {
                const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString('utf8') || '{}');
                const oldPin = presentationLibrary.getSessionPin(sessionId);
                const oldPlayback = store.loadPresentationPlayback(sessionId);
                try {
                    const pin = presentationLibrary.switchSessionPresentationRevision(sessionId, ownerUserId, body);
                    const revision = presentationLibrary.getRevision(pin.revisionId, ownerUserId);
                    const first = revision?.runtimeIndex?.scenes?.[0];
                    if (!first) throw new PresentationLibraryError('presentation-runtime-index-empty');
                    const state = { sessionId, presentationRevisionId: pin.revisionId, assetId: pin.assetId, deckId: revision.runtimeIndex.deckId, sceneId: first.sceneId, step: 0, playState: 'idle', revision: 0 };
                    store.savePresentationPlayback(state);
                    broadcastPresentationSync(sessionId, state, { reason: 'revision-switch' });
                    return sendJson(res, 200, { pin, state });
                } catch (error) {
                    presentationLibrary.restoreSessionPin(sessionId, oldPin);
                    if (oldPlayback) store.savePresentationPlayback(oldPlayback);
                    else store.db.prepare('DELETE FROM state_json WHERE session_id=? AND kind=?').run(sessionId, 'presentation-playback');
                    throw error;
                }
            }
            return sendJson(res, 404, { error: 'not-found' });
        }
        if (req.method === 'GET' && parts.length === 2 && parts[1] === 'presentations')
            return sendJson(res, 200, { presentations: presentationLibrary.listPresentations(ownerUserId) });
        if (req.method === 'GET' && parts.length === 2 && parts[1] === 'classroom-blocks')
            return sendJson(res, 200, { blocks: presentationLibrary.listClassroomBlocks(ownerUserId) });
        if (req.method === 'POST' && parts.length === 2 && parts[1] === 'classroom-blocks') {
            const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString('utf8') || '{}');
            return sendJson(res, 201, { block: presentationLibrary.bindClassroomBlock(ownerUserId, body) });
        }
        if (req.method === 'POST' && parts.length === 2 && parts[1] === 'presentations') {
            const body = JSON.parse((await readRequestBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}');
            const template = path.join(publicDir, 'assets', 'presentation-webppt-blank.pptx');
            const bytes = body.bytesBase64 ? Buffer.from(body.bytesBase64, 'base64') : (!body.assetId && fs.existsSync(template) ? fs.readFileSync(template) : null);
            const idPrefix = body.document?.idPrefix ?? `classcore-${crypto.randomUUID()}`;
            const document = body.document ?? { format: 'web-ppt-ooxml-v1', idPrefix, deckId: `deck-${idPrefix}` };
            if (!body.assetId && !bytes?.length) throw new PresentationLibraryError('presentation-bytes-required');
            return sendJson(res, 201, { presentation: presentationLibrary.createPresentation({ ownerUserId, title: body.title, assetId: body.assetId, bytes, mimeType: body.mimeType ?? 'application/vnd.openxmlformats-officedocument.presentationml.presentation', document }) });
        }
        if (parts[1] !== 'presentations' || parts.length < 3) return sendJson(res, 404, { error: 'not-found' });
        const presentationId = parts[2];
        if (req.method === 'GET' && parts.length === 3) return sendJson(res, 200, { presentation: presentationLibrary.getPresentation(presentationId, ownerUserId) });
        if (req.method === 'POST' && parts[3] === 'duplicate') {
            const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString('utf8') || '{}');
            const local = body.bytesBase64 ? { bytes: Buffer.from(body.bytesBase64, 'base64'), mimeType: body.mimeType, document: body.document } : undefined;
            return sendJson(res, 201, { presentation: presentationLibrary.duplicatePresentation(presentationId, ownerUserId, body.title, local) });
        }
        if (req.method === 'PATCH' && parts.length === 3) {
            const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString('utf8') || '{}');
            return sendJson(res, 200, { presentation: presentationLibrary.renamePresentation(presentationId, ownerUserId, body.title) });
        }
        if (req.method === 'DELETE' && parts.length === 3) return sendJson(res, 200, { presentation: presentationLibrary.softDeletePresentation(presentationId, ownerUserId) });
        if (req.method === 'GET' && parts[3] === 'draft') {
            const draft = presentationLibrary.loadDraft(presentationId, ownerUserId);
            if (url.searchParams.get('download') === '1') {
                res.writeHead(200, { 'content-type': draft.asset.mimeType, 'content-length': draft.bytes.length, 'etag': String(draft.project.currentDraftRevision), 'x-content-sha256': draft.asset.sha256, 'cache-control': 'no-store' });
                return res.end(draft.bytes);
            }
            return sendJson(res, 200, { project: draft.project, asset: draft.asset });
        }
        if (req.method === 'PUT' && parts[3] === 'draft') {
            const document = req.headers['x-presentation-document'] ? JSON.parse(String(req.headers['x-presentation-document'])) : undefined;
            const bytes = await readRequestBody(req, presentationLibrary.policy.maxPresentationFileBytes);
            const expectedRevision = req.headers['if-match'] ? Number(req.headers['if-match']) : undefined;
            return sendJson(res, 200, { presentation: presentationLibrary.saveDraft(presentationId, ownerUserId, { bytes, mimeType: String(req.headers['content-type'] ?? 'application/octet-stream'), document, expectedRevision }) });
        }
        if (req.method === 'GET' && parts[3] === 'revisions') return sendJson(res, 200, { revisions: presentationLibrary.listRevisions(presentationId, ownerUserId, { kind: url.searchParams.get('kind') }) });
        if (req.method === 'POST' && parts[3] === 'rehearsals') {
            const body = JSON.parse((await readRequestBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}');
            return sendJson(res, 201, { revision: await presentationLibrary.createTrustedRevision(presentationId, ownerUserId, { ...body, kind: 'rehearsal' }) });
        }
        if (req.method === 'POST' && parts[3] === 'rehearsal-session') {
            const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString('utf8') || '{}');
            return sendJson(res, 201, { rehearsal: await presentationLibrary.startRehearsalSession(presentationId, ownerUserId, body) });
        }
        if (req.method === 'POST' && parts[3] === 'published') {
            const body = JSON.parse((await readRequestBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}');
            const revision = process.env.NODE_ENV === 'test' && !body.engine && !body.document && body.runtimeIndex
                ? presentationLibrary.createSyntheticRevisionForTest(presentationId, ownerUserId, { ...body, kind: 'published' })
                : await presentationLibrary.createTrustedRevision(presentationId, ownerUserId, { ...body, kind: 'published' });
            return sendJson(res, 201, { revision });
        }
        if (req.method === 'POST' && parts[3] === 'revisions' && parts[5] === 'restore') {
            const expectedRevision = req.headers['if-match'] ? Number(req.headers['if-match']) : undefined;
            return sendJson(res, 200, { presentation: presentationLibrary.restoreRevision(presentationId, ownerUserId, parts[4], expectedRevision) });
        }
        if (req.method === 'POST' && parts[3] === 'restore-original') {
            const expectedRevision = req.headers['if-match'] ? Number(req.headers['if-match']) : undefined;
            return sendJson(res, 200, { presentation: presentationLibrary.restoreOriginal(presentationId, ownerUserId, expectedRevision) });
        }
        return sendJson(res, 404, { error: 'not-found' });
    } catch (error) {
        return apiError(res, error);
    }
}
function getContentType(file) {
    if (file.endsWith('.html'))
        return 'text/html; charset=utf-8';
    if (file.endsWith('.js'))
        return 'text/javascript; charset=utf-8';
    if (file.endsWith('.json'))
        return 'application/json; charset=utf-8';
    return 'application/octet-stream';
}
function serveFile(res, file) {
    const resolved = path.resolve(file);
    const publicRoot = path.resolve(publicDir) + path.sep;
    if (!resolved.startsWith(publicRoot))
        return false;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())
        return false;
    const body = fs.readFileSync(resolved);
    res.writeHead(200, {
        'content-type': getContentType(resolved),
        'content-length': body.length,
        'cache-control': 'no-store',
    });
    res.end(body);
    return true;
}
function serveAsset(reqUrl, res, allowedPrefixes) {
    if (!reqUrl.pathname.startsWith('/assets/'))
        return false;
    const relativeAsset = reqUrl.pathname.slice('/assets/'.length);
    if (!allowedPrefixes.some((prefix) => relativeAsset.startsWith(prefix))) {
        sendJson(res, 404, { error: 'asset-not-found' });
        return true;
    }
    if (serveFile(res, path.join(publicDir, 'assets', relativeAsset)))
        return true;
    sendJson(res, 404, { error: 'asset-not-found' });
    return true;
}
const sharedBrowserAssetPrefixes = ['packages/applet-sdk/', 'packages/surfaces/', 'packages/transform-board/', 'packages/classroom-client/'];
const classroomAssetPrefixes = [
    ...sharedBrowserAssetPrefixes,
    'apps/student-web/',
    'apps/teacher-web/',
    'apps/display-web/',
    'apps/observer-web/',
];
const localToolsAssetPrefixes = [
    ...sharedBrowserAssetPrefixes,
    'apps/backstage/',
    'apps/presentation-studio/',
    'presentation-webppt-blank.pptx',
];
const classroomSurfaceRoutes = new Set(['student', 'teacher', 'display', 'observer']);
const localToolSurfaceRoutes = new Set(['backstage', 'authoring']);
const classroomServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://classroom.local');
    if (url.pathname.startsWith('/api/')) return void handlePresentationApi(req, res, url);
    if (url.pathname === '/healthz') {
        return sendJson(res, 200, {
            ok: true,
            service: 'classroom-server',
            revision: 'R3.10',
            runtime: runtimeMode,
            arch: process.arch,
            platform: process.platform,
        });
    }
    if (url.pathname === '/readyz') {
        return sendJson(res, 200, {
            transportReady: true,
            productReady,
            runtimeMode,
            authentication,
            sqlite: true,
            websocket: true,
            webShells: fs.existsSync(path.join(publicDir, 'student', 'index.html')),
        });
    }
    if (url.pathname === '/metrics')
        return sendJson(res, 200, { ...stats, persisted: store.transportCounts() });
    if (serveAsset(url, res, classroomAssetPrefixes))
        return;
    const route = url.pathname.replace(/^\/+|\/+$/g, '');
    if (classroomSurfaceRoutes.has(route)) {
        if (serveFile(res, path.join(publicDir, route, 'index.html')))
            return;
        return sendJson(res, 503, { error: 'web-shell-not-built', hint: 'run npm run build' });
    }
    if (localToolSurfaceRoutes.has(route)) {
        return sendJson(res, 404, { error: 'local-tool-on-separate-host-only-port', localToolsPort });
    }
    if (route === 'simulation') {
        return sendJson(res, 404, { error: 'simulation-is-development-only' });
    }
    if (url.pathname === '/') {
        return sendJson(res, 200, {
            name: '课堂运行时服务',
            revision: 'R3.10',
            surfaces: [...classroomSurfaceRoutes].map((surface) => `/${surface}`),
            localTools: { port: localToolsPort, paths: ['/backstage', '/authoring'], hostOnly: true },
            health: '/healthz',
            websocket: '/ws',
        });
    }
    return sendJson(res, 404, { error: 'not-found' });
});
const localToolsServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://backstage.local');
    if (url.pathname.startsWith('/api/')) return void handlePresentationApi(req, res, url);
    if (url.pathname === '/healthz') {
        return sendJson(res, 200, { ok: true, service: 'classroom-local-tools', revision: 'R3.10' });
    }
    if (serveAsset(url, res, localToolsAssetPrefixes))
        return;
    const route = url.pathname.replace(/^\/+|\/+$/g, '');
    if (route === '' || localToolSurfaceRoutes.has(route)) {
        const surface = route || 'backstage';
        if (serveFile(res, path.join(publicDir, surface, 'index.html')))
            return;
        return sendJson(res, 503, { error: 'web-shell-not-built', hint: 'run npm run build' });
    }
    if (route === 'simulation')
        return sendJson(res, 404, { error: 'simulation-is-development-only' });
    return sendJson(res, 404, { error: 'not-found' });
});
classroomServer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') {
        socket.destroy();
        return;
    }
    let meta = { role: 'unknown', sessionId: 'session:load', clientId: 'unknown', subscribed: false };
    let record = null;
    let helloAccepted = false;
    const connection = acceptWebSocketUpgrade(req, socket, head, (text, ws) => {
        stats.messages++;
        let message;
        try {
            message = JSON.parse(text);
        }
        catch {
            ws.send({ type: 'error', code: 'invalid-json' });
            return;
        }
        if (message.type === 'hello') {
            if (helloAccepted) {
                ws.send({ type: 'error', code: 'hello-already-accepted' });
                return;
            }
            const role = String(message.role ?? 'unknown');
            const sessionId = String(message.sessionId ?? '').trim();
            const clientId = String(message.clientId ?? '').trim();
            const allowedRoles = new Set(['student', 'teacher', 'observer', 'display']);
            if (!allowedRoles.has(role)) {
                ws.send({ type: 'hello.ack', ok: false, reason: 'unsupported-role' });
                ws.close(1008, 'unsupported-role');
                return;
            }
            if (!sessionId || !clientId) {
                ws.send({ type: 'hello.ack', ok: false, reason: 'identity-required' });
                ws.close(1008, 'identity-required');
                return;
            }
            const participantId = String(message.participantId ?? clientId).trim();
            meta = { role, sessionId, clientId, participantId, subscribed: role === 'display' };
            if (role === 'student')
                stats.students++;
            else if (role === 'observer')
                stats.observers++;
            else if (role === 'teacher')
                stats.teachers++;
            else if (role === 'display')
                stats.display++;
            if (role === 'teacher') acquireTeacherLease(meta);
            helloAccepted = true;
            ws.send({ type: 'hello.ack', ok: true, clientId });
            if (role === 'display' || role === 'observer') {
                try {
                    const resolved = resolveAuthoritativePresentationState(sessionId);
                    if (resolved) ws.send({ type: 'presentation.sync', state: resolved.state, reason: 'reconnect' });
                } catch (error) {
                    ws.send({ type: 'presentation.sync', state: null, reason: error instanceof Error ? error.message : String(error) });
                }
            }
            return;
        }
        if (!helloAccepted) {
            ws.send({ type: 'error', code: 'hello-required' });
            return;
        }
        if (message.type === 'student.event') {
            if (meta.role !== 'student') {
                ws.send({ type: 'event.ack', ok: false, reason: 'student-role-required' });
                return;
            }
            const eventId = String(message.eventId ?? '');
            if (!eventId) {
                ws.send({ type: 'event.ack', ok: false, reason: 'event-id-required' });
                return;
            }
            try {
                const accepted = store.acceptTransportEvent(meta.sessionId, eventId, message);
                ws.send({ type: 'event.ack', ok: true, eventId, duplicate: !accepted.inserted, serverSeq: accepted.serverSeq });
            } catch (error) {
                if (error instanceof Error && error.message.startsWith('transport-id-payload-mismatch:')) {
                    ws.send({ type: 'event.ack', ok: false, eventId, duplicate: false, reason: 'event-id-reused-with-different-payload' });
                    return;
                }
                throw error;
            }
            return;
        }
        if (message.type === 'teacher.control') {
            if (meta.role !== 'teacher') {
                ws.send({ type: 'control.ack', ok: false, reason: 'teacher-role-required' });
                return;
            }
            const controlId = String(message.controlId ?? '');
            if (!controlId) {
                ws.send({ type: 'control.ack', ok: false, reason: 'control-id-required' });
                return;
            }
            let accepted;
            try {
                accepted = store.acceptTransportControl(meta.sessionId, controlId, message);
            } catch (error) {
                if (error instanceof Error && error.message.startsWith('transport-id-payload-mismatch:')) {
                    ws.send({ type: 'control.ack', ok: false, controlId, duplicate: false, reason: 'control-id-reused-with-different-payload' });
                    return;
                }
                throw error;
            }
            ws.send({ type: 'control.ack', ok: true, controlId, duplicate: !accepted.inserted, serverSeq: accepted.serverSeq });
            if (!accepted.inserted)
                return;
            const frame = { type: 'stage.sync', revision: accepted.serverSeq, controlId };
            for (const item of clients) {
                const sameSession = item.meta.sessionId === meta.sessionId;
                const publicViewer = item.meta.role === 'display' || (item.meta.role === 'observer' && item.meta.subscribed);
                if (!sameSession || !publicViewer)
                    continue;
                if (item.ws.bufferedBytes() > observerMaxBufferedBytes) {
                    stats.stageDrops++;
                    continue;
                }
                item.ws.send(frame);
                stats.stageBroadcasts++;
            }
            return;
        }
        if (message.type === 'teacher.heartbeat') {
            if (meta.role !== 'teacher') {
                ws.send({ type: 'teacher.heartbeat.ack', ok: false, reason: 'teacher-role-required' });
                return;
            }
            const renewed = renewTeacherLease(meta);
            ws.send({ type: 'teacher.heartbeat.ack', ok: Boolean(renewed), expiresAt: renewed?.expiresAt ?? null, reason: renewed ? undefined : controllerLeaseReason(meta) });
            return;
        }
        if (message.type === 'presentation.control') {
            if (meta.role !== 'teacher') {
                ws.send({ type: 'presentation.control.ack', ok: false, reason: 'teacher-role-required' });
                return;
            }
            const controlId = String(message.controlId ?? '');
            if (!controlId) {
                ws.send({ type: 'presentation.control.ack', ok: false, reason: 'control-id-required' });
                return;
            }
            const leaseReason = controllerLeaseReason(meta);
            if (leaseReason) {
                ws.send({ type: 'presentation.control.ack', ok: false, controlId, duplicate: false, reason: leaseReason });
                return;
            }
            try {
                const accepted = store.acceptPresentationControl(meta.sessionId, controlId, message, () => ({ state: applyPresentationTransportControl(meta.sessionId, message) }));
                if (!accepted.outcome?.ok) {
                    ws.send({ type: 'presentation.control.ack', ok: false, controlId, duplicate: !accepted.inserted, serverSeq: accepted.serverSeq, reason: accepted.outcome?.reason ?? 'presentation-control-failed' });
                    return;
                }
                const state = accepted.outcome.value.state;
                ws.send({ type: 'presentation.control.ack', ok: true, controlId, duplicate: !accepted.inserted, serverSeq: accepted.serverSeq, state });
                if (!accepted.inserted) return;
                broadcastPresentationSync(meta.sessionId, state, { controlId });
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                ws.send({ type: 'presentation.control.ack', ok: false, controlId, reason });
            }
            return;
        }
        if (message.type === 'observer.subscribe') {
            if (meta.role !== 'observer') {
                ws.send({ type: 'observer.subscribe.ack', ok: false, reason: 'observer-role-required' });
                return;
            }
            meta = { ...meta, subscribed: true };
            ws.send({ type: 'observer.subscribe.ack', ok: true });
            return;
        }
        if (message.type === 'ping') {
            ws.send({ type: 'pong', at: Date.now() });
            return;
        }
        ws.send({ type: 'error', code: 'unknown-message' });
    }, () => {
        if (record)
            clients.delete(record);
        stats.connections = Math.max(0, stats.connections - 1);
        if (helloAccepted) {
            if (meta.role === 'student')
                stats.students = Math.max(0, stats.students - 1);
            else if (meta.role === 'observer')
                stats.observers = Math.max(0, stats.observers - 1);
            else if (meta.role === 'teacher')
                stats.teachers = Math.max(0, stats.teachers - 1);
            else if (meta.role === 'display')
                stats.display = Math.max(0, stats.display - 1);
            if (meta.role === 'teacher') {
                const lease = store.loadControllerLease(meta.sessionId);
                if (lease?.holderConnectionId === meta.clientId && lease.holderParticipantId === meta.participantId) {
                    const disconnectedAt = Date.now();
                    store.saveControllerLease({ ...lease, disconnectedAt, graceUntil: disconnectedAt + controllerLeaseGraceMs, expiresAt: Math.min(lease.expiresAt ?? disconnectedAt + controllerLeaseDurationMs, disconnectedAt + controllerLeaseGraceMs) });
                }
            }
        }
    }, { maxMessageBytes: maxWebSocketMessageBytes });
    if (!connection)
        return;
    record = { ws: connection, get meta() { return meta; } };
    clients.add(record);
    stats.connections++;
});
let shuttingDown = false;
function shutdown() {
    if (shuttingDown)
        return;
    shuttingDown = true;
    for (const client of clients) {
        try {
            client.ws.close();
        }
        catch { }
    }
    let remaining = 2;
    const closed = () => {
        remaining--;
    if (remaining === 0) {
            presentationMaintenance.stop();
            store.close();
            presentationLibrary.close();
            process.exit(0);
        }
    };
    classroomServer.close(closed);
    localToolsServer.close(closed);
    setTimeout(() => process.exit(1), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
localToolsServer.listen(localToolsPort, localToolsHost, () => {
    console.log(`LOCAL_TOOLS_SERVER_READY http://${localToolsHost}:${localToolsPort}/backstage`);
});
classroomServer.listen(port, host, () => {
    console.log(`CLASSROOM_SERVER_READY http://${host}:${port}`);
});
