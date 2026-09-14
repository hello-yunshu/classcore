# Architecture Stability Checklist — Foundation v0.1.2 / R3.10 CR11

## 工程优先级

**稳定性 > 流畅性 > 可恢复性 > 可维护性 > 基础安全。**

安全只处理会直接造成课堂误操作、身份串线、Observer/Display 泄露或本机工具端误暴露的基础问题，不扩展为重型攻防工程。

## Foundation 保持稳定

- [x] `Lesson -> Activity -> Applet Type/Instance -> Domain Event` 核心模型；
- [x] Command 与 Domain Event 分离；
- [x] Participant 与 Connection/Presence 分离；
- [x] Durable Event / Snapshot / Live State 分离；
- [x] Applet 经 Host，Type/Instance/StateScope/Schema/Migration 分离；
- [x] Artifact/Submission/Transfer/Workgroup 边界；
- [x] Stage 是公共展示状态，Presentation 是独立 Capability；
- [x] Foundation 不绑定 UI、WebSocket/DB、Presentation Engine、LLM；
- [x] Platform Abstraction 与 Capability Negotiation；
- [x] Session pinning、restart recovery、Feature Policy、Preflight 属于可靠性原则；
- [x] `FOUNDATION-SHA256SUMS + npm run foundation:check` 自动防止误改。

R3.10 未修改 `docs/contracts/v0.1.2`。工具链、Docker、Codex Handoff 与 Product Surface 路由调整不要求解冻 Foundation。

## Surface / Projection

- [x] 6 Product Surface：Student / Teacher / Display / Observer / Backstage / Authoring Studio；
- [x] 1 Engineering Surface：Simulation / Rehearsal；
- [x] Service Plane 与用户 Surface 分离；
- [x] ClientRole 只有 student/teacher/observer/display；
- [x] 真实学生身份在 Server-only Identity Directory；
- [x] Observer/Display 共享 Session pseudonym；
- [x] Canonical Stage 与 Projected Stage 分离；
- [x] Observer/Display 不能提交 Applet 学习 Event；
- [x] Presentation动态学生内容使用角色投影与语义 binding；
- [x] 9602 只提供 Student/Teacher/Display/Observer；
- [x] 9688 host-only 提供 Backstage/Authoring；
- [x] Simulation 不由生产HTTP Server暴露。

## 稳定 / 流畅 / 恢复 / 维护

- [x] Student 使用 `student-light`，Teacher/Observer允许 richer profile；
- [x] 服务端优先 Student Durable 与 Teacher Control；
- [x] Observer/低优先级Live可降级；
- [x] 学生名单Preflight阻止重复/歧义登录提示；
- [x] FeaturePolicy恢复单一事实源；
- [x] StudentClaim / Identity / Pseudonym / PresentationPlayback持久化边界；
- [x] RecoveryCoordinator恢复编排；
- [x] Presentation Runtime Index校验scene/step；
- [x] transport按Session隔离Event/Control ID、serverSeq和Stage广播；
- [x] `serverSeq` SQLite持久化，跨重启继续；
- [x] WebSocket消息上限与Observer背压；
- [x] 新公开课脚手架生成完整Lesson Package并正式校验；
- [x] clean checkout / lockfile / doctor / bootstrap / CI / Codex入口；
- [x] 50 Student + 40 Observer + 1 Teacher真实本地WebSocket+SQLite参考基线。

## 平台原则

- [x] 不冻结成单一CPU架构；
- [x] 本次公开课P0：Apple Silicon Mac + Docker / `linux/arm64`；
- [x] 长期兼容：`linux/amd64`；
- [x] 浏览器端 capability-driven；
- [x] `docker:gate` 自动验证当前宿主镜像、双端口、重启与SQLite序号恢复；
- [ ] Apple Silicon教师机真实 `npm run release:d7`：D1-D7完成；
- [ ] `linux/amd64` CI/实机构建：D21完成。

## 前端设计边界

Surface职责与runtime profile已约定；颜色、字体、布局、Design Token、组件视觉、Motion等**尚未冻结**，后续单独进入Product Design / UX / Design System阶段。

## 仍可替换的实现细节

React/Vue、Node Server framework、WebSocket库、SQLite driver、Canvas/SVG/Konva、web-ppt adapter implementation、LLM厂商、云部署、最终视觉设计。

当前手写WebSocket与`node:sqlite`只是零外部依赖 reference vertical slice，不是不可替换的Foundation组件。
