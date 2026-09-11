# 完整长期开发主计划 — Roadmap R3.10

> Foundation：**v0.1.2 Frozen**  
> Contract Correctness：**CR11**  
> Roadmap：**R3.10**  
> 基准日：**2026-09-10**  
> 硬节点：**D2 / 9月11日，D7 / 9月16日，D21 / 9月30日**

本文件是唯一权威进度计划。若专项文档冲突，以本文件为准。

## 1. 总原则

工程优先级：**稳定性 > 流畅性 > 可恢复性 > 可维护性 > 基础安全**。

时间策略：先纵向跑通，再扩功能；D7 之后公开课 RC 分支冻结，D8-D21 的长期开发不能反向破坏 RC。

产品结构：6 Product Surfaces + 1 Engineering Surface + Service Plane。课堂 ClientRole 仍只有 student / teacher / observer / display。

## 2. D2 — 双 Alpha

### Student Practice Alpha
- URL 进入练习；
- 使用最终 TransformBoard 核心交互：选择、拖动/平移、旋转、旋转中心、重置；
- 碎片编号/点命名；
- 本地状态保存/恢复或明确 restart；
- `student-light`，不等待完整 Server。

### Authoring Studio Alpha
- 浏览器创建 Deck；
- 页面增删复制排序；
- 文字、图片、SVG、基础图形；
- 移动/缩放/图层；
- 保存、重新打开、预览播放；
- 教师从 D2 开始制作最终公开课网页版 PPT。

## 3. D7 — 完整公开课 RC

必须跑通：

`Backstage -> Session -> Teacher -> Student Join -> Activity -> TransformBoard -> Event/Snapshot/Submission -> Live -> Teacher/Observer -> Stage -> Web Presentation -> Display -> Reconnect/Degradation`

六个 Product Surface 都有最小可用入口：
- Student：课堂加入、当前 Activity、TransformBoard、提交、自己的建议；
- Teacher：Activity/Stage/Presentation 控制、Lease、真实学生投影、关键学生资源；
- Display：干净只读、Presentation/Stage 同步、学生统一伪名；
- Observer：只读、匿名、聚合/证据/建议/选定 Live；
- Backstage：本机 Session、名单、凭证、Preflight、Diagnostics、Feature Policy、日志；
- Authoring Studio：最终 Deck 可编辑、关键动画/步骤、课堂动态 Widget binding。

### D7 前必须已有的最小持久化
为了支持刷新和 Server restart，D4-D6 必须完成最小持久化：
- Session / current Activity / Feature Policy；
- Controller Lease 必要状态；
- StageState / PresentationPlaybackState；
- Identity Directory；
- Session pseudonym mapping；
- Applet Snapshot；
- Resolved Lesson/Deck fingerprint 与可恢复位置。

D8 后再做通用 retention、cleanup、migration，不把“首次持久化”拖到 D8。

## 4. D1-D7 关键路径

### D1
- CR11 验证正确性收口已完成：身份隐私 mutation corpus、重复 participantId preflight、StudentClaim hint normalization、Public pseudonym existence guard；R3.8 的恢复单一事实源、StudentClaim 持久化、Recovery Coordinator 与真实 WebSocket+SQLite vertical slice 保持通过；
- 跨架构原则生效：Server 应用逻辑不绑定 CPU，D7 必须支持 Apple Silicon Mac + Docker 的 `linux/arm64`；
- 可执行 Server vertical slice 已有，开始接入真实 Session/Join/Runtime；
- Student Shell / TransformBoard pointer skeleton；
- Presentation Engine PoC，最多 4 小时；
- Authoring Studio mount。

### D2
双 Alpha。禁止为了 Teacher/Observer 美化拖延 D2。

### D3
- Session / Join / Membership / Student identity claim；
- Teacher/Observer/Display Join；
- WebSocket Presence；
- Controller Lease；
- 线性 Activity；
- Presentation 基础编辑与确定性 scene/step。

### D4
- SQLite 映射 `RuntimeRecoveryStorage`：Session（含 FeaturePolicy）/ Membership / Lease / Stage；
- StudentClaim / Identity / Pseudonym / PresentationPlaybackState 最小恢复写入 SQLite，并由 RecoveryCoordinator 统一恢复；
- IndexedDB Outbox；
- SQLite 原子 Event 接收 / dedup / serverSeq；
- Snapshot / reconnect；
- Submission；
- Live subscription / QoS；
- Teacher/Observer/Display Projection；
- Presentation scene/step 同步；
- 开始持久化 Session/Identity/Pseudonym/Stage/Presentation。

### D5
仅做最终教学设计真正需要：
- 本课 Learning State/Profile；
- 规则 Diagnosis / Evidence / Advice；
- Presentation 动态 Widget；
- Instruction Builder / Pair / ArtifactTransfer 若是最终教学硬需求则进入，否则延期。

### D6
- 六产品端全部可用；
- **继续跑 48~50 Student + 20~40 Observer 的真实 WebSocket + SQLite 基线**，并逐步加入断线/重连/慢消费者；
- Backstage Preflight / Diagnostics；
- Simulation 基础场景；
- final Web Deck；
- Server restart / reconnect / identity-pseudonym recovery；
- 完整教学脚本演练。

### D7
只回归、修 Bug、降级演练、冻结 RC；原则上禁止新功能。

## 5. D8-D14 — 通用化和维护能力
- SQLite 真实事务/恢复测试；
- 通用 package retention/cleanup；
- Projection registry 覆盖；
- Presentation Adapter 稳定与 deck migration；
- Learning Analytics Contract v0.1；
- 扩展 D6 轻量并发基线为完整 BrowserContext / fault simulation；
- 性能指标与 fault controls；
- 新公开课模板和扩展脚手架持续验证。

## 6. D15-D21 — 完整架构实现基线
- 六 Product Surface 独立 bundle/entry；
- Simulation 完整工程入口；
- Server packaging/run command；
- `linux/arm64` Docker 路径稳定，补 `linux/amd64` 构建/CI验证；
- Applet SDK/Host 包边界；
- 第二个简单 Applet；
- 第二份公开课 fixture，证明不改 Core 可扩展；
- migration runner；
- Lesson package loader/compiler；
- Analytics/Intelligence 分层；
- 自动多浏览器/load/fault/restart；
- 中文扩展指南、ADR、release package。

D21 不等于商业平台完成：不要求云账号、插件市场、原生 App、完整 Office/PPTX、LTI/xAPI/QTI 全实现、CRDT。

## 7. 范围保护

P0：D2 双 Alpha、D7 Join/Activity/TransformBoard、Durable/Snapshot/Submission/Reconnect、Teacher 控制、Display/Observer匿名投影、Web Presentation 制作/播放/同步、Backstage最小运维、Preflight。

P1：Learning Analytics、规则Advice、动态课堂Widget、Simulation完善、自动浏览器并发。

P2：复杂动画、完整PPTX兼容、长期云端、原生App、复杂第三方集成。
