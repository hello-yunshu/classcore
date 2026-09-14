# 正式开发 Gate — R3.10 / CR11

## 结论

**PASS — 可以作为 Codex 无缝接手的正式开发母版进入 D1-D7 产品实现。**

Foundation v0.1.2 继续保持稳定。R3.10 不增加新的 Core 层，主要关闭 R3.8 mutation audit 暴露的身份隐私递归、跨语言 validator parity、roster duplicate participantId、Student Claim normalization 与 phantom public pseudonym 问题；R3.8 已建立的 clean checkout、Lesson、Docker/ARM64 和发布 Gate 继续保留。

> PASS 的含义是“可以正式继续开发”，不是“已经可以直接上公开课”。TransformBoard、真实 Presentation Engine、完整 Join/Presence/Outbox/Submission、正式课堂 UI、Apple Silicon Docker 实机与教室网络验证仍属于 D1-D7。

## 当前 Gate 已闭环

- 根目录 `AGENTS.md` + `CODEX-HANDOFF.md` 提供持久开发上下文；
- `package-lock.json`、`.nvmrc`、`.node-version`、`.npmrc`、`.env.example` 完整；
- Node 26.8.2 Current + npm 11.19.1 + TypeScript 7.0.2 + Python 3.14.7 + jsonschema 4.26.0 由中央配置管理；
- `npm test` 在 clean checkout 下先 build，不依赖 ZIP 内旧 `dist`；
- `lesson:new -> lesson:validate` 使用正式 Draft 2020-12 Schema 与跨文件引用验证；
- Private Identity Policy 以单一 JSON 配置为源，并通过 TS Runtime / JS Lesson Validator / Python Validator 共用 mutation corpus 验证；
- roster preflight、Student Claim normalization 与 Public pseudonym 存在性均有负向回归；
- Foundation hash 自动防漂移；
- 9602 生产课堂端口只承载 Student / Teacher / Display / Observer；
- 9688 为教师本机工具端口，承载 Backstage + Authoring；
- Simulation 是 Engineering Surface，不由生产 Server 暴露；
- SQLite/WAL、session-scoped id/sequence、restart recovery、Observer背压、WebSocket消息上限保持可执行 reference vertical slice；
- `docker:gate` 提供跨架构 Docker 验证；`release:d7` 额外强制 Apple Silicon macOS 并验证真实 Compose 部署入口；
- `workspace:check` 检查所有内部 workspace dependency 是否存在、源码 import 是否声明、依赖图是否无环；
- GitHub Actions 最小 CI 已存在。

## R3.10 本轮验证证据

- 独立源码构建后自动测试：105/105 PASS；
- Foundation exact-set：46/46；
- Lesson formal + semantic validation：PASS；
- SQLite recovery / Server smoke / WS reference load：PASS；
- 精确 Node 26.8.2 + npm 11.19.1 + TypeScript 7.0.2 + Python 3.14.7 bootstrap、Docker Desktop、Apple Silicon `release:d7` 与 XP21A 真机：升级后必须重新在正式外部环境补跑。

## D1-D7 仍必须完成

1. TransformBoard 正式学生交互；
2. Presentation Engine 真实 PoC并接入 Authoring Studio/Player；
3. Session/Join/Membership/Presence/Controller Lease 接入真实 Server；
4. Durable Event / Outbox / ACK / Retry / Snapshot / Submission 完整链路；
5. Teacher / Student / Observer / Display / Backstage / Authoring 正式产品 UI；
6. Lesson-specific Analytics / Rule Intelligence / Advice；
7. 教师 Apple Silicon Mac 上执行 `npm run release:d7` 并完成 LAN rehearsal；
8. 若可获得XP21A，做小规模真机 smoke。

## 不作为当前 Gate 的目标

- 重型安全框架；
- 完整 Office/PPTX 兼容；
- 云账号平台；
- 微服务/Redis/Kafka；
- CRDT；
- 原生 App；
- D7 前强制完成 `linux/amd64` 实机验证；
- 当前就冻结前端视觉 Design System。


## D7 Product Readiness

R3.10 新增 `npm run d7:product`。它是产品完成度 Gate，不替代 Schema/Runtime/Docker Gate；相反，它防止这些技术 Gate 全绿时把尚未接入 Authenticated Join/Server 与真实课堂链的母包误判为 D7 RC。当前母包存在明确 blocker，因此该命令预期失败。
