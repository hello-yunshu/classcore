# CODEX-HANDOFF — R3.10 当前开发交接

## 一句话状态

R3.10 是 **Release-Assurance Closure & Codex Mother Package**：Foundation v0.1.2 保持稳定，已经有可执行 HTTP/WebSocket + SQLite/WAL vertical slice、7 个中性 Web Shell、恢复/Session 隔离/伪名/Presentation Runtime 契约和参考并发测试；它仍不是最终公开课产品。

2026-09-11 Presentation closure progress：reference vertical slice 已补齐 quota preflight、staged GC strong-ref、cache eviction plan/reconcile、bytes-derived web-ppt freeze、Picker/`presentationId` block、Published Prepare、Rehearsal Session、Controller Lease reconnect、Display playback-only/remount 和 Studio conflict/thumbnail/批量 Undo；认证 owner、Playwright、Docker/LAN/XP21A 仍未验证。

2026-09-12 Presentation capability integration：Studio 已接入 Office-like command surface、local SVG icons、split/dropdown/gallery、contextual tabs、真实 upstream Selection Pane host、beta.2 text/paragraph/image/crop/effects/hyperlink/animation/transition adapters 与 presentation-scoped pending metadata；本地真实服务上的 Studio Browser E2E 7/7 已通过。Full reference-server readiness、Docker/LAN、save/reopen/offline/Display/XP21A 仍未闭合，状态继续保持 `CAPABILITY-INTEGRATION / NOT-FROZEN`。

2026-09-13 Presentation correctness/framework repair：移除表格 `editor.doc` 直接 mutation；新建形状、文本框和表格的中性默认值进入同一 web-ppt command/history；表格设计仅保留 beta.2 已公开的 `SetTableStyle`，隐藏未有真实 cell command 支撑的假控件；导出改为 `await controller.save()`，另存为副本创建独立 Library Draft；首条动画强制 `click`，bullet/auto-number 假控件移除；修复菜单键盘焦点与 submenu `aria-expanded`。Framework 关闭 instance capability union、expired rejoin fresh grant、artifact fail-closed、Transfer/Submission FSM 与 parity regressions。当前本地真实服务 Playwright 为 14/14 PASS，`npm run check` 为 154/154 PASS，reference Docker arm64 runtime gate 与 amd64 image build PASS；CI、认证课堂 Server、真实 LAN/offline、Display、XP21A 仍未验证，状态继续保持 `CAPABILITY-INTEGRATION / NOT-FROZEN`。

2026-09-13 Playback-fidelity direction reset：Office authoring parity 降为非主线，PPTX import/preservation/preflight/render/playback 成为主线；RuntimeIndex 增加可信 aspect/hidden 元数据；Display 移除固定 16:9 样式；Playback Adapter 增加 silent/live explicit seek；Presentation Project 增加 immutable originalAssetId；Studio no-op rehearse/publish 跳过 web-ppt save round-trip。真实 PowerPoint fixture、reference screenshot、CompatibilityReport UI、Display Browser E2E、离线/LAN、认证课堂与 XP21A 仍为 `NOT_EVALUATED`，冻结判断保持 `PLAYBACK-FIDELITY / NOT-FROZEN`。

## 接手后的第一步

```bash
npm run doctor
npm run bootstrap
```

若 `doctor` 显示 Node/npm/Python 不匹配，先切到 `.nvmrc` / `.node-version` 指定的 Node 26.8.2，并使用 Python 3.14.7。`bootstrap` 会使用 `package-lock.json` 执行 `npm ci`、创建 `.venv` 并安装 `requirements-dev.txt`，最后执行完整 `npm run check`。

先运行 `npm run d7:product` 查看真实产品 blocker。当前母包该命令**应当失败**，因为 Authenticated Classroom Server、TransformBoard、Presentation 与真实课堂链仍未完成。只有这些 requirement 都有实证后，才在教师 Apple Silicon Mac 上运行 `npm run release:d7`。它会把 Docker build/run/restart/SQLite 恢复变成自动 Gate；不要只依据静态 Dockerfile 判断“已经可上课”。

## 当前已经完成

