# AGENTS.md — Classroom Runtime / Codex 工程规则

本文件是 Codex 或其他代码代理进入仓库后的第一优先级工程说明。主要语言为中文；代码标识符、协议字段、事件名和错误码使用英文。

## 1. 当前目标

这是常州小学数学 AI 赋能公开课的局域网课堂运行平台。当前首课为苏教版五上《图案的还原》，但架构必须便于后续新增公开课。

工程优先级：**稳定性 > 流畅性 > 可恢复性 > 可维护性 > 基础安全**。不要为了理论攻防加入重型安全体系，也不要为了赶页面把 lesson-specific 逻辑塞进 Core。

## 2. 不得随意改变的边界

- Foundation v0.1.2 原则冻结；`npm run foundation:check` 必须保持通过。
- 核心模型：`Lesson -> Activity -> Applet Type/Instance -> Command/Event/State/Artifact`。
- 产品结构：6 个正式 Product Surface（Student / Teacher Runtime / Display / Observer / Backstage / Authoring Studio）+ 1 个 Engineering Surface（Simulation/Rehearsal）+ Service Plane。
- Classroom Participant Role 只有 `student / teacher / observer / display`；`system` 是 Server 内部 actor，不是课堂用户角色。
- Observer / Display 只读且使用 session pseudonym；Backstage/Authoring/Simulation 不应新增课堂 Participant Role。
- Student 端保持 `student-light`；Teacher/Observer 可以 richer；压力下先降级 Observer live，不牺牲 Student durable event 与 Teacher control。
- Applet 不直接访问数据库、原始 WebSocket 或 Identity Directory。
- 前端视觉与 Design System **尚未冻结**；不要把当前 Web Shell 当成最终 UI。

如果真实实现证明 Foundation 无法表达需求，先记录证据并停止修改 Foundation，提交架构变更建议；不要“顺手”改契约。

## 3. 开始开发前

在干净 checkout / 解压目录执行：

```bash
npm run doctor
npm run bootstrap
```

正式工具链由 `config/toolchain.json` 唯一管理：Node 26.8.2 Current、Node 自带 npm 11.19.1、TypeScript 7.0.2 stable、Python 3.14.7、jsonschema 4.26.0（位于 `.venv`）。

不要使用 Node 22 / TypeScript 5 兼容模式；旧线已退出正式支持。
仓库启用 `.npmrc` 的 `engine-strict=true`；不要通过关闭 engine strict 来绕过正式工具链。基础文本格式遵循 `.editorconfig`。

## 4. 每次改动至少执行

小改：

```bash
npm run check:fast
```

涉及 Runtime、Storage、Realtime、Presentation、Lesson Schema、Docker、工具链、Surface/Projection 时：

```bash
npm run check
```

`npm test` 在 clean checkout 下会先 build，因此不应出现“缺 dist”假失败。

## 5. 新公开课的正确扩展路径

优先：

```text
Lesson Package
  -> 复用/新增 Applet
  -> Lesson-specific Analytics Profile
  -> Presentation 内容/绑定
  -> Fixture / Simulation
```

创建：

```bash
npm run lesson:new -- lesson-slug "课程标题"
npm run lesson:validate -- lessons/lesson-slug
```

`lesson:validate` 必须同时通过正式 Draft 2020-12 Schema 与跨文件引用校验；不得另写一套弱化规则冒充正式验证。

## 6. 代码放置原则

- Foundation/跨课稳定类型：`docs/contracts/v0.1.2`（原则冻结）。
- Runtime/授权/Stage 等：`packages/runtime`。
- Storage：`packages/storage` 与 Server adapter。
- Identity：`packages/identity`（Server-only）。
- Projection：`packages/projections`（Server-only）。
- Presentation Capability：`packages/presentation`。
- 前端 Surface：`apps/*`。
- lesson-specific 内容：`lessons/*`、Applet包、Analytics Profile；不要放进通用 Core。
- `apps/server/runtime/server.mjs` 是可运行 vertical slice，不应演变成万能巨型文件；新增业务逻辑逐步下沉到 Service/Adapter/Capability。

## 7. Docker / CPU 架构

应用逻辑不锁死 CPU。此次公开课的 P0 必须目标是 Apple Silicon MacBook Pro + Docker 原生 `linux/arm64`；同时保留 `linux/amd64`。

课堂服务通过 LAN 端口 8787；Backstage 与 Authoring Studio 共用教师本机工具端口 8788；Docker 中监听容器 8788，但 Compose 必须绑定宿主 `127.0.0.1:8788`，避免它们进入课堂 LAN 运行面。Simulation 不由生产 Server 暴露。

## 8. 当前下一步

详细状态与任务只看根目录 `CODEX-HANDOFF.md` 和 `docs/development/MASTER-DEVELOPMENT-PLAN.md`。不要从历史审计文件推断当前计划。


## D7 发布防误判

当前 reference Server 不是认证后的课堂 Server。不要通过修改 `config/d7-release-readiness.json` 的布尔值来“让发布变绿”；只有对应能力完成并有可复验证据后才能标记 ready。`release:d7` 必须保留 `d7:product` 前置 Gate。reference Server 源码默认 loopback-only，LAN 开发需显式配置。
