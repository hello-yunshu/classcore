# Framework v1 Freeze Criteria

Status: `designed` and partially `implemented`; not a freeze declaration.

Before declaring `FRAMEWORK v1 READY FOR LESSON PRODUCT DEVELOPMENT`, the following must each have machine-verifiable evidence:

- authenticated Session/Join/Membership/Presence/reconnect and Session lifecycle;
- Applet Registry/Host, capability checks, config/state versioning, event validation, Snapshot and command lifecycle;
- SQLite event, Snapshot, Artifact, Submission and Transfer recovery;
- LiveState subscriptions with background/thumbnail/focus quality and backpressure;
- canonical Stage, Widget Registry, artifact/comparison/live content and public identity guard;
- generic Analytics, EvidenceRef, rule/llm/hybrid mode, timeout/fallback and teacher confirmation;
- Student, Teacher, Display and Observer generic shells;
- browser E2E, 48-client/failure simulation, restart, offline LAN, x64/arm64 CI and ARM64 Docker evidence.

Until those gates are closed, statuses must remain `implemented`, `model-tested`, `integration-tested`, `NOT_EVALUATED` or `SKIPPED (user-approved)` as applicable.
