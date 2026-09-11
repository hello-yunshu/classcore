> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Session Pinning, Transactions & Recovery v0.1.2 — CR1

## Immutable resolved lesson during a live Session
When a Session is created, Server resolves the Lesson Package, stores the resolved bytes/files in an **immutable content-addressed package store**, then pins:
- packageId;
- lessonId + lessonVersion;
- package fingerprint/content address.

A fingerprint without retained immutable package content is insufficient for restart recovery. Editing/replacing the authoring source while a Session runs MUST NOT mutate that Session.

Presentation assets referenced by the lesson package are covered by the same frozen package/fingerprint boundary.

## Command transaction boundary
For authoritative commands, validation + canonical state mutation + corresponding Domain Event append form one Server unit of work whenever they must remain consistent. Clients must never observe “state changed but event missing” as a successful command.

## Restart recovery
Persist what is required to reconstruct authoritative classroom state:
- Session / current Activity / Stage / FeaturePolicy;
- active Membership state;
- presentation playback state when active;
- durable events and Applet snapshots;
- session-scoped public pseudonym mapping (shared by Observer/Display);
- immutable resolved lesson package reference.

Ephemeral Presence and Live State are rebuilt after reconnect. Controller Lease may be restored only according to an explicit expiry policy; never silently revive a stale lease after a long process outage.

v1 assumes one active authority for a Session. Future active-active ownership requires an explicit distributed authority/lease layer and is not implied by this contract.
