# Stage and Widget Runtime

Status: `implemented` for generic registry/projection primitives; classroom Stage E2E remains `NOT_EVALUATED`.

Stage state is canonical and revisioned. `WidgetRegistry` resolves namespaced widget types and selectors such as `current-activity-summary`, `selected-artifact`, `selected-live-view`, `student-comparison` and `recommended-resource`. A widget receives already-projected runtime data and its audience is checked before rendering.

Public audiences are passed through the existing private-identity guard. Teacher projections may be identifiable; Display and Observer projections must remain pseudonymous and read-only.
