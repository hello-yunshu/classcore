> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Local-first Client Reliability v0.1.2

The client UI responds locally first; network acknowledgement is not on the interaction critical path.

Durable client Events use an IndexedDB-backed Outbox when available:
1. create clientEventId and persist Outbox record;
2. send when connected;
3. Server performs atomic idempotent acceptance and returns ACK;
4. remove Outbox record only after successful/duplicate ACK;
5. on reconnect, resend outstanding records.

Do not require Service Worker for the core Outbox or lesson operation. Service Worker/CacheStorage may be added only as an optional secure-context enhancement.

Asset preloading may use ordinary HTTP/browser cache or explicit client storage; Preflight verifies required assets rather than assuming cache success.
