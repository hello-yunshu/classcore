import type { LiveQuality, LiveStateFrame, LiveSubscriptionGrant, LiveSubscriptionRequest, Role } from '@classroom/contracts';

export interface LiveSubscriberOptions {
    role: Exclude<Role, 'system'>;
    onFrame(frame: LiveStateFrame): void;
    maxBufferedFrames?: number;
}
interface Subscriber extends LiveSubscriberOptions { request: LiveSubscriptionRequest; effectiveHz: number; buffered: number; }
const QUALITY_HZ: Record<LiveQuality, number> = { background: 2, thumbnail: 8, focus: 20 };

/** In-process live channel with explicit quality and drop policy. Durable events never pass through this broker. */
export class LiveStateBroker {
    #subscribers = new Map<string, Subscriber>();
    #dropped = { background: 0, thumbnail: 0, focus: 0, observer: 0 };
    subscribe(request: LiveSubscriptionRequest, options: LiveSubscriberOptions): LiveSubscriptionGrant {
        if (this.#subscribers.has(request.subscriptionId)) throw new Error('duplicate-live-subscription');
        const effectiveHz = this.effectiveHz(request.quality, options.role);
        this.#subscribers.set(request.subscriptionId, { ...options, request: structuredClone(request), effectiveHz, buffered: 0 });
        return { subscriptionId: request.subscriptionId, accepted: true, quality: request.quality, effectiveHz, expiresAt: null, error: null };
    }
    unsubscribe(subscriptionId: string): boolean { return this.#subscribers.delete(subscriptionId); }
    updateQuality(subscriptionId: string, quality: LiveQuality): LiveSubscriptionGrant {
        const subscriber = this.#subscribers.get(subscriptionId);
        if (!subscriber) return { subscriptionId, accepted: false, quality, effectiveHz: 0, error: { code: 'not-found', message: 'subscription-not-found', retryable: false } };
        subscriber.request = { ...subscriber.request, quality };
        subscriber.effectiveHz = this.effectiveHz(quality, subscriber.role);
        return { subscriptionId, accepted: true, quality, effectiveHz: subscriber.effectiveHz, expiresAt: null, error: null };
    }
    publish(frame: LiveStateFrame): { delivered: number; dropped: number } {
        let delivered = 0; let dropped = 0;
        for (const subscriber of this.#subscribers.values()) {
            if (subscriber.request.appletInstanceId !== frame.appletInstanceId || !matchesSubject(subscriber.request, frame)) continue;
            const limit = subscriber.maxBufferedFrames ?? 32;
            if (subscriber.buffered >= limit) {
                dropped++; subscriber.buffered = Math.max(0, subscriber.buffered - 1);
                if (subscriber.role === 'observer') this.#dropped.observer++;
                else this.#dropped[subscriber.request.quality]++;
                continue;
            }
            subscriber.buffered++;
            try { subscriber.onFrame(structuredClone(frame)); delivered++; }
            finally { subscriber.buffered = Math.max(0, subscriber.buffered - 1); }
        }
        return { delivered, dropped };
    }
    stats(): { subscribers: number; dropped: Record<string, number> } { return { subscribers: this.#subscribers.size, dropped: { ...this.#dropped } }; }
    private effectiveHz(quality: LiveQuality, role: Exclude<Role, 'system'>): number {
        if (role === 'observer') return Math.min(QUALITY_HZ[quality], 4);
        if (role === 'display') return Math.min(QUALITY_HZ[quality], 8);
        return QUALITY_HZ[quality];
    }
}
function matchesSubject(request: LiveSubscriptionRequest, frame: LiveStateFrame): boolean {
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