- Foundation v0.1.2 契约与 Surface/Service Plane 边界；
- 6 Product Surfaces + 1 Engineering Surface + Service Plane；
- Student/Teacher/Observer/Display 身份与 Projection 边界；
- Session pseudonym；
- StudentClaim / reconnect 参考实现与持久化边界；
- RecoveryCoordinator；
- SQLite/WAL reference storage；
- HTTP + WebSocket reference server；
- session-scoped serverSeq、Event/Control 幂等、Server restart 序号恢复；
- Observer/Display Stage session 隔离与 Observer 背压降级；
- Presentation Runtime Index / validated control；
- 完整 Lesson Package 模板与正式 Schema + 通用 semantic gate（asset/capability/event authority/presentation/path containment）；
- 递归发现所有 Lesson Package，拒绝 symlink 与嵌套 package root 歧义；
- 公共 Projection / Presentation 共用统一 Private Identity Policy；
- Private Identity Guard 已覆盖 primitive string、数组元素、对象 key/value 与嵌套结构，并由 TS/JS/Python 共用 mutation corpus 锁定；
- roster preflight 能发现重复相同 `participantId`；Student Claim 与 roster hint 使用一致 trim 语义，空白 hint fail closed；
- Public Student Projection 仅对 Identity Directory 中真实存在的学生分配/返回 pseudonym；
- Teacher Submission/Artifact 显式 scope、Controller Lease Teacher-only 与无歧义幂等 tuple；
- Foundation exact-set freeze，新增未登记契约文件也会被拒绝；
- `workspace:check` 自动拒绝内部 workspace 缺失依赖、源码未声明内部 import 与依赖环；
- Apple Silicon `linux/arm64` P0 + `linux/amd64` 兼容构建路线；
- GitHub Actions 原生 x64 + arm64 full-check，并有原生 ARM64 Docker build job；
- Docker runtime 使用非 root `node` 用户；
- D7 Product Readiness manifest + fail-closed Gate，防止技术 smoke 全绿时误把母包标成课堂 RC；
- 未认证 reference Server 源码默认 loopback-only；需要 LAN 开发必须显式设置 `HOST=0.0.0.0`；
- reference transport 的重复 ID 会做 canonical payload 一致性校验，冲突重用明确拒绝；
- 中性 Web Shell（不是最终 Design）。
- Framework-first 通用运行时 slice 已接入：credential-based Join/Grant/Membership/Presence authority、Applet Registry/Host 与 synthetic `generic-counter`、原子 Event/Snapshot、Artifact/Submission/Transfer、Live quality broker、Widget Registry、Analytics timeout/fallback 与 Teacher-confirm；模型/集成证据见 `docs/development/FRAMEWORK-FIRST-MAINLINE.md` 与 `tests/framework-runtime.test.mjs`。
- D2 Student Practice Alpha：Student 轻量 TransformBoard 已支持选择、拖动、画布平移、旋转、旋转中心、重置、本地保存与刷新恢复；
- D2 Authoring Studio Alpha：浏览器内 Scene Studio 已支持页面增删/复制/排序、文字/图片 URL/SVG/基础图形、元素移动/尺寸/图层、保存重开和预览播放；
- Presentation 主线已接入真实 `@web-ppt/*@0.5.0-beta.2`：`@classroom/presentation-webppt-adapter` 负责 opaque OOXML bytes、稳定 `idPrefix`、编辑/保存/Runtime Index/Player 边界；Studio 生产 bundle 由 esbuild 构建，内置模板本地生成，草稿二进制走 IndexedDB；Studio 当前处于 upstream capability integration，尚未宣称最终 feature freeze；
- Presentation Studio 下一阶段 Editor Foundation + Layout Shell + 内容工具已完成：controller façade 收拢 web-ppt 命令，三栏工作台、真实 Viewer 缩略图、对象/页面/动画检查台、页面/对象 CRUD、文字/图形/表格/图片/背景、变换/层级/对齐/复制粘贴、撤销重做、键盘快捷键和响应式降级已接入；本地 Published AssetStore 已完成 validate→Runtime Index→freeze→fingerprint 不可变发布记录；
- Presentation Library reference vertical slice 已接入：Project/Current Draft/有限 Recovery Checkpoint/Rehearsal TTL/Published immutable Revision/Restore/Session Pin、content-addressed metadata-only AssetStore、唯一 blob quota、GC grace period、bounded Runtime Cache 和 Draft expectedRevision conflict detection；模型与边界见 `docs/development/PRESENTATION-LIBRARY-AND-FREEZE-MODEL.md`；
- Presentation Infrastructure Hardening 已继续收口：raw Asset API、owner asset claim、current-draft-only freeze、server-derived fingerprint、account quota enforcement、Session lifecycle、按 Session runtime cache pins/release、startup/periodic maintenance runner、prepare failure-safe 和 active revision guard；
- Teacher Presentation Library reference slice 已接入 Teacher Runtime 的“我的课件”入口，支持列表/搜索/导入/软删除/进入 Studio；Studio 已把 generation-drained autosave、Server Draft `If-Match`、offline pending 与当前编辑态缩略图接到 reference API；
- Presentation control 的 durable outcome dedup 已收口：相同 control payload 会重放第一次成功或失败结果，失败重试不会被转成 duplicate success；
- Presentation 主线本轮继续收口：staged/unattached asset claim 计入 owner quota 并支持 TTL，soft-deleted Project 支持 retention purge，Runtime Cache 支持启动 reconcile 与已有文件 hash/size 校验；freeze 由 Server 校验 web-ppt document/RuntimeIndex/classroom binding，revision switch 有 pin/playback compensation；
- Presentation closure repair：asset ingest/save 先做 quota preflight；有效 staged claim 作为 GC 临时强引用；Runtime Cache eviction 先计算不可变 plan，SQLite transaction 外执行文件删除并在失败后 reconcile；真实 web-ppt freeze 从 Draft bytes 生成 RuntimeIndex；Display 使用不含 editor/edit-core 的 playback bundle；revision switch 广播并按 revision/asset identity remount；Teacher Lease 支持 45 秒 renew、20 秒 reconnect grace 和 stale connection rejection；Teacher Library 提供 Picker、`presentationId` block 与 Published/Rehearsal Prepare。
- Teacher Library 已补齐 Server-first 新建、重命名、副本、导出、版本历史和删除入口；reference Teacher control 通过 Controller Lease，Display 已接入 exact Session Pin cached asset、authoritative resolver 和 reconnect player bundle；
- Studio 代码回归已修复页面上下移 anchor、当前编辑态 Preview、动画 append/显式 clear、批量删除/等距分布单 transaction；Teacher `presentation.control` 会校验 pinned RuntimeIndex、持久化 SQLite PlaybackState 并向 Display/Observer 广播；
- `presentation-runtime` D7 verifier 已从 placeholder 改为真实 fail-closed 核心链 verifier，并已补齐 presentation evidence；D7 overall 仍不能宣称完成；
- 当前 Presentation 唯一主线为 web-ppt；Studio 接入结果、课堂接缝边界和验收 Gate 见 `docs/development/PRESENTATION-WEBPPT-NEXT-PHASE.md`；
- D2 Alpha 有模型级回归与真实浏览器验收，Student 不加载 Presentation 编辑器，Foundation 与现有 Surface/Service Plane 边界保持不变；

