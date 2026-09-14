# Task 04 — Student Classroom Runtime

Goal:
Use the approved 4-fragment UI as Student presentation, but make it a generic shell hosting the current Lesson Applet.

Implement:
- Classroom Mode vs Practice Mode
- Join/membership/reconnect
- StudentSelfProjection
- current Activity loading
- AppletHostRuntime
- durable Events
- Snapshot
- LiveState
- Submission
- Outbox / reconnect resend
- real ack status
- structured record tokens
- reference UI + Studio palette

Remove from Classroom production path:
- self-entered student identity
- BroadcastChannel submission
- localStorage == submitted
- hard-coded grouping

Do not implement Teacher AI yet.

Acceptance:
browser E2E:
join → applet → translate → rotate → record → submit → ack →
refresh restore → offline pending → reconnect resend.
