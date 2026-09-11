# CR11 Release-Assurance Closure Report

R3.10 / CR11 keeps Foundation v0.1.2 byte-for-byte frozen and closes release-assurance gaps found by an independent mutation audit of R3.9.

## Closure scope

- Private identity detection now searches stable identity tokens inside ordinary text and repeatedly decodes bounded common reversible encodings (percent encoding, JSON-style unicode/hex escapes and HTML entities) before checking.
- The same mutation corpus is executed by TypeScript runtime semantics, JavaScript lesson tooling and Python formal-validation tooling.
- D7 product readiness uses an exact hard-coded requirement set. `ready=true` is only a declaration; every ready item additionally requires a fixed structured evidence file and a requirement-specific live verifier. Current verifier stubs intentionally fail until real product capability exists.
- The unauthenticated reference transport stays loopback-only in source and reference Compose. LAN publication has a separate D7 Compose and separate authenticated-runtime Docker gate.
- D7 Docker release requires `runtimeMode=authenticated-classroom-server`, `authentication=true`, `productReady=true`, and actively verifies that an unauthenticated client cannot self-declare Teacher.
- `/readyz` distinguishes transport readiness from classroom product readiness.
- Native ARM64 CI is expected to build and run the reference container, including restart/persistence smoke.
- `.gitattributes` pins text files to LF so byte-exact Foundation/package integrity checks are less checkout-dependent.

## Deliberate blocker

The current mother package is not a classroom RC. `npm run d7:product` must fail until authenticated server, TransformBoard, Presentation, Join/Submission, Teacher/Display/Observer flow, and XP21A/LAN rehearsal have real evidence plus working verifiers.
