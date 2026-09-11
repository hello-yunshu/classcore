import type { ClientCapabilityReport } from '@classroom/contracts';
export interface KeyValueStorage {
    get<T = unknown>(key: string): Promise<T | null>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    remove(key: string): Promise<void>;
}
/**
 * Platform abstraction exposed to host/runtime implementations.
 * Classroom domain code and applets must not call browser/native globals directly.
 */
export interface PlatformServices {
    storage: KeyValueStorage;
    fullscreen: {
        enter(): Promise<void>;
        exit(): Promise<void>;
    };
    network: {
        isOnline(): boolean;
        onChange(handler: (online: boolean) => void): () => void;
    };
    deviceInfo: {
        get(): Promise<{
            platform: string;
            deviceId: string;
        }>;
    };
    capabilities: {
        report(): Promise<ClientCapabilityReport>;
    };
    filePicker?: {
        pick(options?: Record<string, unknown>): Promise<unknown>;
    };
    clipboard?: {
        writeText(text: string): Promise<void>;
    };
    camera?: unknown;
    microphone?: unknown;
    keepAwake?: unknown;
}
/** Translate wire capability report into names used by AppletManifest. */
export function capabilityReportToSet(report: ClientCapabilityReport): Set<string> {
    const out = new Set<string>();
    if (report.secureContext)
        out.add('secure-context');
    if (report.indexedDb)
        out.add('indexeddb');
    if (report.pointerEvents)
        out.add('pointer-events');
    if (report.webWorkers)
        out.add('web-workers');
    if (report.webSocket)
        out.add('websocket');
    if (report.offscreenCanvas)
        out.add('offscreen-canvas');
    if (report.serviceWorker)
        out.add('service-worker');
    if ((report.maxTouchPoints ?? 0) > 0)
        out.add('touch');
    return out;
}
/**
 * Server 保持跨架构；当前公开课必须支持 Apple Silicon Mac 上 Docker 的 linux/arm64。
 * linux/amd64 是同一容器代码的兼容目标，不把应用逻辑绑定到 CPU 架构。
 */
export type ServerContainerTarget = 'linux/arm64' | 'linux/amd64';
export interface ServerPlatformPolicy {
    portability: 'cross-architecture';
    requiredCurrentTarget: ServerContainerTarget;
    supportedTargets: readonly ServerContainerTarget[];
    hostRequirement: string;
}
export const SERVER_PLATFORM_POLICY: ServerPlatformPolicy = {
    portability: 'cross-architecture',
    requiredCurrentTarget: 'linux/arm64',
    supportedTargets: ['linux/arm64', 'linux/amd64'],
    hostRequirement: 'Apple Silicon Mac + Docker 必须可原生运行 linux/arm64；其他宿主通过匹配容器架构运行。',
};

