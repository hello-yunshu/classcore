# ClassCore

ClassCore 是面向小学公开课的局域网课堂运行平台。它把课程内容、课堂活动、学生练习、教师控制、投屏展示、观察与服务端恢复能力组织在同一套运行时中。

当前首个示例课程为苏教版五年级上册《图案的还原》。项目仍处于公开课研发阶段：参考运行时和自动化检查已可运行，但正式 D7 课堂发布仍需要认证课堂 Server、真实浏览器流程、局域网演练和 XP21A 真机证据。

## 项目定位

ClassCore 的工程优先级是：

**稳定性 > 流畅性 > 可恢复性 > 可维护性 > 基础安全。**

核心模型保持为：

```text
Lesson -> Activity -> Applet Type/Instance -> Command/Event/State/Artifact
```

这是一个局域网课堂系统，不把课程专属逻辑塞进通用 Core，也不以“理论上无法攻破”为目标。基础安全主要用于保证课堂正确性、权限边界和学生身份隐私。

## 当前能力

- HTTP + WebSocket 参考课堂 Server；
- SQLite/WAL 存储、幂等事件、跨重启 `serverSeq` 恢复；
- Student、Teacher、Display、Observer、Backstage、Authoring Studio 六个产品 Surface；
- Simulation / Rehearsal 工程 Surface；
- Student Claim、reconnect、公共 pseudonym 与 RecoveryCoordinator；
- Presentation Library、web-ppt 运行时、教师控制、Display 精确播放与重连；
- Lesson Package 脚手架、正式 Draft 2020-12 Schema 与跨文件引用校验；
- Foundation v0.1.2 exact-set freeze 和 Private Identity Policy 校验；
- Apple Silicon `linux/arm64` Docker 主目标，同时保留 `linux/amd64`；
- 50 名学生 + 40 名 Observer 的 WebSocket/SQLite 参考负载模拟。

## 快速开始

正式工具链固定为 Node.js 26.8.2、npm 11.19.1、TypeScript 7.0.2、Python 3.14.7 和 `jsonschema` 4.26.0。

```bash
npm run doctor
npm run bootstrap
npm run server:dev
```

默认地址：

- 课堂 Server：`http://127.0.0.1:8787`
- 教师本机工具：`http://127.0.0.1:8788/backstage`
- Authoring Studio：`http://127.0.0.1:8788/authoring`

参考 Server 和参考 Docker Compose 默认只监听 loopback。只有在明确进行局域网开发时，才通过 `.env` 配置 `HOST=0.0.0.0`；这不代表已具备正式认证课堂能力。

## 常用命令

```bash
# 环境、构建和完整检查
npm run doctor
npm run bootstrap
npm run check
npm test

# 开发服务与负载模拟
npm run server:dev
npm run simulate:ws
npm run simulate:load

# 新建和验证公开课
npm run lesson:new -- lesson-slug "课程标题"
npm run lesson:validate -- lessons/lesson-slug

# Docker 与发布 Gate
npm run docker:gate
npm run d7:product
npm run release:d7
```

`npm run d7:product` 会在正式产品证据不足时主动失败；不要通过修改 readiness 配置中的布尔值绕过 Gate。`release:d7` 必须先通过产品 Gate。

## 产品结构

| Surface | 用途 |
| --- | --- |
| Student | 学生练习与课堂交互 |
| Teacher Runtime | 教师控制课堂和 Presentation 播放 |
| Display | 只读投屏展示 |
| Observer | 只读观察与公共投影 |
| Backstage | 教师本机运维工具 |
| Authoring Studio | 课程与 Presentation 编辑 |
| Simulation / Rehearsal | 压测、演练和回归验证 |

课堂 Participant Role 只有 `student`、`teacher`、`observer`、`display`；`system` 仅是 Server 内部 actor，不是课堂用户角色。

## 代码结构

```text
apps/                  前端 Surface 与 Server
packages/              Runtime、Storage、Realtime、Presentation 等共享包
lessons/               课程包与课程专属内容
docs/contracts/        Foundation v0.1.2 稳定契约
deploy/docker/         Docker 与 Compose
scripts/               检查、构建、模拟和发布工具
tests/                 自动化回归测试
```

新增公开课应优先沿用以下路径：

```text
Lesson Package -> 复用或新增 Applet -> Lesson-specific Analytics -> Presentation -> Fixture / Simulation
```

不要为了单节课需求修改 Foundation，也不要让 Applet 直接访问数据库、原始 WebSocket 或 Identity Directory。

## 文档入口

- [`AGENTS.md`](AGENTS.md)：工程边界与代码代理规则；
- [`CODEX-HANDOFF.md`](CODEX-HANDOFF.md)：当前实现状态与下一步；
- [`docs/README.md`](docs/README.md)：中文文档总入口；
- [`docs/development/MASTER-DEVELOPMENT-PLAN.md`](docs/development/MASTER-DEVELOPMENT-PLAN.md)：长期计划；
- [`docs/development/PRESENTATION-MAINLINE-VERTICAL-SLICE.md`](docs/development/PRESENTATION-MAINLINE-VERTICAL-SLICE.md)：Presentation 主线垂直切片；
- [`docs/deployment/PLATFORM-ARCHITECTURE-MATRIX.md`](docs/deployment/PLATFORM-ARCHITECTURE-MATRIX.md)：平台与 Docker 架构矩阵；
- [`docs/deployment/CLASSROOM-LAN-REHEARSAL.md`](docs/deployment/CLASSROOM-LAN-REHEARSAL.md)：真实路由器与 XP21A 局域网演练要求。

## 开发与贡献

提交改动前至少执行：

```bash
npm run check:fast
```

涉及 Runtime、Storage、Realtime、Presentation、Lesson Schema、Docker 或 Surface 时执行：

```bash
npm run check
```

请保持代码标识符、协议字段、事件名和错误码使用英文；面向使用者的说明优先使用中文。提交问题时请附上复现步骤、运行环境和相关命令输出，并明确区分本地代码、Docker、真实设备、局域网和 CI 证据。

## 许可证

ClassCore 以 **GNU Affero General Public License v3.0（AGPL-3.0-only）** 发布。该许可证要求分发修改版时提供对应源代码；如果修改版作为网络服务运行，也必须向与其交互的用户提供对应源代码。

完整许可证文本见 [`LICENSE`](LICENSE)。第三方依赖不自动继承本项目许可证，具体以各依赖自身许可证和 [`docs/development/PRESENTATION-DEPENDENCY-LICENSES.md`](docs/development/PRESENTATION-DEPENDENCY-LICENSES.md) 为准。
