> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Delivery & Reliability Specification v0.1.2

## Class A — Reliable Durable
Command, Client Applet Event, Submission, Artifact Transfer and Advice lifecycle changes.
Requirements: unique client request ID, Outbox, ACK, retry, atomic Server idempotency, standard machine-readable error codes.

## Class B — Recoverable State
Session, Activity, Stage, Snapshot, Feature Policy and projections.
Requirements: revision/version and a full refresh path; stale clients reload authoritative state instead of replaying every transient change.

## Class C — Realtime Best Effort
Live State / drag deltas.
Requirements: latest-wins, coalescing/throttling allowed, stale sequence discarded. Subscription quality (`background/thumbnail/focus`) is requested by clients but effective frequency is granted by Server based on load/capability.

## Reconnect order
1. re-establish protocol handshake and authenticated Session Membership;
2. retrieve Session / Activity / Stage / Feature Policy authoritative state;
3. restore Applet Snapshot (migrating state if required);
4. resend un-ACKed Outbox; Server deduplicates atomically;
5. restore Live subscriptions at Server-granted QoS.

## Client stream identity
`clientEventId` is a durable retry identity and MUST NOT be a resettable numeric counter. Generate a sufficiently unique ID and persist it with the Outbox entry. `streamId + streamSeq` is a separate ordering identity: sequence is monotonic only inside one stream, and a restarted/recreated client stream uses a new `streamId`. Server keeps both client-stream ordering metadata and its own session-scoped `serverSeq`.
