# Presentation Upstream Capability Matrix

Status: `CAPABILITY-INTEGRATION / NOT-FROZEN`  
Engine: `web-ppt`  
ClassCore line: `0.5.0-beta.2` (the highest common published beta line currently available)

The Studio owns product orchestration and user-facing state. Editing, selection, text search, format painting, transitions, animation data, image crop, snapping and selection-pane behavior stay behind the `PresentationStudioController` and the adapter; no parallel editor state machine is introduced.

| Capability | Upstream API | Upstream Version | ClassCore Current | ClassCore Target | Priority | Implementation | Tests | Status | Reason if Deferred |
|---|---|---|---|---|---|---|---|---|---|
| Slide CRUD/reorder | `Editor.exec` slide commands | beta.2 | integrated | stable | P0 | controller | adapter/unit | INTEGRATE_NOW | |
| Clipboard / undo / redo | `copyElements`, `Editor` history | beta.2 | integrated | stable | P0 | controller | adapter/unit | INTEGRATE_NOW | |
| Selection pane | `mountSelectionPane`, `attachSelectionPane` | beta.2 | adapter seam | mounted in Studio | P0 | adapter/controller | browser pending | INTEGRATE_NOW | |
| Format Painter | `startFormatPainter`, `cancelFormatPainter` | beta.2 | exposed by adapter | ribbon action | P0 | adapter/controller | browser pending | INTEGRATE_NOW | |
| Find / Replace | `openTextSearch`, `nextTextSearch` | beta.2 | exposed by adapter | ribbon action | P0 | adapter/controller | browser pending | INTEGRATE_NOW | |
| Alignment | `AlignElements` | beta.2 | multi-select | six-way + single slide align | P0 | controller | unit/browser pending | INTEGRATE_NOW | |
| Distribution | upstream distribution command | beta.2 | local fallback | upstream command | P0 | controller | browser pending | INTEGRATE_IF_SAFE | verify public export |
| Layer | `SetZ` | beta.2 | integrated | four layer actions | P0 | controller | adapter/unit | INTEGRATE_NOW | |
| Group / Ungroup | `Group`, `Ungroup` | beta.2 | available | ribbon/context action | P0 | controller | browser pending | INTEGRATE_NOW | |
| Flip / Rotate | `SetFlip`, `SetXfrm` | beta.2 | integrated | ribbon action | P0 | controller | adapter/unit | INTEGRATE_NOW | |
| Shape gallery | upstream shape catalog | beta.2 | one default shape | categorized catalog | P0 | adapter catalog | browser pending | INTEGRATE_IF_SAFE | confirm stable public catalog |
| Shape adjustments | adjustment/edit geometry APIs | beta.2 | not exposed | drag + round-trip | P1 | adapter/controller | browser pending | INTEGRATE_IF_SAFE | API surface needs final review |
| Text run formatting | `queryRunProps`, `setRunProps` | beta.2 | basic styles | range/caret formatting | P0 | controller | unit/browser pending | INTEGRATE_NOW | |
| Paragraph/body formatting | `queryParaProps`, `setParaProps`, `setBodyProps` | beta.2 | not exposed | paragraph toolbar | P0 | controller | browser pending | INTEGRATE_NOW | |
| Image insert/replace/crop | image APIs + `startImageCrop` | beta.2 | insert only | insert/replace/crop | P0 | adapter/controller | browser pending | INTEGRATE_NOW | |
| Background | `setBackgroundImage`, slide properties | beta.2 | solid/image | custom color + image crop | P0 | controller | adapter/browser pending | INTEGRATE_NOW | |
| Slide layout/size | slide property APIs | beta.2 | fixed 16:9 | query/set layout and size | P1 | adapter/controller | browser pending | INTEGRATE_IF_SAFE | |
| Transitions | `queryTransition`, `setTransition`, `previewTransition` | beta.2 | playback reads source | gallery + preview | P0 | adapter/controller | browser pending | INTEGRATE_NOW | |
| Animations | `SetAnimations`, animation catalog | beta.2 | fade append/clear | catalog + timing/order | P0 | controller | adapter/unit | INTEGRATE_NOW | |
| Animation pane | `querySlideAnimations` | beta.2 | read-only list | select/order/delete/edit | P1 | controller | browser pending | INTEGRATE_IF_SAFE | |
| Notes | `SetNotes` | beta.2 | integrated | bottom notes bar | P1 | controller | adapter/unit | INTEGRATE_NOW | |
| Hyperlinks | `SetLink` / link adapter | beta.2 | not exposed | safe protocol links | P2 | adapter/controller | security pending | INTEGRATE_IF_SAFE | |
| Alt text | name/accessibility metadata APIs | beta.2 | not exposed | image alt text editor | P1 | adapter/controller | browser pending | INTEGRATE_IF_SAFE | |
| Snapping/guides | `setSnapping`, snap APIs | beta.2 | editor default | explicit toggle | P1 | adapter/controller | browser pending | INTEGRATE_NOW | |
| Zoom | `setZoom` | beta.2 | snapshot only | status-bar controls | P1 | controller/view | browser pending | INTEGRATE_NOW | |
| Sections | no stable ClassCore adapter yet | beta.2 | absent | bounded slide grouping | P2 | deferred | none | DEFER_WITH_REASON | no confirmed stable public section API |
| Built-in templates | no confirmed public export | beta.2 | blank local template | template gallery | P2 | deferred | none | DEFER_WITH_REASON | no confirmed stable public API; blank template remains local |
| Theme/master/design | design APIs not yet validated | beta.2 | absent | optional design panel | P2 | deferred | none | INTEGRATE_IF_SAFE | requires round-trip proof |
| Charts | chart APIs not yet validated in Studio | beta.2 | absent | optional chart editor | P2 | deferred | none | INTEGRATE_IF_SAFE | lazy-load and round-trip proof required |
| Media | media APIs not yet validated in Studio | beta.2 | absent | offline media insert | P2 | deferred | none | INTEGRATE_IF_SAFE | offline asset policy and bundle budget |
| Comments | no confirmed public export | beta.2 | absent | review comments | P2 | deferred | none | DEFER_WITH_REASON | no stable public API confirmed |
| PPTX export | `Editor.save` | beta.2 | integrated | download without draft mutation | P1 | adapter | adapter/unit | INTEGRATE_NOW | |
| PDF/image export | no confirmed public export | beta.2 | absent | optional export | P2 | deferred | none | UNSUPPORTED_UPSTREAM | no stable public API confirmed |

No row is deferred solely for schedule. Deferred rows name the missing public API, round-trip, offline, or bundle evidence required to promote them.
