# Presentation Upstream Capability Matrix

Status: `CAPABILITY-INTEGRATION / NOT-FROZEN`  
Engine: `web-ppt`  
ClassCore line: `0.5.0-beta.2` (registry rechecked 2026-09-12: `core` reaches beta.4, while `edit-core`, `editor`, and `viewer-core` only reach beta.2; mixed beta lines are prohibited)

The Studio owns product orchestration and user-facing state. Editing, selection, text search, format painting, transitions, animation data, image crop, snapping and selection-pane behavior stay behind the `PresentationStudioController` and the adapter; no parallel editor state machine is introduced.

| Capability | Upstream API | Upstream Version | ClassCore Current | ClassCore Target | Priority | Implementation | Tests | Status | Reason if Deferred |
|---|---|---|---|---|---|---|---|---|---|
| Slide CRUD/reorder | `Editor.exec` slide commands | beta.2 | integrated | stable | P0 | controller | adapter/unit | INTEGRATE_NOW | |
| Clipboard / undo / redo | `copyElements`, `Editor` history | beta.2 | integrated | stable | P0 | controller | adapter/unit | INTEGRATE_NOW | |
| Selection pane | `mountSelectionPane`, `attachSelectionPane` | beta.2 | mounted in Studio | upstream object tree | P0 | adapter/controller | browser 7/7 | INTEGRATE_NOW | |
| Format Painter | `startFormatPainter`, `cancelFormatPainter` | beta.2 | ribbon + floating toolbar | copy/paint action | P0 | adapter/controller | browser smoke | INTEGRATE_NOW | |
| Find / Replace | `openTextSearch`, `nextTextSearch` | beta.2 | ribbon action | search panel | P0 | adapter/controller | browser pending | INTEGRATE_NOW | |
| Alignment | `AlignElements` | beta.2 | multi-select | six-way + single slide align | P0 | controller | unit/browser pending | INTEGRATE_NOW | |
| Distribution | no adapter export; geometry command fallback | beta.2 | local fallback | upstream command when available | P0 | controller | unit/browser pending | INTEGRATE_IF_SAFE | beta.2 has no distribution export; fallback remains isolated in controller |
| Layer | `SetZ` | beta.2 | integrated | four layer actions | P0 | controller | adapter/unit | INTEGRATE_NOW | |
| Group / Ungroup | `Group`, `Ungroup` | beta.2 | available | ribbon/context action | P0 | controller | browser pending | INTEGRATE_NOW | |
| Flip / Rotate | `SetFlip`, `SetXfrm` | beta.2 | integrated | ribbon action | P0 | controller | adapter/unit | INTEGRATE_NOW | |
| Shape gallery | `AddShape` + upstream geometry presets | beta.2 | categorized local gallery | categorized gallery | P0 | Studio command surface | browser pending | INTEGRATE_IF_SAFE | local labels/previews only; geometry remains upstream |
| Shape adjustments | adjustment/edit geometry APIs | beta.2 | not exposed | drag + round-trip | P1 | adapter/controller | browser pending | INTEGRATE_IF_SAFE | API surface needs final review |
| Text run formatting | `queryRunProps`, `setRunProps`, `registerTextUi` | beta.2 | font/color/bold/italic/underline/strike toolbar | range/caret formatting | P0 | controller + view | browser 7/7 | INTEGRATE_NOW | |
| Paragraph/body formatting | `queryParaProps`, `setParaProps`, `setBodyProps` | beta.2 | alignment/list/spacing/TextBody toolbar | paragraph toolbar | P0 | controller + view | browser 7/7 | INTEGRATE_NOW | |
| Image insert/replace/crop | `insertImage`, `replaceImage`, `startImageCrop`, `SetCrop` | beta.2 | insert/replace/crop entry | insert/replace/crop | P0 | adapter/controller | browser pending | INTEGRATE_NOW | |
| Background | `setBackgroundImage`, slide properties | beta.2 | solid/image | custom color + image crop | P0 | controller | adapter/browser pending | INTEGRATE_NOW | |
| Slide layout/size | `queryLayout`, `setLayout`, `doc.meta` | beta.2 | real layout gallery + dynamic aspect ratio | stable layout selection | P1 | adapter/controller | static/unit; browser pending | INTEGRATE_IF_SAFE | custom slide-size writer is not exposed; current source size is read dynamically |
| Transitions | `queryTransition`, `setTransition`, `previewTransition` | beta.2 | gallery + direction/duration/auto-advance/apply-all/preview | gallery + timing/options | P0 | adapter/controller | browser 7/7 | INTEGRATE_NOW | |
| Animations | `SetAnimations`, `ANIMATION_EFFECTS`, `previewAnimations` | beta.2 | multi-effect gallery + append/clear + trigger/duration/order | catalog + timing/order | P0 | controller | unit/browser smoke | INTEGRATE_NOW | sourceReadonly remains fail-closed for unsupported source timing |
| Animation pane | `querySlideAnimations` | beta.2 | editable trigger/duration/order/delete list | select/order/delete/edit | P1 | controller | browser pending | INTEGRATE_NOW | |
| Notes | `SetNotes` | beta.2 | bottom notes bar + page inspector | bottom notes bar | P1 | controller | browser 7/7 | INTEGRATE_NOW | |
| Hyperlinks | `SetLink` / link adapter | beta.2 | inspector external-link field + restore-source action | safe protocol links | P2 | adapter/controller | build/browser smoke | INTEGRATE_NOW | core normalization remains authority |
| Alt text | name/accessibility metadata APIs | beta.2 | not exposed | image alt text editor | P1 | adapter/controller | browser pending | INTEGRATE_IF_SAFE | |
| Snapping/guides | `setSnapping`, snap APIs | beta.2 | editor default | explicit toggle | P1 | adapter/controller | browser pending | INTEGRATE_NOW | |
| Zoom | `setZoom` | beta.2 | status-bar slider + view tab +/-/fit | status-bar controls | P1 | controller/view | browser 7/7 | INTEGRATE_NOW | |
| Sections | no adapter seam in beta.2 | beta.2 | absent | bounded slide grouping | P2 | capability probe | none | DEFER_WITH_REASON | integrate only after a round-trip adapter seam is verified |
| Built-in templates | no adapter seam in beta.2 | beta.2 | blank local template | template gallery | P2 | capability probe | none | DEFER_WITH_REASON | verify package export before adding a product dependency |
| Theme/master/design | design APIs not yet validated | beta.2 | absent | optional design panel | P2 | deferred | none | INTEGRATE_IF_SAFE | requires round-trip proof |
| Charts | chart APIs not yet validated in Studio | beta.2 | absent | optional chart editor | P2 | deferred | none | INTEGRATE_IF_SAFE | lazy-load and round-trip proof required |
| Media | media APIs not yet validated in Studio | beta.2 | absent | offline media insert | P2 | deferred | none | INTEGRATE_IF_SAFE | offline asset policy and bundle budget |
| Comments | no confirmed public export | beta.2 | absent | review comments | P2 | deferred | none | DEFER_WITH_REASON | no stable public API confirmed |
| PPTX export | `Editor.save` | beta.2 | integrated | download without draft mutation | P1 | adapter | adapter/unit | INTEGRATE_NOW | |
| PDF/image export | no confirmed public export | beta.2 | absent | optional export | P2 | deferred | none | UNSUPPORTED_UPSTREAM | no stable public API confirmed |

