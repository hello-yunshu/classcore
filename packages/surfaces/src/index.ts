import type { SurfaceDescriptor, SurfaceId, RuntimeProfile } from '@classroom/contracts';
export type TrafficClass = 'student-durable' | 'teacher-control' | 'snapshot-advice' | 'teacher-live' | 'display-sync' | 'observer-live' | 'background-ops';
export interface ClientRuntimeBudget {
    profile: RuntimeProfile;
    maxConcurrentLiveViews: number;
    preferredLiveHz: number;
    maxLiveHz: number;
    allowHeavyCharts: boolean;
    allowAuthoringEditor: boolean;
    loadCurrentActivityOnly: boolean;
}
/**
 * Product/engineering surfaces are UI/product boundaries, not classroom participant roles.
 * Backstage, Authoring Studio and Simulation therefore have participantRole=null.
 */
export const SURFACE_DESCRIPTORS: Readonly<Record<SurfaceId, SurfaceDescriptor>> = {
    'student': {
        surfaceId: 'student', kind: 'product', participantRole: 'student', runtimeProfile: 'student-light',
        identityView: 'self-identifiable', stageAccess: 'none', classroomDataAccess: 'self', production: true,
    },
    'teacher-runtime': {
        surfaceId: 'teacher-runtime', kind: 'product', participantRole: 'teacher', runtimeProfile: 'teacher-rich',
        identityView: 'teacher-identifiable', stageAccess: 'control', classroomDataAccess: 'teacher-projection', production: true,
    },
    'display': {
        surfaceId: 'display', kind: 'product', participantRole: 'display', runtimeProfile: 'display-render',
        identityView: 'public-pseudonymous', stageAccess: 'read-only', classroomDataAccess: 'public-projection', production: true,
    },
    'observer': {
        surfaceId: 'observer', kind: 'product', participantRole: 'observer', runtimeProfile: 'observer-rich',
        identityView: 'public-pseudonymous', stageAccess: 'read-only', classroomDataAccess: 'public-projection', production: true,
    },
    'backstage': {
        surfaceId: 'backstage', kind: 'product', participantRole: null, runtimeProfile: 'backstage-ops',
        identityView: 'operations-identifiable', stageAccess: 'none', classroomDataAccess: 'operations-projection', production: true,
    },
    'authoring-studio': {
        surfaceId: 'authoring-studio', kind: 'product', participantRole: null, runtimeProfile: 'authoring-rich',
        identityView: 'none', stageAccess: 'none', classroomDataAccess: 'none', production: true,
    },
    'simulation-rehearsal': {
        surfaceId: 'simulation-rehearsal', kind: 'engineering', participantRole: null, runtimeProfile: 'simulation-engineering',
        identityView: 'synthetic-only', stageAccess: 'none', classroomDataAccess: 'synthetic', production: false,
    },
};
export const PRODUCT_SURFACES = Object.values(SURFACE_DESCRIPTORS).filter(x => x.kind === 'product');
export const ENGINEERING_SURFACES = Object.values(SURFACE_DESCRIPTORS).filter(x => x.kind === 'engineering');
export function getSurfaceDescriptor(surfaceId: SurfaceId): SurfaceDescriptor { return SURFACE_DESCRIPTORS[surfaceId]; }
/**
 * 工程预算不是协议级“性能承诺”，而是开发时的默认上限/降级依据。
 * Student 默认最保守；Teacher/Observer 可以更重，但不能反向拖累 Student durable path。
 */
