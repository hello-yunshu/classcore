> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# State, Config & Event Migration Contract v0.1.2

Versioning without migration is insufficient for long-lived lessons.

## Applet config/state
Applet Manifest declares `configSchemaVersion` and `stateSchemaVersion`.
An Applet that changes either schema across compatible package versions MUST provide deterministic migration steps or explicitly reject unsupported old data before mounting.

Recommended chain:
`v1 -> v2 -> v3`, not a matrix of every old version to every new version.

## Applet events
`eventEnvelopeVersion` versions the common transport envelope.
`appletEventSchemaVersion` versions the Applet-specific event vocabulary/payload contract.
Analyzers must either understand the stored Applet event version or migrate it before interpretation.

## Lesson/package contracts
Lesson/activity/package schema migration belongs to the Host loader, not individual frontends.
Migrations MUST be testable using archived fixture packages.

## Replay rule
Historic Event streams are immutable. Never rewrite history in place. Migration creates an interpreted/upcast view; stored original Event remains available for audit.
