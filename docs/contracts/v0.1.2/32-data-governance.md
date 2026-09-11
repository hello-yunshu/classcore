> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Data Governance & Retention Principle v0.1.2 / CR2

1. **Identity data** — real name/seat/roster/class mapping in Server-only Identity Directory. Never part of common Participant/Event wire objects.
2. **Durable learning records** — Accepted Events, Artifacts, Submissions, Snapshots, Advice audit. Use stable participantId, not names.
3. **Ephemeral realtime data** — Live State, presence, transient diagnostics. Short-lived by default.
4. **Derived projections/analytics** — rebuildable Student/Teacher/Public/Operations views.

Observer and Display share one Session pseudonym mapping. Public/observer/display exports do not include reverse mapping unless an explicitly authorized research workflow is introduced later.

Identity Directory and pseudonym mapping must have restart behavior defined; Applets never implement retention/export policies.
