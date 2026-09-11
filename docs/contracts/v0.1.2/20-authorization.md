# Scoped Authorization v0.1.2 — CR1

Do not use `can(role, action)` as final authorization and do not accept caller-supplied booleans such as “projection already validated”.

Server authorization is resolved from authoritative facts:
`authenticated connection + active membership + action + resource + ControllerLease + FeaturePolicy + Workgroup + SessionPseudonymProjection`.

Implementation rule:
- `AuthorizationService` asks authoritative stores/read models for lease, feature, pairing/scope and Observer projection facts;
- browser/app clients never submit those facts as trusted inputs;
- service-layer resource existence/ownership validation still applies after the policy decision.

Hard rules:
- `class-code` can request only Student; Observer/Teacher/Display use their own credential classes;
- no client Join path can grant `system`;
- Client command/session identity comes from authenticated connection/membership;
- Student controls own scope and explicitly granted pair/group resources only;
- Artifact Transfer and Submission require explicit scope context;
- Observer is read-only and can access only Server-issued session pseudonyms;
- Teacher control commands require the current Controller Lease holder connection;
- Display receives only Display/Stage projections and cannot mutate classroom state;
- feature-gated actions fail closed; Stage feature gating is content-aware (`presentation:*`, live views, etc.).


Backstage/Authoring/Simulation 不是 ClientRole，不能通过课堂 AuthorizationService 冒充 `system/admin/teacher`。它们使用独立 Surface/API 边界。
