# Task 06 — Lesson Analytics without Polluting Intelligence Core

Goal:
Implement the current lesson's classification and resource recommendation outside `packages/intelligence`.

Input:
durable events + structured record + submission/evidence refs.

Features may include:
- first operation type
- piece order
- translate/rotate counts
- undo/reset
- elapsed time
- success attempts
- record completeness
- pivot/direction/distance/angle completeness
- operation/record alignment

Classifications may include:
- rotate-first
- translate-first
- orientation-first
- position-first
- high-trial
- concise-path
- missing-pivot
- missing-distance
- missing-angle

Use existing generic Analytics runtime and TeacherRecommendationGate.

Recommendation:
select representative contrasts from real evidence.
Never fixed student IDs.

LLM optional:
language summary only, fallback-safe.

Acceptance:
- deterministic fixture tests
- EvidenceRef correctness
- provider timeout fallback
- confirm/dismiss
- confirmed recommendation can set generic Stage comparison
- no lesson terminology added to Intelligence Core
