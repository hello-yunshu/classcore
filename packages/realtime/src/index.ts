/** Internal Runtime adapter. Do not expose directly to Lesson/Applet code. */
export interface RealtimeGateway {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(topic: string, payload: unknown): Promise<void>;
    subscribe(topic: string, handler: (payload: unknown) => void): () => void;
}

