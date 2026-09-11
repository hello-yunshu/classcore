import type { AppletEventIntent, AppletManifest, AppletViewerContext, ClientAppletEvent, EventAck } from '@classroom/contracts';
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