## 当前明确未完成

- TransformBoard 与真实课堂 Server 的 Join/Activity/Submission 链接入；
- 认证账号服务器接入、真实身份 owner authorization、Studio Library 的完整版本历史 UI；reference API/Picker/Prepare/设计绑定的模型级路径已存在，但不是认证产品能力；
- Presentation PlaybackState 与 Teacher lease 的正式课堂授权、Display player/reconnect 的真实浏览器闭环；reference transport 已有 pinned revision + SQLite sync 接缝，仍未宣称 D7；
- Playwright Browser E2E 已在当前工作树本地真实服务通过 14/14；offline-after-prepare、真实认证课堂 Docker/LAN/XP21A 证据仍未完成；reference runtime snapshot/asset API 与 Prepare/Pin 接缝已存在，不能替代认证课堂能力；
- `selected-artifact` 等 Widget selector 与真实课堂 Stage/Artifact public/teacher projection 的正式接线；通用 Widget Registry primitive 已完成，但尚未替代 reference transport。
- 浏览器 mount 的长期 soak、Server restart/Display reconnect、真实 Docker/LAN/XP21A evidence；
- 完整 Join / Presence / Outbox / Submission / Artifact Exchange 产品链；
- Teacher / Observer / Display 的完整正式课堂 UI（Teacher 目前只有课件库入口，课堂控制仍是 reference transport）；
- Lesson-specific Analytics Runtime 与《图案的还原》规则智能；
- authenticated D7 Docker/LAN classroom runtime；本轮通用 reference Docker gate 已在 Apple Silicon `linux/arm64` 通过，amd64 镜像构建/架构检查也通过，但这不等于 D7 authenticated gate。
- 真实路由器 + XP21A LAN rehearsal（自动 host LAN-interface probe 不能替代）；
- XP21A 小规模真机 smoke（若设备可得）。

本轮主线验证状态：`npm run check` 通过，154/154 tests、50 Student + 40 Observer simulation、真实 WebSocket + SQLite load、arm64 reference Docker runtime gate 与 amd64 image build 通过；本地 Playwright 14/14 通过；认证 owner、正式课堂 LAN/offline 与 XP21A 仍为 `NOT_EVALUATED`。

## 开发优先级

