# Final Acceptance Checklist

截至 2026-09-14，本包的代码与自动化审计项已完成；D7 发布状态仍保持 fail-closed。未有真实 XP21A/LAN/Docker 证据的项目不标记为 PASS。

## Core isolation
- [x] no specific Lesson import from Core
- [x] no current lesson namespace in Core
- [x] no lesson-specific classifier in Intelligence Core
- [x] no puzzle data in Student Shell
- [x] no recommendation rule in Teacher Shell
- [x] no lesson special-case in Server generic runtime

## Lesson
- [x] real Lesson Package exists
- [x] official validator passes
- [x] puzzle config lives in Lesson
- [x] presentation binding lives in Lesson
- [x] analytics rules live outside Intelligence Core

## Shared
- [x] TransformBoard generic if promoted
- [x] no smile/four-piece constants
- [x] config drives puzzle content
- [x] unit tests are reusable

## Student
- [x] approved design retained
- [x] Classroom/Practice separated
- [x] real Join
- [x] Event/Snapshot/Live/Submission
- [x] Outbox/reconnect
- [x] no self-issued identity

## Teacher
- [x] approved three-column design retained
- [x] real Presence/resources
- [x] Stage authoritative
- [x] Presentation authoritative
- [x] no mock students
- [x] no fixed AI numbers

## Analytics
- [x] evidence-backed
- [x] no fixed student IDs
- [x] teacher gate
- [x] fallback-safe

## Architecture proof
- [x] delete-Lesson test
- [x] lesson-boundary:check
- [x] npm run check
- [x] second lesson starter can be created without Core edits
- [x] course workspace → published version → four-surface Session launch vertical slice
- [x] Backstage preparation surface and Teacher classroom control surface are separated

## Physical
- [ ] XP21A — BLOCKED: requires physical device evidence
- [ ] local router — BLOCKED: requires classroom LAN evidence
- [x] Apple Silicon Docker — PASS: native `linux/arm64` image, non-root `node`, classroom/local-tools probes and restart recovery passed
- [x] reconnect drill — automated Student/Teacher/Observer/Display reconnect paths passed

## Reproducible evidence

- `npm run check`: PASS; 186/186 unit tests, build, typecheck, formal Lesson validation, delete-Lesson proof, load and WebSocket/SQLite smoke all passed.
- `npm run lesson-boundary:check`: PASS; Core and generic Surface import/text/mock checks passed.
- `npm run d7:product`: intentionally BLOCKED only by `xp21a-lan-rehearsal`; the other five requirements have verified evidence and live verifiers.
- `npm run d7:host`: PASS; current host is macOS Apple Silicon.
- `npm run docker:gate`: PASS; native Apple Silicon `linux/arm64` image, non-root runtime, classroom/local-tools probes and restart recovery passed.
- `node --test tests/course-workspace.test.mjs`: PASS; course creation, base-resource merge, resource attachment, publish gate, independent Session and four join URL issuance passed; browser verification covered Backstage → Teacher Runtime → Student/Display/Observer same Session and Stage sync.
- Browser flow hardening: PASS; Backstage form hidden state, course-aware Authoring context, server-issued classroom entry summary/copy action, 45-second Teacher Lease with 10-second renewal, actionable control errors, Presentation/Stage sync and Student submission were rechecked across six browser surfaces with no console warning/error.
