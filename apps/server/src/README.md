# Classroom Server Host — Service Plane

这不是用户界面，而是课堂权威状态和服务能力的宿主。

D7 最小职责：
- Session / Join / Membership / credential / token；
- 已认证 WebSocket Presence；
- Controller Lease / Activity / Stage / Presentation authority；
- SQLite Durable Event / Snapshot / Submission / Artifact；
- Server-only Identity Directory；
- Teacher / Observer / Display Projection 与统一 Session pseudonym；
- immutable Lesson/Deck reference 与 restart recovery；
- Feature Policy / Preflight / Diagnostics；
- localhost Backstage route。

浏览器 Surface 不直接 import Server-only identity/projection/storage/runtime 包，只通过 API / Realtime 接收投影后的 DTO。

`classroom-runtime.ts` 是认证课堂 Server 的可复用业务接缝：负责 credential Join、server-owned current Activity/Snapshot、AuthenticatedConnectionContext、durable Applet Event 与 Submission。当前 `apps/server/runtime/server.mjs` 仍是 reference transport，未加载此接缝，也不会因环境变量切换而伪装成认证产品。
