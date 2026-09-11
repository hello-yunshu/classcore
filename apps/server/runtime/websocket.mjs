import crypto from 'node:crypto';
const WEB_SOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const DEFAULT_MAX_MESSAGE_BYTES = 256 * 1024;
function encodeFrame(opcode, payload) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    let header;
    if (body.length < 126) {
        header = Buffer.from([0x80 | opcode, body.length]);
    }
    else if (body.length <= 0xffff) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(body.length, 2);
    }
    else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(body.length), 2);
    }
    return Buffer.concat([header, body]);
}
function closePayload(code, reason = '') {
    const reasonBuffer = Buffer.from(reason).subarray(0, 123);
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    return payload;
}
export function acceptWebSocketUpgrade(req, socket, head, onMessage, onClose, { maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES } = {}) {
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
        socket.destroy();
        return null;
    }
    const accept = crypto.createHash('sha1').update(key + WEB_SOCKET_GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let buffer = head?.length ? Buffer.from(head) : Buffer.alloc(0);
    let closed = false;
    let fragment = null;
    const send = (value) => {
        if (closed || socket.destroyed)
            return false;
        const payload = typeof value === 'string' ? value : JSON.stringify(value);
        return socket.write(encodeFrame(0x1, payload));
    };
    const close = (code = 1000, reason = '') => {
        if (closed)
            return;
        closed = true;
        try {
            socket.end(encodeFrame(0x8, closePayload(code, reason)));
        }
        catch {
            socket.destroy();
        }
        onClose?.();
    };
    const deliverText = (payload) => {
        try {
            onMessage?.(payload.toString('utf8'), {
                send,
                close,
                bufferedBytes: () => socket.writableLength,
            });
        }
        catch {
            send({ type: 'error', code: 'invalid-message' });
        }
    };
    const appendFragment = (payload) => {
        const totalBytes = (fragment?.totalBytes ?? 0) + payload.length;
        if (totalBytes > maxMessageBytes) {
            close(1009, 'message-too-large');
            return false;
        }
        fragment.chunks.push(payload);
        fragment.totalBytes = totalBytes;
        return true;
    };
    const parse = () => {
        while (!closed && buffer.length >= 2) {
            const first = buffer[0];
            const second = buffer[1];
            const fin = (first & 0x80) !== 0;
            const reserved = first & 0x70;
            const opcode = first & 0x0f;
            const masked = (second & 0x80) !== 0;
            let payloadLength = second & 0x7f;
            let offset = 2;
            if (reserved !== 0 || !masked) {
                close(1002, 'protocol-error');
                return;
            }
            const controlFrame = opcode >= 0x8;
            if (controlFrame && !fin) {
                close(1002, 'fragmented-control-frame');
                return;
            }
            if (payloadLength === 126) {
                if (buffer.length < 4)
                    return;
                payloadLength = buffer.readUInt16BE(2);
                offset = 4;
            }
            else if (payloadLength === 127) {
                if (buffer.length < 10)
                    return;
                const length64 = buffer.readBigUInt64BE(2);
                if (length64 > BigInt(Number.MAX_SAFE_INTEGER)) {
                    close(1009, 'message-too-large');
                    return;
                }
                payloadLength = Number(length64);
                offset = 10;
            }
            if (controlFrame && payloadLength > 125) {
                close(1002, 'control-frame-too-large');
                return;
            }
            if (!controlFrame && payloadLength > maxMessageBytes) {
                close(1009, 'message-too-large');
                return;
            }
            if (buffer.length < offset + 4 + payloadLength)
                return;
            const mask = buffer.subarray(offset, offset + 4);
            offset += 4;
            const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
            buffer = buffer.subarray(offset + payloadLength);
            for (let index = 0; index < payload.length; index++) {
                payload[index] ^= mask[index % 4];
            }
            if (opcode === 0x8) {
                close();
                return;
            }
            if (opcode === 0x9) {
                socket.write(encodeFrame(0xA, payload));
                continue;
            }
            if (opcode === 0xA)
                continue;
            if (opcode === 0x2) {
                close(1003, 'binary-not-supported');
                return;
            }
            if (opcode === 0x1) {
                if (fragment) {
                    close(1002, 'unexpected-data-frame');
                    return;
                }
                if (fin) {
                    deliverText(payload);
                }
                else {
                    fragment = { chunks: [payload], totalBytes: payload.length };
                    if (fragment.totalBytes > maxMessageBytes) {
                        close(1009, 'message-too-large');
                        return;
                    }
                }
                continue;
            }
            if (opcode === 0x0) {
                if (!fragment) {
                    close(1002, 'unexpected-continuation');
                    return;
                }
                if (!appendFragment(payload))
                    return;
                if (fin) {
                    const combined = Buffer.concat(fragment.chunks, fragment.totalBytes);
                    fragment = null;
                    deliverText(combined);
                }
                continue;
            }
            close(1002, 'unsupported-opcode');
            return;
        }
    };
    socket.on('data', (chunk) => {
        if (closed)
            return;
        // Do not cap the raw TCP chunk: one chunk may legitimately contain many small WebSocket frames.
        // Each frame and fragmented message is bounded independently during parsing.
        buffer = Buffer.concat([buffer, chunk]);
        parse();
    });
    socket.on('close', () => {
        if (!closed) {
            closed = true;
            onClose?.();
        }
    });
    socket.on('error', () => {
        if (!closed) {
            closed = true;
            onClose?.();
        }
    });
    parse();
    return {
        send,
        close,
        socket,
        bufferedBytes: () => socket.writableLength,
    };
}

