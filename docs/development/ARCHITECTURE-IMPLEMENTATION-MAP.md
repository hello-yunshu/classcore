> 中文说明：本文件为历史/专项技术参考，保留英文细节；当前权威开发说明以 `docs/README.md` 与中文主计划为准。

# Architecture Implementation Map — R3.10

## Product Surfaces
- `apps/student-web`
- `apps/teacher-web`
- `apps/display-web`
- `apps/observer-web`
- `apps/backstage`
- `apps/presentation-studio`

## Engineering Surface
- `apps/simulation-rehearsal`

## Service Plane Host
- `apps/server`

## Shared / Internal Packages
- `@classroom/contracts` — public Foundation types
- `@classroom/surfaces` — static Surface/Service Plane registry
- `@classroom/runtime` — state/authorization/event runtime
- `@classroom/applet-sdk` — Applet Host contract
- `@classroom/presentation` — Presentation capability adapter
- `@classroom/storage` — internal storage boundary
- `@classroom/realtime` — internal transport adapter
- `@classroom/platform` — platform abstraction
- `@classroom/intelligence` — intelligence provider boundary
- `@classroom/server-identity` — Server-only real identity directory
- `@classroom/server-projections` — Server-only surface/stage/pseudonym projection

## Dependency rule
Browser apps may depend on public/shared packages, but not `@classroom/server-identity` or `@classroom/server-projections`. Only Server Host/Service Plane may depend on them.
