# Presentation Subsystem Capability Integration

Status: `CAPABILITY-INTEGRATION / NOT-FROZEN`.

The architecture is frozen, but the Studio capability surface is not. The only presentation engine is `web-ppt`. Published and rehearsal revisions are immutable, a Session pins an exact revision, and `PresentationPlaybackState` is authoritative for playback. Display is playback-only and resolves the authoritative RuntimeIndex.

This status permits one bounded upstream capability integration closure. The product feature status may return to `FEATURE-FROZEN / MAINTENANCE` only after the Presentation Usability Gate, Browser E2E, save/reopen, Display playback, Docker and offline/LAN gates are evidenced.

Stable architectural boundaries:

- `StageState` stores only stage content type and references; it does not copy playback state.
- `PresentationPlaybackState` owns scene, step, play state and revision.
- Presentation assets remain account-owned resources flowing through Draft, Rehearsal/Published Revision, Prepare, Runtime Cache and Session Pin.
- Classroom blocks contain only a semantic `presentationId` reference; they never embed PPTX bytes.

Allowed work during integration:

- correctness, data-safety, security and compatibility fixes;
- upstream-backed Studio capability integration;
- public-lesson blockers;
- recovery and classroom integration fixes.

Real-time collaboration, enterprise sharing, AI authoring, Office file-format parity and a second editor engine remain outside this mainline.
