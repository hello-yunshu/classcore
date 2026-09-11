# Generic Analytics and Intelligence Runtime

Status: `implemented` for provider boundary, timeout/fallback and teacher confirmation; real lesson rules and external LLM integration are intentionally deferred.

`runAnalytics` accepts generic events, Snapshots, Artifacts, metrics and features, returns classifications with `EvidenceRef` links, and supports rule/llm/hybrid provenance. Timeout or provider failure returns a fallback result or an empty enhancement and cannot block Join, durable events, Submission, Stage or Display.

`TeacherRecommendationGate` keeps recommendations in `candidate` state until a teacher explicitly confirms or dismisses them. Intelligence never directly publishes a student resource to the public Stage.
