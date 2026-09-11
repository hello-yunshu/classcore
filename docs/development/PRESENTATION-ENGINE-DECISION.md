# 网页版 PPT 引擎决策 — web-ppt 主线

## 目标

需要的是**网页原生的PPT式制作 + 播放 + 课堂同步**，不是单纯浏览`.pptx`。

## 决策

### web-ppt：唯一继续推进的网页 Presentation 引擎
固定版本：`@web-ppt/core@0.5.0-beta.1`、`@web-ppt/edit-core@0.5.0-beta.1`、`@web-ppt/editor@0.5.0-beta.1`、`@web-ppt/viewer-core@0.5.0-beta.1`，许可证为 MIT。

真实 PoC 已验证：本地模板新建、OOXML 保存/重开、固定 `idPrefix` 后的 scene identity、编辑命令、淡入 click batch、Runtime Index 以及 headless `PresentationState` 控制。下一阶段不再做引擎选型，而是补齐 web-ppt 已有能力的产品工具栏、布局和课堂资源链。

## 已完成的核心 Gate
用真实公开课内容验证：空白Deck、页面CRUD、文字/图片/SVG/图形、拖拽/缩放/图层、保存/重开、播放、step同步接缝、一个课堂动态占位元素。

当前核心 Gate 已通过。Scene Studio 仅保留为 contract harness、测试夹具和紧急降级，不再扩展 Office-like 能力。web-ppt 的 beta 风险通过版本锁定、离线 bundle、真实保存/重开、浏览器验证和 fail-closed verifier 管理。

下一阶段的详细范围与布局约束见 `docs/development/PRESENTATION-WEBPPT-NEXT-PHASE.md`。

## 集成边界

`Engine-native document -> PresentationAsset -> Engine Adapter -> PresentationPlaybackState`

Classroom Runtime只关心Stage和权威播放状态，Student bundle永远不加载Presentation编辑器。

Presentation 资源的长期归属采用独立的 Project/Asset/Revision/Session Pin 模型：Draft 可变且受乐观并发保护，Rehearsal/Published 不可变并只引用 content-addressed Asset。SQLite 只存 metadata，课堂 Prepare 阶段把 exact pinned revision 放入有界 Runtime Cache；实现与当前未验证边界见 `docs/development/PRESENTATION-LIBRARY-AND-FREEZE-MODEL.md`。