export const CLIENT_RUNTIME_BUDGETS: Readonly<Record<SurfaceId, ClientRuntimeBudget>> = {
    'student': { profile: 'student-light', maxConcurrentLiveViews: 1, preferredLiveHz: 8, maxLiveHz: 12, allowHeavyCharts: false, allowAuthoringEditor: false, loadCurrentActivityOnly: true },
    'teacher-runtime': { profile: 'teacher-rich', maxConcurrentLiveViews: 4, preferredLiveHz: 12, maxLiveHz: 20, allowHeavyCharts: true, allowAuthoringEditor: false, loadCurrentActivityOnly: false },
    'display': { profile: 'display-render', maxConcurrentLiveViews: 2, preferredLiveHz: 12, maxLiveHz: 20, allowHeavyCharts: false, allowAuthoringEditor: false, loadCurrentActivityOnly: false },
    'observer': { profile: 'observer-rich', maxConcurrentLiveViews: 4, preferredLiveHz: 8, maxLiveHz: 15, allowHeavyCharts: true, allowAuthoringEditor: false, loadCurrentActivityOnly: false },
    'backstage': { profile: 'backstage-ops', maxConcurrentLiveViews: 0, preferredLiveHz: 0, maxLiveHz: 0, allowHeavyCharts: true, allowAuthoringEditor: false, loadCurrentActivityOnly: false },
    'authoring-studio': { profile: 'authoring-rich', maxConcurrentLiveViews: 0, preferredLiveHz: 0, maxLiveHz: 0, allowHeavyCharts: true, allowAuthoringEditor: true, loadCurrentActivityOnly: false },
    'simulation-rehearsal': { profile: 'simulation-engineering', maxConcurrentLiveViews: 100, preferredLiveHz: 20, maxLiveHz: 30, allowHeavyCharts: true, allowAuthoringEditor: false, loadCurrentActivityOnly: false },
};
/** 数字越小优先级越高。压力下从低优先级开始合并/丢弃可丢数据。 */
export const TRAFFIC_PRIORITY: Readonly<Record<TrafficClass, number>> = {
    'student-durable': 1,
    'teacher-control': 2,
    'snapshot-advice': 3,
    'teacher-live': 4,
    'display-sync': 5,
    'observer-live': 6,
    'background-ops': 7,
};
export function canDropUnderPressure(trafficClass: TrafficClass): boolean {
    return trafficClass === 'teacher-live' || trafficClass === 'observer-live' || trafficClass === 'background-ops';
}
export type ServicePlaneComponentId = 'classroom-server-host' | 'runtime-core' | 'realtime-hub' | 'storage' | 'identity-directory' | 'projection-service' | 'immutable-package-store' | 'intelligence-runtime' | 'analytics-runtime' | 'integration-gateway';
export interface ServicePlaneDescriptor {
    componentId: ServicePlaneComponentId;
    trustZone: 'server-only' | 'runtime-internal' | 'edge-adapter';
    requiredForD7: boolean;
}
export const SERVICE_PLANE: Readonly<Record<ServicePlaneComponentId, ServicePlaneDescriptor>> = {
    'classroom-server-host': { componentId: 'classroom-server-host', trustZone: 'server-only', requiredForD7: true },
    'runtime-core': { componentId: 'runtime-core', trustZone: 'runtime-internal', requiredForD7: true },
    'realtime-hub': { componentId: 'realtime-hub', trustZone: 'server-only', requiredForD7: true },
    'storage': { componentId: 'storage', trustZone: 'server-only', requiredForD7: true },
    'identity-directory': { componentId: 'identity-directory', trustZone: 'server-only', requiredForD7: true },
    'projection-service': { componentId: 'projection-service', trustZone: 'server-only', requiredForD7: true },
    'immutable-package-store': { componentId: 'immutable-package-store', trustZone: 'server-only', requiredForD7: true },
    'intelligence-runtime': { componentId: 'intelligence-runtime', trustZone: 'server-only', requiredForD7: false },
    'analytics-runtime': { componentId: 'analytics-runtime', trustZone: 'server-only', requiredForD7: false },
    'integration-gateway': { componentId: 'integration-gateway', trustZone: 'edge-adapter', requiredForD7: false },
};
export interface BackstageAccessPolicy {
    mode: 'localhost-only' | 'authenticated-remote';
}
export interface BackstageRequestContext {
    remoteAddress: string | null | undefined;
    authenticated?: boolean;
}
export function isLoopbackAddress(address: string | null | undefined): boolean {
    if (!address)
        return false;
    const normalized = address.toLowerCase().trim();
    return normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1';
}
/**
 * 仅用于“应用直接运行在宿主机”的非容器部署判断：localhost-only 必须基于 TCP peer address，
 * 不能读取 HTTP Host header。当前 Docker 基线不应依赖此 helper 穿透 NAT 推断宿主身份；
 * Docker 部署通过宿主端口绑定 `127.0.0.1:9688:9688` 限定 Backstage / Authoring 仅教师 Mac 本机可达。
 */
export function canOpenBackstage(policy: BackstageAccessPolicy, request: BackstageRequestContext): boolean {
    if (policy.mode === 'localhost-only')
        return isLoopbackAddress(request.remoteAddress);
    return request.authenticated === true;
}
