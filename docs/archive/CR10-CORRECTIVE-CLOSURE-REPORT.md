# CR10 Corrective Closure Report

R3.9 / CR10 is the final corrective validation closure over Foundation v0.1.2. The frozen Foundation contract directory remains unchanged and continues to be protected by the exact-set SHA256 gate.

## Scope

CR10 does not add a new Foundation abstraction. It closes identity/privacy and roster-readiness fail-open paths discovered by an independent mutation audit of R3.8:

- public Projection and Presentation identity guards now inspect primitive strings, array elements, object keys and nested values across the entire ClassroomWidgetBinding, not only `source.parameters`;
- stable `roster:` and `class:` references join the shared private-identity reference policy; explicit connection/claim-sensitive fields (`deviceId`, `clientInstanceId`, `participantHint`, `reconnectToken`, `accessToken`, `credential`) are also blocked from public/binding payloads;
- Runtime TypeScript, Lesson JavaScript validation and Python formal validation are checked against one mutation corpus;
- duplicate identical `participantId` rows now fail roster preflight;
- Student Claim uses the same whitespace normalization semantics as roster preflight and blank hints fail closed;
- public pseudonym projection requires the student to exist before allocating/returning a subject id; direct pseudonym allocation also rejects non-student participant namespaces;
- workspace boundary validation is now a persistent machine gate for internal dependency existence, declarations and cycles;
- a D7 product-readiness manifest blocks `release:d7` while known product P0 requirements are incomplete, and the unauthenticated reference server defaults to loopback-only;
- transport idempotency now verifies a canonical payload for duplicate IDs, rejecting conflicting ID reuse instead of silently treating it as a retry.

## Regression evidence in the audit environment

- TypeScript source compiled successfully with the locally available compiler;
- automated tests: **92/92 PASS**;
- Foundation exact-set freeze: **46/46 PASS**;
- workspace boundary gate: **19 workspaces / 33 internal dependency edges / 26 internal source imports PASS**;
- formal Draft 2020-12 contract validation: PASS;
- reference Lesson formal + semantic validation: PASS;
- Lesson discovery/template gates: PASS;
- dist/public isolation: PASS;
- SQLite recovery and session isolation: PASS;
- Server dual-endpoint smoke: PASS;
- reference load: 50 Students + 40 Observers, 200 durable events, 20 teacher controls and 800 observer broadcasts: PASS.

## Evidence boundary

The audit container is not the release machine. It does not provide Docker and could not download the pinned clean toolchain. Therefore this report does **not** claim a fresh-network `npm ci` using Node 24.21.0 / npm 11.19.0 / TypeScript 7.0.2, an Apple Silicon Docker run, or an XP21A classroom rehearsal. Those remain explicit release gates, not silently waived checks.

## Closure decision

Foundation v0.1.2 remains frozen. After CR10, further architecture/validation changes should require a concrete implementation counterexample. Normal development should move to authenticated Join/Membership, the authoritative classroom Server path, TransformBoard, Presentation Runtime/Studio and D7 device/LAN rehearsal.