1. Teacher Runtime / Display PresentationPlaybackState 同步与恢复；
2. Server Published Presentation + AssetStore 与课堂资源 API；
3. `selected-artifact` binding / projection；
4. Analytics / Rule Intelligence / Advice；
5. D6并发、断网重连、Server restart、Observer降级演练；
6. D7冻结RC，不再加功能。

## 三个硬节点

- D2（2026-09-11）：Student Practice Alpha + Authoring Studio Web Presentation Alpha；
- D7（2026-09-16）：完整公开课可运行 RC；
- D21（2026-09-30）：完整架构实现基线与第二节公开课扩展证明。

## 当前部署基线

- Host：Apple Silicon MacBook Pro；
- Server：Docker，P0 `linux/arm64`；
- 兼容目标：`linux/amd64`；
- Student：弱 Android/SeeWooOS Browser，student-light；
- Teacher/Observer：允许 richer；
- Core课堂路径：LAN-first，不依赖互联网。

## 不要做

- 不要再发明新 Core 层；
- 不要为了新课程修改 Foundation；
- 不要把复杂 3D/WebGL/本地大模型放到弱学生平板；
- 不要把 Observer 流量放在 Student durable / Teacher control 之前；
- 不要把当前 Web Shell 当成视觉设计定稿；
- 不要把 `.runtime-data`、`dist`、`node_modules`、`.venv` 提交进最终源码 ZIP。

## Codex 默认继续动作

如果用户只说“继续推进”而没有重新指定技术方向，不要重新从零审计 Foundation。按下面顺序继续：

1. 运行 `npm run doctor`，再运行 `npm run bootstrap`；
2. 继续完成 Published Presentation/AssetStore/Teacher-Display recovery vertical slice；
3. 每个小阶段至少运行 `npm run check:fast`，涉及 Runtime/Storage/Realtime/Presentation/Docker 时运行完整 `npm run check`；
5. 只有真实实现证据表明现有 Foundation 无法表达需求时，才提出 Foundation 变更，不要因为某个页面实现不方便而改 Core。


## 当前最近一次验证证据

本轮已在 Node 26.8.2/npm 11.19.1/Python 3.14.7 下完成独立构建与完整复验。除 R3.8 已有的 Lesson/Authorization/Docker 反例外，CR11 在既有数组/object-key/roster/class 防线之上，继续拒绝普通文本、URL、stringified JSON 以及多层 percent/Unicode/hex/HTML 实体编码中的稳定身份 token，并把同一 mutation corpus 锁定在 TS Runtime、JS Lesson Validator 与 Python Formal Validator。

当前环境若缺少精确 Node 26.8.2/npm 11.19.1/Python 3.14.7 或 Docker，不得把对应 Gate 伪报为通过。Codex 在可联网正式环境先执行 `npm run bootstrap`；在教师 Apple Silicon Mac 冻结 RC 前执行 `npm run release:d7`，随后按 `docs/deployment/CLASSROOM-LAN-REHEARSAL.md` 完成真实 XP21A/LAN 演练。

本轮 D2 Alpha 已完成；主要工作已经从“继续设计架构”切换为“完成能稳定上课的真实产品”。

## Framework-first Mainline 最新验证

- `npm run check:fast`：通过；
- `npm run check`：通过；136/136 unit/integration/reference HTTP/WS tests，Formal/Lesson/Dist/Load/Smoke 全部通过；
- `npm run docker:gate`：通过；当前宿主 `linux/arm64`，镜像用户 `node`，重启恢复与端口隔离通过；
- `docker build --platform linux/amd64`：通过架构与非 root 用户检查，未执行 amd64 runtime soak；
- `npm run d7:product`：仍按设计失败，6 个正式课堂 blocker 未被伪报为 ready；
- Core pollution scan：`packages/contracts`, `runtime`, `storage`, `realtime`, `projections`, `applet-sdk`, `intelligence`, `platform` 未发现课程专有关键词。

## D2 Alpha 最新验证

- `npm run check`：完整通过；136/136 unit/integration tests，Contract/Formal/Lesson/Dist/HTTP/WS/Load/Smoke 全部通过；
- 真实浏览器：Authoring web-ppt 页面 CRUD、形状与淡入步骤、保存/重开、预览/下一步、刷新恢复与本地发布指纹通过；浏览器无 error/warning console log；
- Presentation 核心 verifier 已通过，但仍未声称 D7 完成：认证课堂 Server、Join/Presence、Teacher/Observer/Display 同步、Published Presentation/AssetStore、真实 Docker/LAN/XP21A 仍待完成。
