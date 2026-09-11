# CR9 Corrective Closure Report

R3.8 / CR9 is a corrective validation closure over Foundation v0.1.2. The frozen Foundation contract directory is unchanged.

Closed in this revision:
- recursive, realpath-safe Lesson Package discovery with symlink and nested-package ambiguity rejection;
- canonical private-identity field policy shared by JavaScript/Python validators and generated TypeScript runtime guards;
- Teacher Submission/Artifact actions require explicit resource scope;
- Controller Lease mutation helpers require Teacher role;
- idempotency keys use unambiguous JSON tuple encoding;
- Docker LAN local-tools leak assertion is fail-closed and Compose YAML is parsed by Docker before the generic gate;
- separate Apple-Silicon-only `release:d7` gate and real Compose deployment-entry gate;
- historical CR3 documentation reference restored without modifying frozen Foundation;
- exact-set package integrity generation/check for release artifacts.

The reference WebSocket server is still a transport/storage vertical slice, not the authenticated D7 classroom server. Join/credential/membership authority remains a D7 P0 implementation task.
