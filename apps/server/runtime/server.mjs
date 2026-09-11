import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteClassroomStateStore } from './sqlite-store.mjs';
import { acceptWebSocketUpgrade } from './websocket.mjs';
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
const port = readPositiveInt('PORT', 8787, { max: 65535 });
const defaultLocalToolsPort = port < 65535 ? port + 1 : 8788;
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
const runtimeMode = process.env.CLASSROOM_RUNTIME_MODE ?? 'reference-transport';
const authentication = process.env.CLASSROOM_AUTHENTICATION === 'true';
const productReady = process.env.CLASSROOM_PRODUCT_READY === 'true';
if (runtimeMode !== 'reference-transport' || authentication || productReady) {
    throw new Error('unsupported-runtime-mode: authenticated-classroom-server is not implemented; reference-transport requires CLASSROOM_AUTHENTICATION=false and CLASSROOM_PRODUCT_READY=false');
}
const store = new SqliteClassroomStateStore(path.join(dataDir, 'classroom.sqlite'));
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
};
function sendJson(res, status, value) {
    const body = JSON.stringify(value);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
    });
    res.end(body);
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
const sharedBrowserAssetPrefixes = ['packages/surfaces/'];
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
];
const classroomSurfaceRoutes = new Set(['student', 'teacher', 'display', 'observer']);
const localToolSurfaceRoutes = new Set(['backstage', 'authoring']);
const classroomServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://classroom.local');
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
            meta = { role, sessionId, clientId, subscribed: role === 'display' };
            if (role === 'student')
                stats.students++;
            else if (role === 'observer')
                stats.observers++;
            else if (role === 'teacher')
                stats.teachers++;
            else if (role === 'display')
                stats.display++;
            helloAccepted = true;
            ws.send({ type: 'hello.ack', ok: true, clientId });
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
            store.close();
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
