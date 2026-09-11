> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Live Mirroring QoS & Backpressure v0.1.2

Live mirroring is a subscription service, not an all-to-all broadcast.

- `background`, `thumbnail`, and `focus` are client requests; Server grants `effectiveHz` according to device/network load.
- Server may coalesce/drop Class C frames; newest state wins.
- Durable Class A traffic always takes priority over Live State.
- Slow Observer/Display connections MUST NOT backpressure Student durable event acceptance.
- Per-connection and per-session subscription/rate/queue limits are Server policy and may be changed without changing Lesson/Applet contracts.
- If overload persists, Server degrades live quality before disabling durable learning functions.

This supports many Observers without making live mirroring a classroom single point of failure.
