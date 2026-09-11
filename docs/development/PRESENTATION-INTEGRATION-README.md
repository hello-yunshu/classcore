# ClassCore Presentation Integration

## 当前主线

Authoring Studio 通过 `@classroom/presentation-webppt-adapter` 接入 web-ppt。第三方编辑器只负责网页课件的编辑、渲染、动画和 OOXML 保存；ClassCore 自己继续拥有 `PresentationAsset`、Presentation Library 的 Project/Asset/Revision/Session Pin、Runtime Index、`PresentationPlaybackState`、Projection 和课堂同步边界。冻结模型详见 `docs/development/PRESENTATION-LIBRARY-AND-FREEZE-MODEL.md`。

下一阶段只推进 web-ppt 的完整能力接入；工具栏、真实缩略图、三栏布局和响应式规则以 `PRESENTATION-WEBPPT-NEXT-PHASE.md` 为准。

web-ppt 版本固定为 `0.5.0-beta.1`，四个包均写入 workspace lockfile。Studio 的生产 bundle 使用 esbuild 打包，空白模板由构建脚本生成并放在 `dist/public`，因此运行时不依赖 CDN、公网字体或远程 editor runtime。

## 稳定身份约束

web-ppt 默认每次打开都会分配新的 session ID。Adapter 会把 `idPrefix` 放入 `PresentationAsset.document`，保存和重开时显式复用它；Runtime Index 使用同一组 stable scene IDs。裸调用 web-ppt `openEditor(bytes)` 不应被当作 ClassCore 的持久化入口。

## 当前可验证链

```text
内置本地模板
  -> WebPptPresentationEngineAdapter.createBlank
  -> openEditor / EditCore command
  -> Editor.save（真实 OOXML bytes）
  -> 同 idPrefix reopen
  -> RuntimeIndex
  -> PresentationState step playback
```

运行：

```bash
npm run build
node --test tests/presentation-webppt-adapter.test.mjs
```

Studio 使用 IndexedDB 保存二进制课件资源，localStorage 只保存小型元数据；“保存 / 重开”不会把 PPTX Base64 塞进 JSON。当前网页入口为本机 local-tools 端口 `/authoring`。

## 证据边界与后续 Gate

- Node 核心 create/edit/save/reopen/index/playback：已自动验证。
- 浏览器 mount/unmount/dispose、刷新恢复、全屏播放：需要真实浏览器证据。
- Reference Server 的 metadata-only AssetStore、Draft conflict、Recovery/Rehearsal/Published、Session Pin、Runtime Cache/GC 和 Presentation playback transport 已有模型级回归；认证账号 Server、Display reconnect、LAN/offline Docker：尚未闭环。
- `scripts/d7-verifiers/presentation-runtime.mjs` 已从 placeholder 改为 fail-closed verifier；没有完整 evidence JSON 时，`d7:product` 必须继续失败。

Scene Studio 保留为 fallback 和 contract harness，不再继续投入复杂 Office-like 编辑功能。
