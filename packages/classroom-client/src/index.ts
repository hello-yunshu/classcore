import type {
    ActivityDefinition,
    AppletInstanceRef,
    AppletStateSnapshot,
    ClientAppletEvent,
    ClientCapabilityReport,
    EventAck,
    JoinGrant,
    JoinRequest,
    LiveStateFrame,
    ServerHello,
    StudentSelfProjection,
} from '@classroom/contracts';

export interface ClassroomClientJoinResponse {
    grant: JoinGrant;
    serverHello?: Partial<ServerHello> | null;
    self?: { participantId: string; displayName: string; seatNo?: string | null } | null;
    currentActivity?: ClassroomCurrentActivity | null;
    snapshots?: AppletStateSnapshot[];
}

export interface OutboxEventRecord {
    kind: 'applet-event';
    clientEventId: string;
    event: ClientAppletEvent;
    createdAt: string;
}

export interface OutboxSubmissionRecord {
    kind: 'submission';
    clientEventId: string;
    payload: Record<string, unknown>;
    createdAt: string;
}

export interface OutboxSnapshotRecord {
    kind: 'snapshot';
    clientEventId: string;
    snapshot: AppletStateSnapshot;
    createdAt: string;
}

export type OutboxRecord = OutboxEventRecord | OutboxSubmissionRecord | OutboxSnapshotRecord;

export interface ClassroomAppletDescriptor {
    instance: AppletInstanceRef;
    config: Record<string, unknown>;
}

export interface ClassroomCurrentActivity {
    sessionId: string;
    lessonId: string;
    lessonTitle?: string | null;
    activity: ActivityDefinition;
    applets: ClassroomAppletDescriptor[];
}

export interface OutboxStore {
    list(): Promise<OutboxRecord[]>;
    put(record: OutboxRecord): Promise<void>;
    remove(clientEventId: string): Promise<void>;
}

export class MemoryOutboxStore implements OutboxStore {
    #records = new Map<string, OutboxRecord>();

    async list(): Promise<OutboxRecord[]> { return [...this.#records.values()].map(record => structuredClone(record)); }
    async put(record: OutboxRecord): Promise<void> { this.#records.set(record.clientEventId, structuredClone(record)); }
    async remove(clientEventId: string): Promise<void> { this.#records.delete(clientEventId); }
}

export class IndexedDbOutboxStore implements OutboxStore {
    #database: Promise<IDBDatabase>;

    constructor(databaseName = 'classcore.student', storeName = 'outbox') {
        this.#database = new Promise((resolve, reject) => {
            const request = globalThis.indexedDB?.open(databaseName, 1);
            if (!request) {
                reject(new Error('indexeddb-unavailable'));
                return;
            }
            request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'clientEventId' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('indexeddb-open-failed'));
        });
        this.storeName = storeName;
    }

    private readonly storeName: string;

    async list(): Promise<OutboxRecord[]> {
        const database = await this.#database;
        return new Promise((resolve, reject) => {
            const request = database.transaction(this.storeName, 'readonly').objectStore(this.storeName).getAll();
            request.onsuccess = () => resolve(request.result as OutboxRecord[]);
            request.onerror = () => reject(request.error ?? new Error('indexeddb-read-failed'));
        });
    }

    async put(record: OutboxRecord): Promise<void> {
        const database = await this.#database;
        await new Promise<void>((resolve, reject) => {
            const request = database.transaction(this.storeName, 'readwrite').objectStore(this.storeName).put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error ?? new Error('indexeddb-write-failed'));
        });
    }

    async remove(clientEventId: string): Promise<void> {
        const database = await this.#database;
        await new Promise<void>((resolve, reject) => {
            const request = database.transaction(this.storeName, 'readwrite').objectStore(this.storeName).delete(clientEventId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error ?? new Error('indexeddb-delete-failed'));
        });
    }
}

export interface ClassroomWebSocket {
    readonly readyState: number;
    send(data: string): void;
    close(): void;
    addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: any) => void): void;
}

export interface ClassroomClientOptions {
    baseUrl?: string;
    fetchFn?: typeof fetch;
    socketFactory?: (url: string) => ClassroomWebSocket;
    outbox?: OutboxStore;
    clientBuild?: string;
    capabilities?: Partial<ClientCapabilityReport>;
    idFactory?: () => string;
    now?: () => string;
    reconnectDelayMs?: number;
    sessionStorageKey?: string;
}

