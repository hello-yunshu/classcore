# Task 03 — TransformBoard as Applet, Not Surface Business

Goal:
Move the existing puzzle implementation out of `apps/student-web`.

First decide from Task 00 evidence:
- lesson-local implementation behind a registered seam, or
- reusable TransformBoard package + Lesson config.

Hard boundary:
The engine must not contain:
- pattern-restoration
- smile
- 4-piece constants
- target answer
- lesson grouping
- lesson analytics

Implement/test:
- logical grid
- integer single-axis translate
- valid pivot selection
- continuous preview
- 90° commit snap
- bounds
- fixed pieces
- strict-content capability via config
- undo
- serialization/snapshot
- normalized events

Then configure the actual 16×8/4-piece puzzle in the Lesson.

Acceptance:
- geometry unit tests
- lesson validation
- student generic shell no longer owns puzzle data
- boundary gate passes
