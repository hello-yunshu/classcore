# AGENTS.md — ClassCore Lesson Isolation Rules

将以下内容合并到仓库根 `AGENTS.md` 的长期指令区，不要机械覆盖已有指令。

```md
## Lesson/Core dependency boundary

ClassCore follows a strict one-way lesson dependency model:

Core ← Shared Capabilities ← Lesson Packages

### Core
`packages/contracts`, `runtime`, `storage`, `realtime`, `identity`,
`intelligence`, `projections`, `platform`, `presentation` must remain
lesson-agnostic.

Do not add:
- lesson IDs
- lesson-specific geometry/data
- lesson-specific classifiers
- special cases such as `if (lessonId === "...")`

to Core.

### Generic surfaces
`apps/student-web`, `apps/teacher-web`, and `apps/display-web` are generic
shells. They may consume Lesson/Applet/Analytics/Stage runtime contracts,
but must not contain concrete lesson implementation.

### Lesson-specific work
First implement lesson-specific behavior in `lessons/<slug>` and/or through
a registered reusable Applet + Lesson config.

Do not promote code to Shared/Core because it might be reused later.
Promote only after actual reuse demonstrates a stable generic semantic.

### Pattern Restoration
For the current lesson, these belong outside Core:
- 16×8 puzzle grid
- 4 puzzle pieces
- smile/eye internal content
- initial/target transforms
- numbering/vertex-letter rules
- path-record vocabulary
- grouping/leader policy
- rotate-first / translate-first classifications
- representative-student selection rules

### Development discipline
Before changing Foundation/Core to satisfy a lesson:
1. show why the need cannot be expressed through existing Lesson/Applet/
   Analytics/Presentation/Stage seams;
2. make the smallest generic change;
3. add a reusable test not tied only to the current lesson.

Never use production mock data to make a vertical flow appear complete.
```
