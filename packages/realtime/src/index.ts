import type { LiveQuality, LiveStateFrame, LiveSubscriptionGrant, LiveSubscriptionRequest, Role } from '@classroom/contracts';

export interface LiveSubscriberOptions {
    role: Exclude<Role, 'system'>;
    onFrame(frame: LiveStateFrame): void;
    maxBufferedFrames?: number;
}
interface Subscriber extends LiveSubscriberOptions {
    request: LiveSubscriptionRequest;
    effectiveHz: number;
    lastDeliveredAt: number;
    pendingLatestFrame: LiveStateFrame | null;
    timer: ReturnType<typeof setTimeout> | null;
    coalescedCount: number;
    droppedCount: number;
}
const QUALITY_HZ: Record<LiveQuality, number> = { background: 2, thumbnail: 8, focus: 20 };

/** Bounded latest-frame live channel. Durable events never pass through it. */
export class LiveStateBroker {
    #subscribers = new Map<string, Subscriber>();
    #dropped = { background: 0, thumbnail: 0, focus: 0, observer: 0 };
    constructor(private readonly clock: () => number = () => Date.now()) {}

    subscribe(request: LiveSubscriptionRequest, options: LiveSubscriberOptions): LiveSubscriptionGrant {
        if (this.#subscribers.has(request.subscriptionId)) throw new Error('duplicate-live-subscription');
        const effectiveHz = this.effectiveHz(request.quality, options.role);
        this.#subscribers.set(request.subscriptionId, { ...options, request: structuredClone(request), effectiveHz, lastDeliveredAt: 0, pendingLatestFrame: null, timer: null, coalescedCount: 0, droppedCount: 0 });
        return { subscriptionId: request.subscriptionId, accepted: true, quality: request.quality, effectiveHz, expiresAt: null, error: null };
    }

    unsubscribe(subscriptionId: string): boolean {
        const subscriber = this.#subscribers.get(subscriptionId);
        if (!subscriber) return false;
        if (subscriber.timer) clearTimeout(subscriber.timer);
        subscriber.timer = null;
        subscriber.pendingLatestFrame = null;
        return this.#subscribers.delete(subscriptionId);
    }

    updateQuality(subscriptionId: string, quality: LiveQuality): LiveSubscriptionGrant {
        const subscriber = this.#subscribers.get(subscriptionId);
        if (!subscriber) return { subscriptionId, accepted: false, quality, effectiveHz: 0, error: { code: 'not-found', message: 'subscription-not-found', retryable: false } };
        subscriber.request = { ...subscriber.request, quality };
        subscriber.effectiveHz = this.effectiveHz(quality, subscriber.role);
        if (subscriber.timer) clearTimeout(subscriber.timer);
        subscriber.timer = null;
        this.schedulePending(subscriptionId, subscriber);
        return { subscriptionId, accepted: true, quality, effectiveHz: subscriber.effectiveHz, expiresAt: null, error: null };
    }

    publish(frame: LiveStateFrame): { delivered: number; dropped: number } {
        let delivered = 0;
        let dropped = 0;
        for (const [subscriptionId, subscriber] of this.#subscribers) {
            if (subscriber.request.appletInstanceId !== frame.appletInstanceId || !matchesScope(subscriber.request, frame)) continue;
            const now = this.clock();
            const interval = 1000 / subscriber.effectiveHz;
            if (subscriber.lastDeliveredAt === 0 || now - subscriber.lastDeliveredAt >= interval) {
                this.deliver(subscriber, frame, now);
                delivered++;
                continue;
            }
            if (subscriber.pendingLatestFrame && subscriber.pendingLatestFrame.seq !== frame.seq) {
                this.recordDrop(subscriber);
                dropped++;
            }
            subscriber.pendingLatestFrame = structuredClone(frame);
            subscriber.coalescedCount++;
            this.schedulePending(subscriptionId, subscriber);
        }
        return { delivered, dropped };
    }

    stats(): { subscribers: number; dropped: Record<string, number>; coalesced: number } {
        let coalesced = 0;
        for (const subscriber of this.#subscribers.values()) coalesced += subscriber.coalescedCount;
        return { subscribers: this.#subscribers.size, dropped: { ...this.#dropped }, coalesced };
    }

    private schedulePending(subscriptionId: string, subscriber: Subscriber): void {
        if (!subscriber.pendingLatestFrame || subscriber.timer) return;
        const interval = 1000 / subscriber.effectiveHz;
        const delay = Math.max(0, interval - (this.clock() - subscriber.lastDeliveredAt));
        subscriber.timer = setTimeout(() => {
            subscriber.timer = null;
            const current = this.#subscribers.get(subscriptionId);
            if (!current || !current.pendingLatestFrame) return;
            const frame = current.pendingLatestFrame;
            current.pendingLatestFrame = null;
            this.deliver(current, frame, this.clock());
            this.schedulePending(subscriptionId, current);
        }, delay);
        (subscriber.timer as unknown as { unref?: () => void }).unref?.();
    }

    private deliver(subscriber: Subscriber, frame: LiveStateFrame, now: number): void {
        subscriber.lastDeliveredAt = now;
        subscriber.onFrame(structuredClone(frame));
    }

    private recordDrop(subscriber: Subscriber): void {
        subscriber.droppedCount++;
        if (subscriber.role === 'observer') this.#dropped.observer++;
        else this.#dropped[subscriber.request.quality]++;
    }

    private effectiveHz(quality: LiveQuality, role: Exclude<Role, 'system'>): number {
        if (role === 'observer') return Math.min(QUALITY_HZ[quality], 4);
        if (role === 'display') return Math.min(QUALITY_HZ[quality], 8);
        return QUALITY_HZ[quality];
    }
}

function matchesScope(request: LiveSubscriptionRequest, frame: LiveStateFrame): boolean {
    if (request.sessionId != null && request.sessionId !== frame.sessionId) return false;
    if (request.activityId != null && request.activityId !== frame.activityId) return false;
    if (!request.subject) return true;
    if (request.subject.type !== frame.scope.type) return false;
    return request.subject.id === frame.scope.id || request.publicSubjectId === frame.scope.id;
}

/** Internal Runtime adapter. Do not expose directly to Lesson/Applet code. */
export interface RealtimeGateway {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(topic: string, payload: unknown): Promise<void>;
    subscribe(topic: string, handler: (payload: unknown) => void): () => void;
}
