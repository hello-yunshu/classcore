# 云云科（ClassCore）— Classroom Runtime Foundation v0.1.2 / R3.10 / CR11

这是后续正式开发母版，重点是：**下载 ZIP 后交给 Codex，也能在不依赖此前聊天上下文的情况下继续开发。** Foundation Architecture v0.1.2 保持稳定；R3.10 不增加新的 Core 层，而是对 R3.8 的独立攻击性审计做Release-Assurance Closure：在保留既有 Lesson/Authorization/Docker Gate 的基础上，补齐身份隐私递归语义、跨 TS/JS/Python mutation corpus、名单重复 participantId、Student Claim 标准化与公共 pseudonym 存在性校验。

## 工程优先级

**稳定性 > 流畅性 > 可恢复性 > 可维护性 > 基础安全。**

这是局域网课堂系统，不追求理论上的“无法攻破”。基础安全只服务于课堂正确性与隐私边界，不引入重型零信任/复杂 RBAC 来消耗公开课周期。

## 接手前置条件

- Node.js 26.8.2 Current（`.nvmrc` / `.node-version` 已固定）；
- Node 官方发行包自带 npm 11.19.1；
- Python 3.14.7，仅用于开发/CI 的正式 JSON Schema 校验；
- Docker Desktop 仅在需要运行本次公开课容器 Gate 时必须，日常源码开发可先不安装。

## 接手后只做三步

```bash
npm run doctor
npm run bootstrap
npm run server:dev
```

`doctor` 检查干净 checkout 的基础环境；若缺 Python 3，会明确报错而不是在后续 Schema 校验阶段才失败。`bootstrap` 使用 `package-lock.json` 执行 `npm ci`、创建 `.venv`、安装正式 JSON Schema 校验依赖，并执行完整 `npm run check`。

Codex/代码代理请先阅读：

1. `AGENTS.md` — 永久工程规则、禁止误改的边界；
2. `CODEX-HANDOFF.md` — 当前做到哪里、下一步做什么；
3. `docs/development/MASTER-DEVELOPMENT-PLAN.md` — 唯一权威长期计划。

## 核心架构

`Lesson -> Activity -> Applet Type/Instance -> Command/Event/State/Artifact`

产品结构：**6 个正式 Product Surface + 1 个 Engineering Surface + Service Plane**：

- Student
- Teacher Runtime
- Display
- Observer
- Backstage
- Authoring Studio
- Simulation / Rehearsal（工程 Surface）
- Server / Realtime / Storage / Identity / Projection / Presentation / Analytics / Intelligence（Service Plane）

前端视觉样式与 Design System **尚未冻结**。当前 Web Shell 只是可运行开发入口，不是正式 UI。

## 当前可运行能力

- HTTP + WebSocket reference server；
- SQLite/WAL reference storage；
- session-scoped Event/Control 幂等、`serverSeq` 跨重启恢复；
- Session 广播隔离与 Observer 背压降级；
- StudentClaim / reconnect、Session pseudonym、RecoveryCoordinator 契约与参考实现；
- Presentation Runtime Index / validated control；
- 7 个 Surface 中性 Web Shell；
- 新公开课完整 Lesson Package 脚手架；
- `lesson:validate` 同时执行正式 Draft 2020-12 Schema、跨文件引用与通用语义验证（asset/capability/event authority/presentation cross-ref/path containment）；
- Foundation exact-set freeze 防漂移：修改、删除或新增未登记契约文件都会失败；
- Private Identity Policy 由单一配置源生成 TypeScript，并通过同一 mutation corpus 校验 Runtime TS、Lesson JS 与 Python validator；数组元素、对象 key、`roster:`/`class:` 等稳定身份引用均 fail closed；
- clean checkout 的 `npm test` 会先 build，不再依赖旧 `dist`；
- `release:d7` 前置 `d7:product`：Authenticated Server、TransformBoard、Presentation、Join/Submission、Teacher/Display/Observer 与 XP21A/LAN rehearsal 未完成时发布命令必定 fail closed；
- reference transport 对重复 Event/Control ID 会校验 canonical payload：完全相同重试保持幂等，同 ID 不同 payload 明确拒绝，避免客户端 ID 重用被静默吞掉；
- `workspace:check` 固化 19 个 workspace 的内部依赖声明/存在性/无环与源码 import 边界，避免 Codex 只靠 TypeScript path alias 形成隐式依赖；
- Apple Silicon + Docker `linux/arm64` 是本次公开课 P0，同时保留 `linux/amd64`。

