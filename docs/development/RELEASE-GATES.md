# 发布 Gate — R3.10

## D2
- Student Practice使用最终TransformBoard核心；
- 基础触摸、重置、状态恢复可用；
- Authoring Studio可以创建/保存/重新打开/预览真实Deck；
- Presentation Engine PoC决策关闭。

## D7 — Public Lesson RC
- 六 Product Surface 有入口；
- Student/Teacher/Observer/Display课堂链路可用；
- Backstage本机创建/管理Session；
- Authoring Studio产出最终Web Deck；
- Durable Event/Snapshot/Submission/Reconnect可用；
- Teacher Lease和Presentation控制可用；
- Display/Observer只读同步且使用同一伪名；
- D7所需最小Session/Identity/Pseudonym/Stage/Presentation/Snapshot持久化已存在；
- Feature Policy/Preflight最小可用；
- fallback matrix演练；
- public-lesson RC与Lesson/Deck fingerprint冻结；
- Presentation Runtime Index 能拒绝不存在 scene / 越界 step；
- D6 轻量 48~50 Student + 20~40 Observer 基线已跑通；
- Apple Silicon Mac + Docker 的 `linux/arm64` 是 D7 必须通过的 Server 部署目标（跨架构原则不变）。

## D21
- 六 Product Surface独立bundle/entry；
- Simulation工程入口；
- Service Plane有参考实现；
- Applet schema registry + migration fixture；
- Learning Analytics与Foundation分离；
- Intelligence timeout/validation/fallback；
- 自动多用户/load/fault/recovery；
- `linux/amd64` Docker 构建/CI兼容验证；
- 至少第二个Applet和第二份公开课fixture证明可扩展；
- 中文扩展/维护文档完整。

## R3.10 开发母版 Gate

- 根目录 `AGENTS.md`、`CODEX-HANDOFF.md`、`.env.example`、`package-lock.json` 与 `FOUNDATION-SHA256SUMS` 存在且 `handoff:check` 通过；
- 正式工具链为 Node 26.8.2 Current / npm 11.19.1 / TypeScript 7.0.2 / Python 3.14.7，旧 Node/Python 线不会静默继续构建；
- clean checkout 的 `npm test` 自行 build，不依赖随 ZIP 携带的 `dist`；
- `lesson:validate` 使用正式 Draft 2020-12 Schema + 通用 semantic gate，并有 lazy asset、capability、server-owned event、Presentation cross-ref、path traversal 与非法枚举反例；
- Docker/CI 使用 `npm ci`，教师本机工具端口（Backstage + Authoring）在 Compose 中只发布到宿主 `127.0.0.1:8788`；
- `foundation:check` 为 exact-set freeze；修改、删除、新增未登记 Foundation 文件都会失败；
- CI 同时运行原生 Linux x64/arm64 full-check，并在 arm64 runner 上构建 `linux/arm64` Docker image；
- `check:dist` 编译后入口真实可解析；
- SQLite close/reopen恢复通过；
- 50 Student + 40 Observer + Teacher WebSocket/SQLite参考场景通过；
- 新公开课脚手架生成后 `lesson:validate` 通过；
- Docker runtime 使用非 root `node` 用户；Apple Silicon Docker实机构建仍是D7 Gate，不在无Docker环境中伪报通过；
- 自动 Docker host LAN-interface probe 不能替代 `docs/deployment/CLASSROOM-LAN-REHEARSAL.md` 中的真实 XP21A/LAN Gate。

## D7 执行命令边界

`deploy/docker/docker-compose.d7.yml` 只允许在真实认证课堂 Server 完成后使用。当前文件显式声明 `authenticated-classroom-server`、认证和产品就绪要求；reference Server 对这些配置会 fail closed，因此 D7 Docker Gate 保持失败，直到认证实现和六项产品证据完成。

- `npm run docker:gate`：跨架构通用 Docker build/run/restart 验证；
- `npm run release:check`：完整源码/完整性 + 通用 Docker Gate；
- `npm run release:d7`：**仅允许 macOS arm64**，并额外运行真实 `docker compose up` 部署入口 Gate；
- 最终仍须人工完成路由器 + XP21A rehearsal。


## D7 产品就绪硬门槛（R3.10）

`npm run d7:product` 读取 `config/d7-release-readiness.json`。Authenticated Classroom Server、TransformBoard、Presentation Runtime、Join/Presence/Submission、Teacher/Display/Observer 流程以及 XP21A/LAN 实机演练任一项没有证据时，该命令必须失败。`release:d7` 将它放在最前面；因此当前开发母包**故意不能**被技术 smoke 误标成课堂 RC。普通技术验证仍可分别运行 `npm run check`、`npm run docker:gate` 与 `npm run docker:compose:gate`。

未认证 reference Server 源码默认监听 `127.0.0.1`。只有明确进行受控 LAN 开发时才通过 `.env` 设置 `HOST=0.0.0.0`；这不代表身份认证已经完成。
