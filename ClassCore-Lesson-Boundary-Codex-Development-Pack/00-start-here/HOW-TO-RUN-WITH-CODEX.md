# How to Run This with Codex

## Recommended setup

### Option A — Codex app / IDE with local repo
1. Clone/open `hello-yunshu/classcore`.
2. Pull latest `main`.
3. Copy this pack into:
   `docs/codex/pattern-restoration-integration/`
4. Merge the AGENTS snippet into root `AGENTS.md`.
5. Start Codex in the repository.
6. First run Task 00 in Ask/Plan mode.
7. Only after reviewing the plan, run Task 01 in coding mode.
8. Continue one task at a time.

### Option B — Codex cloud / connected GitHub environment
Keep the prompt pack committed in the repository so the cloud task can read it by path.
Use the same Task 00 → 07 sequence.

The reliable persistent context is the repository itself plus `AGENTS.md`.
Do not depend on a long chat having remembered every architecture decision.

## Why use AGENTS.md
It makes the Core/Lesson dependency rule persistent for later Codex tasks,
including tasks that are not started from this exact conversation.

## Why use Ask first
For architecture changes, first ask Codex to inspect and plan. Only then code.
This prevents it from prematurely deciding that the easiest implementation is to
put lesson logic back into `student-web` or `runtime`.

## Why one task at a time
A task should end with a reviewable commit and concrete tests.

Bad:
> “Complete the entire public-lesson platform.”

Good:
> “Implement Task 03 only. Move TransformBoard business out of Student Surface,
> preserve the Student screenshot baseline, add unit tests, run boundary check,
> and stop.”

## Recommended commit discipline
One conceptual commit per task, or a very small sequence of coherent commits.

After each task:
1. inspect `git diff`;
2. run required tests;
3. ask Codex to audit its own commit;
4. fix;
5. only then go to next task.

## Suggested Codex initial prompt

```text
Open the repository and do not modify code yet.

Read:
- AGENTS.md
- CODEX-HANDOFF.md
- MASTER-DEVELOPMENT-PLAN.md
- docs/codex/pattern-restoration-integration/MASTER-PROMPT.md
- docs/codex/pattern-restoration-integration/architecture/*
- docs/codex/pattern-restoration-integration/codex-tasks/00-ASK-AUDIT-AND-PLAN.md

Fetch origin/main and verify the current HEAD.

Then perform Task 00 exactly.
Do not assume the audit package baseline is still current.
Do not code.
```

## Suggested first coding prompt

```text
Implement only Task 01:
docs/codex/pattern-restoration-integration/codex-tasks/01-BOUNDARY-GATES.md

Before editing, re-read AGENTS.md and MASTER-PROMPT.md.
Use current repository conventions.
Do not start Task 02.
Do not change Student/Teacher UI in this task.

After implementation:
- run the task-specific tests
- run npm run check
- audit the diff for false positives and lesson-specific assumptions
- fix all failures
- commit
- report commit SHA and evidence
```

## Suggested post-task audit prompt

```text
Do not start the next task.

Audit the commit you just created against:
- Core ← Shared ← Lesson dependency direction
- no lesson special-cases in apps/packages
- no production mock
- no unnecessary Foundation changes
- no UI regression
- correct recovery/privacy authority
- adequate tests

If any problem exists, fix it and rerun all affected checks.
Only say the task is closed if the evidence supports that conclusion.
```
