# CR8 Validation Closure Report

> Foundation v0.1.2 / Roadmap R3.7 / Contract Correctness CR8  
> Date: 2026-09-10

## Scope

CR8 does **not** modify the frozen Foundation contract set. It closes validation, handoff, architecture-target CI, and deployment-boundary gaps found by adversarial audit of R3.6.

## Changes

- The generic Lesson Package gate now checks all assets, including non-preload/lazy assets.
- Applet instance `requiredCapabilities` must be provided by the selected Applet Manifest.
- Client Applets cannot declare server-owned event prefixes (`session.`, `activity.`, `stage.`, `submission.`, `advice.`, `controller.`, `system.`).
- Presentation `stagePolicy` must resolve to the declared presentation deck and real scene, and requires `presentationRuntime=true`.
- Presentation semantics reject duplicate scene/binding IDs and identity-specific classroom binding parameters so decks remain portable across classes.
- Lesson/package/schema/asset references are constrained to remain inside the Lesson Package directory using lexical and real-path containment, including symlink-escape defense.
- `lesson:new` now performs structured JSON substitution, so titles containing quotes, backslashes or Unicode cannot corrupt generated JSON.
- Foundation freeze is now an **exact-set freeze**: changed, missing, or newly-added untracked files under `docs/contracts/v0.1.2` fail the gate.
- Python formal-validation direct/transitive dependencies are exact-pinned in `requirements-dev.txt`.
- CI now has native x64 and native arm64 full-check jobs and a native `linux/arm64` Docker build job.
- Runtime Docker image runs as the non-root `node` user.
- Docker release gate separates host LAN-interface publication probing from the required physical XP21A/LAN rehearsal.

## Architecture decision

No new Core layer was introduced and no file in `docs/contracts/v0.1.2` was changed. The next engineering work remains product delivery: Presentation Engine/Authoring Studio Alpha, TransformBoard Practice Alpha, real Join/Presence/Outbox/Submission, Teacher/Observer/Display product UI, and lesson-specific analytics/intelligence.

## External hard gates

A source-package audit environment without Docker/Apple Silicon hardware cannot truthfully mark these complete:

- Apple Silicon Docker build/run/restart on the teacher Mac;
- physical router + XP21A classroom LAN rehearsal.

Those remain D7 release gates and are documented in `docs/deployment/CLASSROOM-LAN-REHEARSAL.md`.