export type ClassroomConnectedListener = (hello: ServerHello) => void;

export interface QueueEventInput {
    appletInstanceId: string;
    appletEventSchemaVersion: number;
    streamId: string;
    type: string;
    payload: Record<string, unknown>;
    clientMonotonicTime?: number | null;
}

export interface QueueSnapshotInput {
    snapshot: AppletStateSnapshot;
}

export interface ClassroomClientState {
    connection: 'offline' | 'connecting' | 'online';
    grant: JoinGrant | null;
    serverHello: ServerHello | null;
    self: StudentSelfProjection | null;
    pendingCount: number;
    lastError: string | null;
    currentActivity: ClassroomCurrentActivity | null;
    snapshots: Record<string, AppletStateSnapshot>;
    liveStates: Record<string, LiveStateFrame>;
}

function createId(prefix: string, idFactory: () => string): string { return `${prefix}:${idFactory()}`; }

function defaultIdFactory(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultCapabilities(): ClientCapabilityReport {
    const browserNavigator = globalThis.navigator;
    return {
        capabilityReportVersion: 1,
        secureContext: globalThis.isSecureContext === true,
        indexedDb: typeof globalThis.indexedDB !== 'undefined',
        pointerEvents: typeof globalThis.PointerEvent !== 'undefined',
        webWorkers: typeof globalThis.Worker !== 'undefined',
        webSocket: typeof globalThis.WebSocket !== 'undefined',
        offscreenCanvas: typeof globalThis.OffscreenCanvas !== 'undefined',
        serviceWorker: browserNavigator ? 'serviceWorker' in browserNavigator : false,
        maxTouchPoints: browserNavigator?.maxTouchPoints ?? null,
        deviceMemoryGb: (browserNavigator as Navigator & { deviceMemory?: number } | undefined)?.deviceMemory ?? null,
        userAgentFamily: browserNavigator?.userAgent ?? null,
    };
}

function defaultOutbox(): OutboxStore {
    return typeof globalThis.indexedDB === 'undefined' ? new MemoryOutboxStore() : new IndexedDbOutboxStore();
}

function websocketUrl(baseUrl: string): string {
    const url = new URL('/ws', baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
}

export class ClassroomClient {
    #fetch: typeof fetch;
    #socketFactory: (url: string) => ClassroomWebSocket;
    #outbox: OutboxStore;
    #idFactory: () => string;
    #now: () => string;
    #options: Required<Pick<ClassroomClientOptions, 'clientBuild'>> & { capabilities: ClientCapabilityReport };
    #socket: ClassroomWebSocket | null = null;
    #joinRequest: JoinRequest | null = null;
    #state: ClassroomClientState = { connection: 'offline', grant: null, serverHello: null, self: null, pendingCount: 0, lastError: null, currentActivity: null, snapshots: {}, liveStates: {} };
    #eventListeners = new Set<(message: Record<string, unknown>) => void>();
    #ackWaiters = new Map<string, { resolve: (ack: EventAck) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    #streamSeq = new Map<string, number>();
    #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    #manualDisconnect = true;
    #reconnectDelayMs: number;
    #sessionStorageKey: string;
    #connectedListeners = new Set<ClassroomConnectedListener>();

    constructor(options: ClassroomClientOptions = {}) {
        this.#fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
        this.#socketFactory = options.socketFactory ?? ((url) => new globalThis.WebSocket(url));
        this.#outbox = options.outbox ?? defaultOutbox();
        this.#idFactory = options.idFactory ?? defaultIdFactory;
        this.#now = options.now ?? (() => new Date().toISOString());
        this.#reconnectDelayMs = options.reconnectDelayMs ?? 500;
        this.#sessionStorageKey = options.sessionStorageKey ?? 'classcore.classroom.join.v1';
        try {
            const raw = globalThis.sessionStorage?.getItem(this.#sessionStorageKey);
            if (raw) this.#joinRequest = JSON.parse(raw) as JoinRequest;
        } catch { /* sessionStorage is optional and may be unavailable in private contexts */ }
        this.#options = {
            clientBuild: options.clientBuild ?? 'student-web-dev',
            capabilities: { ...defaultCapabilities(), ...options.capabilities },
        };
        this.baseUrl = options.baseUrl ?? (typeof location === 'undefined' ? 'http://127.0.0.1:9602' : location.origin);
    }

    readonly baseUrl: string;

    get state(): ClassroomClientState { return structuredClone(this.#state); }
    get grant(): JoinGrant | null { return this.#state.grant ? structuredClone(this.#state.grant) : null; }

    onMessage(listener: (message: Record<string, unknown>) => void): () => void {
        this.#eventListeners.add(listener);
        return () => this.#eventListeners.delete(listener);
    }

    /** Notify richer surfaces after the initial connection and every automatic reconnect. */
    onConnected(listener: ClassroomConnectedListener): () => void {
        this.#connectedListeners.add(listener);
        return () => this.#connectedListeners.delete(listener);
    }

    async join(request: JoinRequest): Promise<ClassroomClientJoinResponse> {
        const response = await this.#fetch(new URL('/api/classroom/join', this.baseUrl), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request),
        });
        const body = await response.json() as ClassroomClientJoinResponse & { error?: string };
        if (!response.ok || !body.grant) throw new Error(body.error ?? 'classroom-join-failed');
        this.#joinRequest = structuredClone(request);
        try { globalThis.sessionStorage?.setItem(this.#sessionStorageKey, JSON.stringify(request)); } catch { /* sessionStorage is best effort */ }
        const snapshots = Object.fromEntries((body.snapshots ?? []).map(snapshot => [snapshot.appletInstanceId, structuredClone(snapshot)]));
        this.#state = {
            ...this.#state,
            grant: structuredClone(body.grant),
            self: body.self ? structuredClone(body.self) : this.#state.self,
            currentActivity: body.currentActivity ? structuredClone(body.currentActivity) : this.#state.currentActivity,
            snapshots: Object.keys(snapshots).length ? { ...this.#state.snapshots, ...snapshots } : this.#state.snapshots,
            lastError: null,
        };
        await this.refreshPendingCount();
        return structuredClone(body);
    }

    async connect(): Promise<ServerHello> {
        if (!this.#state.grant) throw new Error('classroom-join-required');
        if (this.#socket) this.disconnect();
        this.#manualDisconnect = false;
        this.#state = { ...this.#state, connection: 'connecting', lastError: null };
        const socket = this.#socketFactory(websocketUrl(this.baseUrl));
        this.#socket = socket;
        const hello = await new Promise<ServerHello>((resolve, reject) => {
            let settled = false;
            const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                reject(error);
            };
            socket.addEventListener('open', () => socket.send(JSON.stringify({
                type: 'client.hello',
                protocolVersion: 1,
                runtimeApiVersion: 1,
                clientBuild: this.#options.clientBuild,
                accessToken: this.#state.grant?.accessToken,
                capabilityReport: this.#options.capabilities,
            })));
            socket.addEventListener('message', event => {
                const message = JSON.parse(String(event.data)) as Record<string, unknown>;
                this.#receive(message, resolve, fail);
            });
            socket.addEventListener('error', () => fail(new Error('classroom-websocket-error')));
            socket.addEventListener('close', () => {
                this.#socket = null;
                const shouldReconnect = !this.#manualDisconnect && Boolean(this.#joinRequest && this.#state.grant);
                if (this.#state.connection !== 'offline') this.#state = { ...this.#state, connection: 'offline' };
                if (!settled) fail(new Error('classroom-websocket-closed'));
                if (shouldReconnect) this.#scheduleReconnect();
            });
        });
        this.#state = { ...this.#state, connection: 'online', serverHello: structuredClone(hello), lastError: null };
        await this.flushOutbox();
        for (const listener of this.#connectedListeners) listener(structuredClone(hello));
        return structuredClone(hello);
    }

    disconnect(): void {
        this.#manualDisconnect = true;
        if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
        this.#reconnectTimer = null;
        this.#socket?.close();
        this.#socket = null;
        this.#state = { ...this.#state, connection: 'offline' };
    }

    async reconnect(): Promise<ServerHello> {
        if (!this.#joinRequest || !this.#state.grant) throw new Error('classroom-rejoin-required');
        this.#manualDisconnect = false;
        const response = await this.join(this.#joinRequest);
        void response;
        return this.connect();
    }

    async restoreSession(): Promise<ServerHello | null> {
        if (!this.#joinRequest) return null;
        await this.join(this.#joinRequest);
        return this.connect();
    }

    #scheduleReconnect(): void {
        if (this.#reconnectTimer || this.#manualDisconnect || !this.#joinRequest || !this.#state.grant) return;
        this.#reconnectTimer = setTimeout(() => {
            this.#reconnectTimer = null;
            void this.reconnect().catch(() => this.#scheduleReconnect());
        }, this.#reconnectDelayMs);
    }

    async queueEvent(input: QueueEventInput): Promise<string> {
        const record = this.#createEventRecord(input);
        await this.#outbox.put(record);
        await this.refreshPendingCount();
        if (this.#state.connection === 'online') await this.#sendEvent(record);
        return record.clientEventId;
    }

    async emitEvent(input: QueueEventInput): Promise<EventAck> {
        const record = this.#createEventRecord(input);
        await this.#outbox.put(record);
        await this.refreshPendingCount();
        if (this.#state.connection !== 'online') {
            return { clientEventId: record.clientEventId, accepted: false, duplicate: false, error: { code: 'temporary-unavailable', message: 'classroom-offline', retryable: true } };
        }
        return this.#sendEvent(record);
    }

    async queueSubmission(payload: Record<string, unknown>): Promise<string> {
        const clientEventId = createId('client-submission', this.#idFactory);
        await this.#outbox.put({ kind: 'submission', clientEventId, payload: structuredClone(payload), createdAt: this.#now() });
        await this.refreshPendingCount();
        if (this.#state.connection === 'online') await this.#sendSubmission(clientEventId, payload);
        return clientEventId;
    }

    async submit(payload: Record<string, unknown>): Promise<EventAck> {
        const clientEventId = createId('client-submission', this.#idFactory);
        await this.#outbox.put({ kind: 'submission', clientEventId, payload: structuredClone(payload), createdAt: this.#now() });
        await this.refreshPendingCount();
        if (this.#state.connection !== 'online') {
            return { clientEventId, accepted: false, duplicate: false, error: { code: 'temporary-unavailable', message: 'classroom-offline', retryable: true } };
        }
        return this.#sendSubmission(clientEventId, payload);
    }

    async queueSnapshot(input: QueueSnapshotInput): Promise<string> {
        const clientEventId = createId('client-snapshot', this.#idFactory);
        await this.#outbox.put({ kind: 'snapshot', clientEventId, snapshot: structuredClone(input.snapshot), createdAt: this.#now() });
        await this.refreshPendingCount();
        if (this.#state.connection === 'online') await this.#sendSnapshot(clientEventId, input.snapshot);
        return clientEventId;
    }

    publishLiveState(frame: LiveStateFrame): void {
        if (!this.#socket || this.#state.connection !== 'online') return;
        this.#socket.send(JSON.stringify({ type: 'live.state', frame: structuredClone(frame) }));
    }

    /** Send a server-authoritative control message for richer surfaces. */
    sendControl(message: Record<string, unknown>): void {
        if (!this.#socket || this.#state.connection !== 'online') throw new Error('classroom-offline');
        this.#socket.send(JSON.stringify(structuredClone(message)));
    }

    async flushOutbox(): Promise<void> {
        if (this.#state.connection !== 'online') return;
        for (const record of await this.#outbox.list()) {
            if (record.kind === 'applet-event') await this.#sendEvent(record);
            else if (record.kind === 'submission') await this.#sendSubmission(record.clientEventId, record.payload);
            else await this.#sendSnapshot(record.clientEventId, record.snapshot);
        }
    }

    async refreshPendingCount(): Promise<number> {
        const count = (await this.#outbox.list()).length;
        this.#state = { ...this.#state, pendingCount: count };
        for (const listener of this.#eventListeners) listener({ type: 'client.outbox', pendingCount: count });
        return count;
    }

    async #sendEvent(record: OutboxEventRecord): Promise<EventAck> {
        if (!this.#socket || this.#state.connection !== 'online') return { clientEventId: record.clientEventId, accepted: false, duplicate: false, error: { code: 'temporary-unavailable', message: 'classroom-offline', retryable: true } };
        const ack = await this.#request({ type: 'applet.event', event: record.event }, record.clientEventId);
        if (ack.accepted) await this.#outbox.remove(record.clientEventId);
        await this.refreshPendingCount();
        return ack;
    }

    async #sendSubmission(clientEventId: string, payload: Record<string, unknown>): Promise<EventAck> {
        if (!this.#socket || this.#state.connection !== 'online') return { clientEventId, accepted: false, duplicate: false, error: { code: 'temporary-unavailable', message: 'classroom-offline', retryable: true } };
        const ack = await this.#request({ type: 'submission.submit', clientEventId, payload }, clientEventId);
        if (ack.accepted) await this.#outbox.remove(clientEventId);
        await this.refreshPendingCount();
        return ack;
    }

    async #sendSnapshot(clientEventId: string, snapshot: AppletStateSnapshot): Promise<EventAck> {
        if (!this.#socket || this.#state.connection !== 'online') return { clientEventId, accepted: false, duplicate: false, error: { code: 'temporary-unavailable', message: 'classroom-offline', retryable: true } };
        const ack = await this.#request({ type: 'applet.snapshot', clientEventId, snapshot }, clientEventId);
        if (ack.accepted) await this.#outbox.remove(clientEventId);
        await this.refreshPendingCount();
        return ack;
    }

    #createEventRecord(input: QueueEventInput): OutboxEventRecord {
        const streamSeq = (this.#streamSeq.get(input.streamId) ?? 0) + 1;
        this.#streamSeq.set(input.streamId, streamSeq);
        const clientEventId = createId('client-event', this.#idFactory);
        return {
            kind: 'applet-event',
            clientEventId,
            createdAt: this.#now(),
            event: {
                clientEventId,
                eventEnvelopeVersion: 1,
                appletEventSchemaVersion: input.appletEventSchemaVersion,
                appletInstanceId: input.appletInstanceId,
                streamId: input.streamId,
                streamSeq,
                type: input.type,
                payload: structuredClone(input.payload),
                clientMonotonicTime: input.clientMonotonicTime ?? null,
            },
        };
    }

    #request(message: Record<string, unknown>, key: string): Promise<EventAck> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#ackWaiters.delete(key);
                reject(new Error(`classroom-ack-timeout:${key}`));
            }, 5000);
            this.#ackWaiters.set(key, { resolve, reject, timer });
            this.#socket?.send(JSON.stringify(message));
        });
    }

    #receive(message: Record<string, unknown>, resolveHello: (hello: ServerHello) => void, rejectHello: (error: Error) => void): void {
        if (message.type === 'server.hello') {
            if (message.ok === false) {
                rejectHello(new Error(String(message.reason ?? 'classroom-hello-rejected')));
                return;
            }
            resolveHello(message as unknown as ServerHello);
            return;
        }
        if (message.type === 'activity.current' || message.type === 'classroom.activity') {
            const activity = (message.activity ?? message.payload) as ClassroomCurrentActivity | undefined;
            if (activity?.activity && Array.isArray(activity.applets)) {
                this.#state = { ...this.#state, currentActivity: structuredClone(activity) };
            }
        }
        if (message.type === 'applet.snapshot' || message.type === 'snapshot.state') {
            const snapshot = (message.snapshot ?? message.payload) as AppletStateSnapshot | undefined;
            if (snapshot?.appletInstanceId) {
                this.#state = { ...this.#state, snapshots: { ...this.#state.snapshots, [snapshot.appletInstanceId]: structuredClone(snapshot) } };
            }
        }
        if (message.type === 'live.state' || message.type === 'applet.live') {
            const frame = (message.frame ?? message.liveState ?? message.payload) as LiveStateFrame | undefined;
            if (frame?.appletInstanceId) {
                this.#state = { ...this.#state, liveStates: { ...this.#state.liveStates, [frame.appletInstanceId]: structuredClone(frame) } };
            }
        }
        const key = typeof message.clientEventId === 'string' ? message.clientEventId : typeof message.eventId === 'string' ? message.eventId : null;
        if (key && this.#ackWaiters.has(key)) {
            const waiter = this.#ackWaiters.get(key)!;
            this.#ackWaiters.delete(key);
            clearTimeout(waiter.timer);
            if (message.ok === true || message.accepted === true) {
                waiter.resolve({ clientEventId: key, accepted: true, eventId: typeof message.eventId === 'string' ? message.eventId : key, serverSeq: typeof message.serverSeq === 'number' ? message.serverSeq : 0, duplicate: message.duplicate === true, error: null });
            } else {
                waiter.resolve({ clientEventId: key, accepted: false, duplicate: false, error: { code: 'temporary-unavailable', message: String(message.reason ?? 'classroom-message-rejected'), retryable: true } });
            }
        }
        for (const listener of this.#eventListeners) listener(structuredClone(message));
    }
}
