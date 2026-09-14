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

## 1.1 当前主线修订 — 2026-09-11

- Presentation 编辑与播放只推进 `web-ppt`，不再保留其它编辑引擎选型分支。
- 当前已完成的是 web-ppt 核心链和薄接入 Alpha；下一阶段要把其已有的文字、图片、表格、变换、样式、页面和动画能力接入正式 Studio。
- Studio 布局先于工具堆叠：以教师 `1280×800` / `1440×900` 工作台为主目标，采用真实缩略图 + 16:9 中央画布 + 上下文检查台的三栏结构；详细布局和 Gate 见 `docs/development/PRESENTATION-WEBPPT-NEXT-PHASE.md`。
- Scene Studio 仅作 contract harness、测试夹具和紧急降级，不再扩展为第二套 Office 编辑器。
- 不修改 Foundation v0.1.2；第三方文档模型只能停留在 adapter/Studio bundle，课堂 Runtime 继续只消费 Published Presentation、Runtime Index 和权威 PlaybackState。

## 2. D2 — 双 Alpha

### Student Practice Alpha
- URL 进入练习；
- 使用最终 TransformBoard 核心交互：选择、拖动/平移、旋转、旋转中心、重置；
- 碎片编号/点命名；
- 本地状态保存/恢复或明确 restart；
- `student-light`，不等待完整 Server。

### Authoring Studio Alpha
- 浏览器创建/打开 Deck；
- 当前已完成页面 CRUD、基础图形、淡入步骤、保存/重开、预览播放和本地恢复；
- 下一阶段继续接入 web-ppt 的完整编辑能力与正式三栏布局，不把当前中性 Shell 当最终 UI；
- 教师最终课件必须经过 validate → freeze → fingerprint 后才能进入课堂发布链。

## 3. D7 — 完整公开课 RC

必须跑通：

`Backstage -> Session -> Teacher -> Student Join -> Activity -> TransformBoard -> Event/Snapshot/Submission -> Live -> Teacher/Observer -> Stage -> Web Presentation -> Display -> Reconnect/Degradation`

### 3.1 课程准备台 / 课堂控制台分层 — 2026-09-14

教师工作流固定为两个入口：

```text
课程准备台（Backstage，9688）
  创建课程工作区 → 导入 PPT/资源 → 配置 Lesson Package 基座 → 发布版本
                                      ↓
课堂控制台（Teacher Runtime，9602）
  选择已发布课程 → 创建 Session → 签发四端入口 → 控制现场
```

- Backstage 是课程资产、活动来源、资源文件、版本和运行资格的管理入口；不承担课堂 Participant Role。
- Teacher Runtime 是课堂现场唯一主控；不再承担课程文件管理和版本编辑。
- Student / Display / Observer 不选择课程，只通过服务端签发的 Session locator/credential 加入。
- Session 启动后固定 `courseId`、Lesson Package 基座、Presentation pin 和课程版本；后台后续编辑只影响下一次课堂。
- 当前已完成课程工作区的创建、草稿/发布、资源导入、PPTX→Published Presentation 绑定和独立 Session 启动垂直切片；任意新 Applet 图形化编排、跨 Lesson Package 热加载和 XP21A/LAN 仍是独立后续工作。

### 3.2 最新复验结果 — 2026-09-14

- 课程准备台工作区已能显示基座 Lesson Package 的 5 个课堂活动和基座资源；草稿课程不能启动，发布后才允许创建课堂 Session。
- 创建课程已改为页面内表单；导入 PPTX 会保存到工作区并自动生成 Published Presentation；启动结果固定课程版本并签发 Teacher / Student / Display / Observer 四端入口。
- 浏览器闭环已复验：Backstage 发布 → Teacher Runtime 自动加入 → Student 使用 A17 加入 → Teacher 发布当前活动 → Display 与 Observer 收到相同公共 Stage；Observer 只显示匿名伪名。
- 本轮流程修复已复验：创建课程表单取消后真实隐藏；Backstage 打开 Studio 会携带当前课程与已绑定 Presentation 上下文；Teacher 显示课程信息、服务端下发的学生/观察端凭证、可复制的大屏地址和返回准备台入口；Controller Lease 使用 45 秒 TTL、教师端每 10 秒自动续租，刷新后按最新 revision 自动恢复控制权，错误会明确提示“重新取得控制权”等恢复动作。
- 浏览器端到端复验：教师控制权持续超过原 20 秒窗口仍有效；教师发布当前活动、切换 Presentation 并播放后，Display/Observer 同步；Student 使用 A17 加入并提交后，Teacher 收到已确认资源；Backstage、Authoring、Teacher、Display、Observer、Student 六端 console warn/error 均为空。
- `npm run check`：PASS，186/186 tests，Formal/Lesson/Dist/HTTP/WS/Load/Smoke 全部通过。
- `npm run docker:gate`：PASS，当前宿主 Apple Silicon `linux/arm64`，容器用户 `node`，课堂端 9602 与本机工具端 9688 的隔离及 SQLite 重启序号恢复通过。
- 仍未宣称：XP21A 真机、真实课堂 LAN、authenticated D7 发布门禁、任意新 Applet 图形化编排和跨 Lesson Package 热加载。

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
- web-ppt Presentation Engine 核心 PoC 已完成并锁定版本；
- Authoring Studio mount。

### D2
双 Alpha。当前 web-ppt 薄接入 Alpha 已完成；下一阶段先完成 Editor Foundation + Layout Shell，再补完整内容工具。禁止在布局未稳定前继续堆叠零散按钮。

### D3
- Session / Join / Membership / Student identity claim；
- Teacher/Observer/Display Join；
- WebSocket Presence；
- Controller Lease；
- 线性 Activity；
- web-ppt 完整编辑第一批：页面/缩略图、选择变换、层级、文字、图片、图形、表格、基础样式；
- Studio 三栏布局、context toolbar、对象/页面/动画 inspector；
- 确定性 scene/step 与本地发布校验。

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
- Published Presentation + AssetStore：draft→validate→publish→freeze→fingerprint；
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

P0：D2 双 Alpha、web-ppt 完整编辑与 Studio 布局、D7 Join/Activity/TransformBoard、Durable/Snapshot/Submission/Reconnect、Teacher 控制、Display/Observer匿名投影、Web Presentation 制作/播放/同步、Backstage最小运维、Preflight。

P1：Published Presentation + AssetStore、Teacher/Display PlaybackState 恢复、Learning Analytics、规则Advice、动态课堂Widget、Simulation完善、自动浏览器并发。

P2：复杂图表/SmartArt/OLE 完整编辑、PowerPoint 全量主题/时间轴、完整PPTX兼容、多人CRDT、长期云端、原生App、其它第三方编辑引擎。
