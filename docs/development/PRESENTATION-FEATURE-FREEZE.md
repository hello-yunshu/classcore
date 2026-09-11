# Presentation Subsystem Feature Freeze

Status: `FEATURE-FROZEN / MAINTENANCE`.

The only presentation engine is `web-ppt`. Published and rehearsal revisions are immutable, a Session pins an exact revision, and `PresentationPlaybackState` is authoritative for playback. Display is playback-only and resolves the authoritative RuntimeIndex.

Allowed maintenance work:

- correctness, data-safety, security and compatibility fixes;
- public-lesson blockers;
- recovery and classroom integration fixes.

New editor products, Office-clone scope, collaboration, templates, sharing and AI authoring are outside this mainline.
