import type { AppletEventIntent, AppletInstanceRef, AppletManifest, AppletViewerContext, ClientAppletEvent, EventAck } from '@classroom/contracts';
export type { AppletManifest };
export interface AppletExecutionContext extends AppletViewerContext {
    sessionId: string;
    lessonId: string;
    activityId: string;
    appletInstanceId: string;
    appletTypeId: string;
    configRef?: string | null;
}
/** Applet-facing API. Transport/envelope identity remains Host-owned. */
export interface AppletHost {
    emitEvent<T extends Record<string, unknown> = Record<string, unknown>>(intent: AppletEventIntent<T>): Promise<EventAck>;
    publishLiveState(payload: Record<string, unknown>): void;
    requestAction<T = unknown>(type: string, payload?: Record<string, unknown>): Promise<T>;
    saveSnapshot(state: Record<string, unknown>): Promise<void>;
    getAsset(assetId: string): Promise<string>;
}
/** Host-side helper: applets never see or manage these sequencing fields. */
export class AppletEventSequencer {
    #seq = 0;
    constructor(private readonly appletInstanceId: string, private readonly eventSchemaVersion: number, private readonly streamId: string, private readonly idFactory: () => string) { }
    next<T extends Record<string, unknown> = Record<string, unknown>>(intent: AppletEventIntent<T>): ClientAppletEvent<T> {
        this.#seq += 1;
        return {
            clientEventId: this.idFactory(),
            eventEnvelopeVersion: 1,
            appletEventSchemaVersion: this.eventSchemaVersion,
            appletInstanceId: this.appletInstanceId,
            streamId: this.streamId,
            streamSeq: this.#seq,
            type: intent.type,
            payload: intent.payload,
            clientMonotonicTime: intent.clientMonotonicTime ?? null,
        };
    }
    get currentSeq(): number { return this.#seq; }
}
export interface AppletCommand {
    type: string;
    payload: Record<string, unknown>;
}
export interface ClassroomApplet<TConfig = Record<string, unknown>, TState = Record<string, unknown>, TSubmission = unknown> {
    readonly manifest: AppletManifest;
    initialize(context: AppletExecutionContext, host: AppletHost): Promise<void> | void;
    load(config: TConfig): Promise<void> | void;
    getState(): TState;
    restoreState(state: TState): Promise<void> | void;
    migrateConfig?(config: unknown, fromVersion: number, toVersion: number): Promise<TConfig> | TConfig;
    migrateState?(state: unknown, fromVersion: number, toVersion: number): Promise<TState> | TState;
    migrateEvent?(type: string, payload: unknown, fromVersion: number, toVersion: number): Promise<{
        type: string;
        payload: Record<string, unknown>;
    }> | {
        type: string;
        payload: Record<string, unknown>;
    };
    pause(): Promise<void> | void;
    resume(): Promise<void> | void;
    submit(): Promise<TSubmission> | TSubmission;
    handleCommand(command: AppletCommand): Promise<void> | void;
    destroy(): Promise<void> | void;
}

export type AppletFactory<TConfig = Record<string, unknown>, TState = Record<string, unknown>, TSubmission = unknown> = () => ClassroomApplet<TConfig, TState, TSubmission>;

export interface AppletRegistryEntry {
    manifest: AppletManifest;
    factory: AppletFactory;
}

/** Server/host owned registry. Lesson packages register types; applets never self-register at runtime. */
export class AppletRegistry {
    #entries = new Map<string, AppletRegistryEntry>();