No row is deferred solely for schedule. Deferred rows name the missing public API, round-trip, offline, or bundle evidence required to promote them.

## 2026-09-12 closure log

### Reused from web-ppt

- `queryRunProps` / `setRunProps`, `queryParaProps` / `setParaProps`, and `queryBodyProps` / `setBodyProps` remain the sole text formatting authority.
- `effectiveElement` plus `textBodyEditText` is the source for current text; the Studio no longer derives edited text from `record.src`.
- `AddSlide` with `doc.layoutOrder` / `doc.layouts` supplies the real layout gallery; `InsertRow`, crop, transition, animation, selection-pane, save, and preview continue through upstream commands or view seams.
- Stable thumbnails use the upstream `Viewer`; no second document or selection model was introduced.

### Referenced from PPTist / mature slide-editor patterns

- Ribbon grouping, split buttons, galleries, contextual tabs, a table picker, the three-column workbench, and explicit image/shape/table inspector sections follow the established Web Slide Editor interaction pattern.
- PPTist source is not copied into the repository; no AGPL source fragment was added in this pass.

### Local implementation retained

- ClassCore keeps only product orchestration: presentation-scoped local draft/server-pending metadata, Library/Publish/Rehearsal actions, classroom-facing status, and the thin command-to-adapter composition layer.
- The local icon SVGs remain because the classroom LAN requires offline assets and no remote icon/font dependency; each command now supplies an explicit icon or the legacy wrapper uses the neutral `more` glyph.
- Distribution remains a small controller fallback because beta.2 exposes no public distribution command; it is isolated and documented as partial rather than promoted to upstream capability.

### Closure status

`CLOSED`: version-line decision, command-surface icon guessing removal, explicit layer/alignment/distribution/transform icons, grouped Arrange menu separators, global menu-listener leak removal, explicit command toggle semantics, explicit control labels without redundant Ribbon group headings, responsive gallery access, scoped pending/recovery keys, effective-text reads, dynamic source aspect ratio, real layout gallery entry, and static source checks.

`CLOSED`: the seven-test Presentation Studio Chromium smoke is exercised locally on the current worktree; the historical CI run remains evidence for the earlier three-test surface only and is not reused as current-head evidence.

`PARTIAL`: shape/image/table formatting depth, full keyboard/context-menu coverage, offline recovery, conflict, Display, and authenticated classroom LAN/product readiness. These remain `CAPABILITY-INTEGRATION / NOT-FROZEN` until the corresponding product gates are exercised.

`DEFERRED`: sections, built-in template gallery, comments, PDF/image export, and unverified chart/media/master extensions because beta.2 has no confirmed safe product seam or round-trip evidence.

### Verification evidence

- Local `npm run check`: PASS; 146/146 unit tests plus build, formal lesson validation, distribution/display boundaries, load simulation, WebSocket/SQLite reference gate, and smoke.
- Local Chromium: `CLASSCORE_PRESENTATION_URL=http://127.0.0.1:28788 npm run test:e2e:presentation`: 7/7 PASS, including file/text/transition controls, notes/zoom, object context menu, and slide context menu.
- GitHub Actions final-head run: [34681175908](https://github.com/hello-yunshu/classcore/actions/runs/34681175908); `full-check (x64)`, `full-check (arm64)`, `native-arm64-docker-build`, and `presentation-browser-e2e` all PASS.
