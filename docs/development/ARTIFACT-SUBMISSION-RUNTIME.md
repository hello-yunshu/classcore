# Artifact, Submission and Transfer Runtime

Status: `implemented` in the deterministic in-memory adapter; SQLite adapter methods are present; restart, multi-process and browser evidence remain `NOT_EVALUATED`.

LiveState is not persisted as an Artifact. Artifacts are immutable by `(artifactId, revision)`, Snapshots are monotonic by scope, Submissions are idempotent by `submissionId`, and Transfers use the explicit `queued -> sent -> received -> opened -> completed` state chain with `failed` as an explicit terminal path.

Server-side authorization must resolve owner and recipient scope. A browser-supplied owner field is never authoritative.