    register(manifest: AppletManifest, factory: AppletFactory): void {
        if (this.#entries.has(manifest.appletTypeId))
            throw new Error(`duplicate-applet-type:${manifest.appletTypeId}`);
        if (manifest.hostApiVersion !== 1 || !manifest.version || !manifest.appletTypeId)
            throw new Error('invalid-applet-manifest');
        const probe = factory();
        if (probe.manifest.appletTypeId !== manifest.appletTypeId || probe.manifest.version !== manifest.version)
            throw new Error('applet-manifest-mismatch');
        this.#entries.set(manifest.appletTypeId, { manifest: structuredClone(manifest), factory });
    }

    resolve(appletTypeId: string, requiredVersion?: string): AppletRegistryEntry {
        const entry = this.#entries.get(appletTypeId);
        if (!entry)
            throw new Error(`applet-type-not-found:${appletTypeId}`);
        if (requiredVersion && !compatibleMajorVersion(entry.manifest.version, requiredVersion))
            throw new Error('applet-version-incompatible');
        return entry;
    }

    has(appletTypeId: string): boolean { return this.#entries.has(appletTypeId); }
    list(): AppletManifest[] { return [...this.#entries.values()].map(item => structuredClone(item.manifest)); }
}

function compatibleMajorVersion(actual: string, requested: string): boolean {
    const actualMajor = Number.parseInt(actual.replace(/^v/, '').split('.')[0] ?? '', 10);
    const requestedMajor = Number.parseInt(requested.replace(/^v/, '').split('.')[0] ?? '', 10);
    return Number.isFinite(actualMajor) && Number.isFinite(requestedMajor) && actualMajor === requestedMajor;
}

export type AppletHostRuntimeStatus = 'created' | 'ready' | 'running' | 'paused' | 'destroyed';
export interface AppletHostRuntimeOptions<TConfig extends Record<string, unknown> = Record<string, unknown>, TState extends Record<string, unknown> = Record<string, unknown>> {
    registry: AppletRegistry;
    instance: AppletInstanceRef;
    config: TConfig;
    context: AppletExecutionContext;
    host: AppletHost;
    availableCapabilities?: Set<string>;
    snapshot?: { stateSchemaVersion: number; state: TState } | null;
}

/** Lifecycle owner for a single AppletInstance. Transport, persistence and identity stay outside the applet. */
export class AppletHostRuntime<TConfig extends Record<string, unknown> = Record<string, unknown>, TState extends Record<string, unknown> = Record<string, unknown>> {
    #status: AppletHostRuntimeStatus = 'created';
    #applet: ClassroomApplet<TConfig, TState> | null = null;
    readonly manifest: AppletManifest;

    constructor(private readonly options: AppletHostRuntimeOptions<TConfig, TState>) {
        const entry = options.registry.resolve(options.instance.appletTypeId);
        const requiredCapabilities = new Set([
            ...(entry.manifest.requiredPlatformCapabilities ?? []),
            ...(options.instance.requiredCapabilities ?? []),
        ]);
        const missing = [...requiredCapabilities].filter(capability => !(options.availableCapabilities ?? new Set()).has(capability));
        if (missing.length)
            throw new Error(`platform-capability-missing:${missing.join(',')}`);
        this.manifest = entry.manifest;
    }

    get status(): AppletHostRuntimeStatus { return this.#status; }
    get applet(): ClassroomApplet<TConfig, TState> {
        if (!this.#applet) throw new Error('applet-not-mounted');
        return this.#applet;
    }

    async start(): Promise<void> {
        if (this.#status !== 'created' && this.#status !== 'paused')
            throw new Error(`invalid-applet-start:${this.#status}`);
        if (!this.#applet) {
            const entry = this.options.registry.resolve(this.options.instance.appletTypeId);
            this.#applet = entry.factory() as ClassroomApplet<TConfig, TState>;
            await this.#applet.initialize(this.options.context, this.options.host);
            await this.#applet.load(this.options.config);
            const snapshot = this.options.snapshot;
            if (snapshot) {
                if (snapshot.stateSchemaVersion === this.manifest.stateSchemaVersion)
                    await this.#applet.restoreState(snapshot.state);
                else if (this.#applet.migrateState)
                    await this.#applet.restoreState(await this.#applet.migrateState(snapshot.state, snapshot.stateSchemaVersion, this.manifest.stateSchemaVersion));
                else throw new Error('state-schema-incompatible');
            }
        }
        await this.#applet.resume();
        this.#status = 'running';
    }

    async pauseAndSnapshot(): Promise<TState> {
        if (!this.#applet || (this.#status !== 'running' && this.#status !== 'paused'))
            throw new Error('applet-not-running');
        await this.#applet.pause();
        this.#status = 'paused';
        return structuredClone(this.#applet.getState());
    }

    async destroy(): Promise<void> {
        if (this.#applet && this.#status !== 'destroyed') await this.#applet.destroy();
        this.#status = 'destroyed';
        this.#applet = null;
    }
}

export interface GenericCounterState { count: number; label: string; }
export const GENERIC_COUNTER_MANIFEST: AppletManifest = {
    appletTypeId: 'generic-counter', version: '1.0.0', hostApiVersion: 1,
    configSchemaVersion: 1, stateSchemaVersion: 1, eventSchemaVersion: 1, commandSchemaVersion: 1,
    capabilities: [], emittedEventTypes: ['increment', 'decrement', 'set-label'], handledCommandTypes: ['increment', 'decrement', 'set-label'],
    configSchemaRef: 'synthetic:generic-counter/config/v1', stateSchemaRef: 'synthetic:generic-counter/state/v1',
    eventSchemaRefs: { increment: 'synthetic:generic-counter/event/increment/v1', decrement: 'synthetic:generic-counter/event/decrement/v1', 'set-label': 'synthetic:generic-counter/event/set-label/v1' },
    commandSchemaRefs: { increment: 'synthetic:generic-counter/command/increment/v1', decrement: 'synthetic:generic-counter/command/decrement/v1', 'set-label': 'synthetic:generic-counter/command/set-label/v1' },
    displayName: 'Generic Counter',
};

export function createGenericCounterApplet(): ClassroomApplet<{ label?: string }, GenericCounterState, GenericCounterState> {
    let state: GenericCounterState = { count: 0, label: 'counter' };
    let host: AppletHost | null = null;
    return {
        manifest: GENERIC_COUNTER_MANIFEST,
        initialize(_context, nextHost) { host = nextHost; },
        load(config) { state = { count: 0, label: config.label ?? 'counter' }; },
        getState() { return structuredClone(state); },
        restoreState(next) { state = structuredClone(next); },
        pause() { /* lifecycle marker owned by host */ },
        resume() { /* lifecycle marker owned by host */ },
        async submit() { return structuredClone(state); },
        async handleCommand(command) {
            if (command.type === 'increment') state = { ...state, count: state.count + 1 };
            else if (command.type === 'decrement') state = { ...state, count: state.count - 1 };
            else if (command.type === 'set-label' && typeof command.payload.label === 'string') state = { ...state, label: command.payload.label };
            else throw new Error('unsupported-generic-counter-command');
            if (!host) throw new Error('generic-counter-not-initialized');
            await host.emitEvent({ type: command.type, payload: command.payload });
        },
        destroy() { /* no external resources */ },
    };
}
