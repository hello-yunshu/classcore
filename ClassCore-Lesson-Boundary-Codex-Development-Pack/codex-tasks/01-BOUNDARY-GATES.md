# Task 01 — Make the Boundary Enforceable

Goal:
Prevent this and future lessons from leaking into Core.

Implement:
1. `lesson-boundary:check`
2. integrate it into standard `npm run check`
3. tests for positive/negative dependency cases
4. root docs/AGENTS boundary update if needed

Do NOT:
- move the real lesson yet
- redesign Student/Teacher
- expand Foundation
- use brittle broad keyword bans

Acceptance:
- current repo passes
- synthetic Core→Lesson import fails
- specific lesson namespace in Core fails
- legitimate docs/fixtures are not falsely rejected
- `npm run check` passes
