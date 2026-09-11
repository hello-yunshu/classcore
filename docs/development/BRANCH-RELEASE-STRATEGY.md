> 中文说明：本文件为历史/专项技术参考，保留英文细节；当前权威开发说明以 `docs/README.md` 与中文主计划为准。

# Branch and Release Strategy

## Calendar mapping for the current schedule

If formal coding starts on **2026-09-10**:

- D1: Sep 10
- D2 Student Practice + Teacher Presentation Studio Alpha: **Sep 11**
- D7 Public Lesson RC: **Sep 16**
- D14 capability/generalization checkpoint: **Sep 23**
- D21 full architecture implementation baseline: **Sep 30**

This deliberately freezes a public-lesson RC well before the expected late-September lesson window, leaving rehearsal/fix buffer.

## Branch policy

Before D7:
- `main` follows the D7 critical path;
- avoid parallel speculative refactors.

At D7:
- tag `public-lesson-rc1`;
- create/maintain `release/public-lesson` from the tested commit;
- freeze lesson package fingerprint, Web Presentation deck/scene assets and release artifacts.

D8-D21:
- architecture/generalization continues on `main`/feature branches;
- **do not automatically merge D8-D21 refactors into `release/public-lesson`**;
- only verified P0/P1 fixes required for the lesson are cherry-picked to the release branch;
- every cherry-pick reruns the D7 release gate.

## Why this is required

The 21-day architecture target must not consume the reliability buffer earned by the 7-day lesson target. Public-lesson stability and long-term platform development therefore move at different release cadences after D7.