## 常用命令

```bash
npm run doctor
npm run bootstrap
npm test
npm run check
npm run server:dev
npm run simulate:ws
npm run lesson:new -- lesson-slug "课程标题"
npm run lesson:validate -- lessons/lesson-slug
npm run integrity:check
npm run workspace:check
# 当前母包会因已知产品 P0 blocker 而主动失败：
npm run d7:product
# 只有产品 readiness 全部有证据后，教师 Apple Silicon Mac 才运行：
npm run release:d7
```

为避免尚未认证的 reference transport 被误暴露到学生 LAN，源码直接启动时课堂端口**默认只监听 `127.0.0.1:8787`**。需要明确做 LAN 开发时，复制 `.env.example` 启用 `HOST=0.0.0.0`；正式 D7 RC 还必须先让 `npm run d7:product` 的所有产品 readiness blocker 有证据地转为 ready。reference Docker Compose 同样保持 8787/8788 loopback-only；`deploy/docker/docker-compose.d7.yml` 明确声明认证课堂运行时并发布 8787，但当前 reference Server 会对该未实现模式 fail closed，不能启动或伪报 D7 就绪。

教师本机工具端口默认：`http://127.0.0.1:8788`，提供 Backstage `/backstage` 与 Authoring Studio `/authoring`。`npm run server:dev` 会自动读取存在的 `.env`；可从 `.env.example` 复制后按需修改。Docker 中容器监听 8788，但 Compose 只发布到宿主 `127.0.0.1:8788`，不与课堂 LAN 端口混用。

## 正式工具链

- Node.js **26.8.2 Current**；
- npm **11.19.1**（随 Node 26.8.2 官方发行包）；
- TypeScript **7.0.2 stable**；
- Python **3.14.7**；`jsonschema` **4.26.0 stable**，连同其验证链直接/传递依赖在 `requirements-dev.txt` 中精确锁定，只用于开发/CI。

版本统一由 `config/toolchain.json` 管理；未来升级优先新的 LTS/stable，不长期维护旧兼容分支。`.npmrc` 已启用 `engine-strict=true`，旧 Node 线不属于正式支持范围。

## 三个硬节点

- **D2 / 2026-09-11**：Student Practice Alpha + Authoring Studio Web Presentation Alpha；
- **D7 / 2026-09-16**：完整公开课 RC；
- **D21 / 2026-09-30**：完整架构实现基线 + 第二节公开课扩展证明。

## 文档入口

- `AGENTS.md`：Codex/代码代理永久工程规则；
- `CODEX-HANDOFF.md`：当前开发交接；
- `docs/README.md`：中文文档总入口；
- `docs/development/MASTER-DEVELOPMENT-PLAN.md`：唯一权威长期计划；
- `docs/development/FRONTEND-DESIGN-BOUNDARY.md`：前端 Design 尚未冻结的边界；
- `docs/development/NEW-PUBLIC-LESSON-GUIDE.md`：下一节公开课扩展方法；
- `docs/deployment/PLATFORM-ARCHITECTURE-MATRIX.md`：跨架构/Docker支持矩阵；
- `CR11-RELEASE-ASSURANCE-CLOSURE-REPORT.md` 与 `R3.10-COMPLETE-AUDIT.md`：本版 Release-Assurance 收口与完整审计。

## 当前验证证据

本轮历史验证曾执行自动测试 **105/105 PASS**，并再次通过正式 Lesson Schema/semantic gate、Foundation exact-set freeze、SQLite recovery、Server smoke 与 50 Student + 40 Observer WebSocket/SQLite reference load。升级到 Node 26.8.2 / npm 11.19.1 / Python 3.14.7 后，必须重新执行完整 bootstrap 与 Release Gate；XP21A 真机演练仍是外部硬 Gate，不伪报通过。

## 仍未完成

R3.10 仍是**可执行开发母版**，不是课堂成品。TransformBoard 正式 UI、真正 Presentation Engine、完整 Join/Presence/Outbox/Submission、正式 Teacher/Observer UI、lesson-specific Analytics/Rule Intelligence，以及 Apple Silicon Docker 实机 build/run/restart 与真实路由器 + XP21A LAN rehearsal 仍属于 D1-D7 的真实开发工作。自动 Docker Gate 不等价于真实路由器 + XP21A 真机演练；reference Gate 也不会把未认证 Server 暴露到 LAN。
