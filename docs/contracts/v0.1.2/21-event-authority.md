> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Event Authority v0.1.2 — CR1

Applet code emits only an **event intent**: `type + semantic payload (+ optional monotonic time)`.

The Applet Host owns:
- clientEventId;
- appletInstanceId;
- event schema version;
- streamId / streamSeq;
- Outbox / ACK / retry mechanics.

Server accepts a Client Applet Event only after:
1. deriving session/participant/role from authenticated connection;
2. resolving the Applet Instance and its Manifest;
3. checking exact `eventSchemaVersion`;
4. checking `emittedEventTypes` allow-list;
5. validating payload against the Manifest's `eventSchemaRefs[type]` schema;
6. computing a composite idempotency key;
7. atomically checking duplicate + allocating `serverSeq` + inserting the accepted event;
8. generating a Server event ID distinct from the client event ID;
9. returning structured ACK.

Server/System-only facts include Session/Activity/Stage/Submission/Advice/Controller facts. Historic Accepted Domain Events are immutable; schema evolution uses explicit upcasters/migrations for reads, not in-place mutation.
