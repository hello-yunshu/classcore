export async function waitForHttpReady(url, attempts = 100, delayMs = 30) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const response = await fetch(url);
            if (response.ok)
                return;
        }
        catch {
            // Server may still be starting.
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error(`server-not-ready:${url}`);
}
export function connectReferenceClient(url, { role, clientId, sessionId }) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const pending = new Map();
        const messages = [];
        const timer = setTimeout(() => {
            reject(new Error(`connect-timeout:${role}:${clientId}`));
        }, 3000);
        ws.onopen = () => {
            ws.send(JSON.stringify({
                type: 'hello',
                role,
                clientId,
                sessionId,
            }));
        };
        ws.onerror = () => {
            clearTimeout(timer);
            reject(new Error(`websocket-error:${role}:${clientId}`));
        };
        ws.onmessage = (event) => {
            const message = JSON.parse(String(event.data));
            messages.push(message);
            if (message.type === 'hello.ack') {
                clearTimeout(timer);
                if (message.ok === false) {
                    reject(new Error(`hello-rejected:${message.reason ?? 'unknown'}`));
                    try {
                        ws.close();
                    }
                    catch { }
                    return;
                }
                resolve({
                    ws,
                    messages,
                    request(payload, key, timeoutMs = 5000) {
                        return new Promise((requestResolve, requestReject) => {
                            const started = performance.now();
                            const requestTimer = setTimeout(() => {
                                pending.delete(key);
                                requestReject(new Error(`ack-timeout:${key}`));
                            }, timeoutMs);
                            pending.set(key, {
                                resolve: requestResolve,
                                timer: requestTimer,
                                started,
                            });
                            ws.send(JSON.stringify(payload));
                        });
                    },
                });
                return;
            }
            for (const [key, pendingRequest] of pending) {
                if (message.eventId === key || message.controlId === key) {
                    clearTimeout(pendingRequest.timer);
                    pending.delete(key);
                    pendingRequest.resolve({
                        message,
                        latencyMs: performance.now() - pendingRequest.started,
                    });
                    break;
                }
            }
        };
    });
}
export function percentile(values, p) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return Number(sorted[index].toFixed(2));
}

