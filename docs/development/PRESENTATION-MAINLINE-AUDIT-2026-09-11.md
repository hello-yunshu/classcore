# Presentation / 网页 PPT 主线审计（2026-09-11）

## 结论

web-ppt 通过了当前可执行的核心 Integration Gate，现已确定为 ClassCore 唯一继续推进的网页 Presentation 引擎；现有 Scene Studio 仅保留为 fallback、contract harness 和紧急降级，不再扩大为第二套 Office 编辑器。下一阶段目标是完整接入 web-ppt 已有编辑能力，并先完成稳定的三栏 Studio 布局。

## 架构审计结果

| 审计项 | 结论 |
| --- | --- |
| Presentation Contract | 保留。`PresentationAsset`、Adapter、Runtime Index、PlaybackState、semantic binding 已能表达引擎替换；新增 binary source 外壳，不扩散第三方文档类型。 |
| `PresentationEngineAdapter` | 可承载 web-ppt。新增 `@classroom/presentation-webppt-adapter`，固定 engine descriptor 与 `idPrefix` 恢复约束。 |
| Studio 定位 | 已从 Scene Studio Alpha 转为 web-ppt authoring host；旧纯模型函数保留作 contract tests，旧 renderer 不再作为主编辑器。 |
| Core 边界 | 未引入 web-ppt `EditDoc` 到 Foundation/Runtime。第三方类型只停留在 adapter/Studio bundle。 |
| Build system | 原手写 import map 无法承载第三方 ESM graph；改为 esbuild bundle Presentation Studio，并构建本地 blank template。 |
| Server/Storage | 已有 SQLite playback store 和 RecoveryCoordinator，但尚无 Published Presentation 资源/发布 HTTP API；这是下一条 vertical slice。 |
| 权威状态 | `StageState` 只表达 `contentType`/deck 引用；`PresentationPlaybackState` 负责 scene/step/playState/revision。当前没有新增第二份 scene/step 状态。 |
| D7 verifier | 已移除 placeholder，改为 fail-closed：它会实际运行 create/edit/save/reopen/index/headless playback，并要求浏览器/offline evidence；其它 D7 requirement 仍会继续阻断 `d7:product`。 |

## web-ppt 核心 Gate 证据

- 空白课件：由 build 生成的本地模板支持“新建”，不要求用户先上传 PPTX。
- 创作：真实 web-ppt editor 支持页面新增/复制、原生 SVG 编辑画布、形状、选择/变换、撤销/重做；文字编辑由上游编辑器接管。
- 保存恢复：`Editor.save()` 产生真实 OOXML bytes；IndexedDB 保存 bytes，localStorage 只保存小型 metadata。
- 动画播放：`SetAnimations` 写入 click-triggered fade batch；`PresentationState` 和 Studio Player 通过 adapter 提供 next/previous/nextStep/finish 控制。
- 稳定 identity：web-ppt 默认 session ID 不稳定；Adapter 将 `idPrefix` 纳入 asset metadata，重开时显式复用，Runtime Index 的 sceneId 因而稳定。
- 离线构建：esbuild 将第三方 ESM 与依赖打入 `dist/public/assets/apps/presentation-studio/bundle.js`；blank template 也是本地资源。

## 必须修改 / 建议修改 / 保留 / 暂缓

### 必须修改

1. 增加 Published Presentation draft→validate→publish→freeze→fingerprint 流程及 server asset API。
2. 将 PresentationPlaybackState 控制接入 teacher lease、SQLite recovery 和 Display player。
3. 把 classroom widget registry/resolver 接入实际的 `selected-artifact` overlay，并确保 public projection fail closed。
4. 增加真实 browser refresh、server restart、Display reconnect、arm64/amd64 Docker 与 LAN evidence。

### 建议修改

1. 为 web-ppt Adapter 增加二进制 AssetStore 接口，Server 只保存 content-addressed asset metadata/path，不保存巨大 JSON。
2. 为 Studio 增加标题编辑、图片本地导入和播放态 full-screen keyboard controls；继续复用上游编辑器能力。
3. 为第三方依赖记录升级策略与 license manifest，beta 版本升级必须重新跑 identity/animation/offline Gate。

### 可以保留

- `packages/presentation` 的引擎无关类型、revision control、runtime index 和 widget projection guard。
- 现有 SQLite `PresentationPlaybackStore`、RecoveryCoordinator 接口与 Stage/Presentation 分工。
- Scene Studio 纯模型函数与最小 fallback renderer。

### 暂不建议开发

- 自研文本编辑器、多选/resize/undo 栈、复杂 timeline、表格/图表、完整 PPTX fidelity、CRDT、Observer/Backstage 美化。

## 下一阶段顺序

```text
PublishedPresentation + AssetStore
  -> teacher control + lease + SQLite playback
  -> Display-only adapter player + reconnect
  -> selected-artifact public/teacher resolver
  -> Docker restart/offline/LAN evidence
```
