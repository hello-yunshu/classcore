> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Compatibility & Versioning Specification v0.1.2

Public contracts are explicitly versioned: `protocolVersion`, `runtimeApiVersion`, `lessonSchemaVersion`, `activitySchemaVersion`, `packageSchemaVersion`, `appletHostApiVersion`, `eventEnvelopeVersion`, `appletEventSchemaVersion`, `configSchemaVersion`, `stateSchemaVersion`, `commandSchemaVersion`, and intelligence record schema versions.

- v0.x may change with Migration Notes.
- After v1.0, the same Major may only make backward-compatible additions.
- Removing fields, changing field meaning/default behavior, or changing trusted authority boundaries requires a Major version.
- Wire JSON Schema is normative across processes. TypeScript types are code mirrors and CI MUST test parity.
- Connection handshake negotiates protocol/runtime compatibility before normal traffic.
- Applet mounting checks Host API, config/state/event schema versions, required Applet capabilities, and required platform capabilities.
- Old state/config/event data is handled by explicit migration/upcast rules; historic stored Events remain immutable.


Presentation is a separately versioned capability (`PresentationAsset`/engine adapter). Its engine/document version must not be folded into Foundation Runtime API versioning.
