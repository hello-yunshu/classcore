# CR7 收口报告 — Codex Handoff / Developer Experience Closure

> 版本：Foundation v0.1.2 / Roadmap R3.6 / Contract Correctness CR7  
> 日期：2026-09-10  
> 主语言：中文

## 1. 本轮目标

R3.6 不再扩展 Foundation。目标是把 R3.5 “能继续开发”推进成“ZIP 解压后交给新的 Codex 会话，也能低歧义继续开发”。工程优先级仍为：

**稳定性 > 流畅性 > 可恢复性 > 可维护性 > 基础安全。**

## 2. 已完成的交接收口

### Codex 持久入口

新增：

- `AGENTS.md`：永久工程规则、Foundation冻结边界、代码归属、测试要求、Docker/Surface原则；
- `CODEX-HANDOFF.md`：当前实现状态、未完成项、D2/D7/D21、默认继续动作；
- `.env.example`：课堂端口、Backstage端口、SQLite目录、WebSocket/Observer预算；
- `.editorconfig`：无额外依赖的基础文本格式；
- `.npmrc`：`engine-strict=true`，旧 Node 工具链不再静默继续。

### Clean checkout / Toolchain

正式基线集中在 `config/toolchain.json`：

- Node.js 24.21.0 LTS；
- npm 11.19.0（跟随所选 Node 官方发行包）；
- TypeScript 7.0.2 stable；
- Python `jsonschema` 4.26.0（仅开发/CI）。

新增 `doctor / bootstrap / runtime:check / handoff:check / lockfile:check`。

`npm test` 现在必须先 build；build 前会校验 Node/npm，因此 R3.6 不再把 Node 22 / TypeScript 5 当正式兼容目标。

### Lockfile / CI

- 正式携带 `package-lock.json`；
- Docker 与 CI 使用 `npm ci`；
- 锁文件检查覆盖 workspace、TypeScript版本/integrity，以及 Apple Silicon/Linux目标所需 TypeScript native compiler entries；
- 新增最小 `.github/workflows/ci.yml`；
- CI按 Node24.21.0、npm11.19.0、Python3.13、`.venv` 后执行完整 `npm run check`。

### Lesson 扩展链

`lesson:new` 现在生成完整 Lesson Package；`lesson:validate` 不再依赖弱化的手写枚举规则，而是：

1. 结构/跨文件引用检查；
2. 正式 Draft 2020-12 Foundation Schema；
3. Applet manifest/config/schema cross-reference；
4. Presentation/asset等必要引用检查。

已有反例测试证明非法 `participantMode/submissionPolicy` 会被拒绝。

### Foundation 防漂移

- 根目录 `FOUNDATION-SHA256SUMS`；
- `npm run foundation:check`；
- R3.5 -> R3.6 的 `docs/contracts/v0.1.2` 实际对比为 **0 个文件差异**。

### Docker / Backstage

修正了 R3.5 中 Docker 下“应用自己判断localhost”的部署冲突：

- Classroom：容器 `0.0.0.0:8787`，宿主/LAN发布 `8787:8787`；
- Local Tools（Backstage + Authoring）：容器 `0.0.0.0:8788`，Compose只发布 `127.0.0.1:8788:8788`；Simulation不进入生产HTTP路由；
- 应用不再依赖Docker NAT后的 `remoteAddress` 来判断教师Mac；
- Docker采用多阶段源码构建和 `npm ci`；
- `build-current.sh` / `build-multiarch.sh` 只依赖项目本身必需的 Node，不再为读取版本号额外依赖Python；
- 当前 P0 为 Apple Silicon对应 `linux/arm64`，同时保留 `linux/amd64`，不把业务代码锁死CPU。

### Web/Server正确性保留

R3.5 已完成的稳定性修补继续保留：

- Session隔离；
- Event/TeacherControl幂等；
- `serverSeq` SQLite持久化、跨重启继续；
- Observer背压优先降级；
- WebSocket消息上限；
- public assets与Server-only代码隔离；
- Backstage双端口；
- StudentClaim / reconnect；
- pseudonym restore；
- RecoveryCoordinator；
- Presentation Runtime Index；
- 50 Student + 40 Observer参考WebSocket/SQLite负载脚本。

## 3. 自我审计后的取舍

### 为什么没有改用 Node 26

目标是“尽量新，但优先稳定/LTS”。2026-09-10 的正式生产基线选择 Node24 LTS；Node26作为未来LTS升级候选，不进入本次公开课P0。版本已集中管理，因此未来升级无需修改Foundation。

### 为什么仍保留 Python jsonschema

优点：现有正式 Draft 2020-12 验证已经跑通，规则与Foundation Schema一致。  
缺点：clean checkout多一个Python3开发前置。

本轮决定保留，但严格限制在开发/CI，不进入课堂Docker runtime。现在改成Ajv会扩大npm依赖和lockfile变更面，对D2/D7没有明显稳定收益。若后续Mac/Codex实际证明Python前置造成持续摩擦，再替换Validator Adapter即可，不触碰Core。

### 为什么暂不引入 Biome/ESLint

当前业务UI尚未正式进入大规模开发。此时为了格式化新增一组工具依赖，收益低于lockfile与工具链复杂度。R3.6采用 `.editorconfig + quality:check + TypeScript strict`。当Teacher/Student/Authoring Studio代码量明显增加时，再选择**一个** formatter/linter，不同时堆叠多个工具。

### 为什么精确锁版本但仍称“可升级”

课堂RC需要可复现，所以当前版本精确；升级能力来自中央 `config/toolchain.json`、Docker ARG、CI和Release Gate，而不是同时维护多条旧兼容分支。

## 4. 本轮验证证据

在当前审计环境中完成：

- Foundation R3.5 -> R3.6：0差异；
- `handoff:check`：PASS；
- Platform Matrix：PASS；
- Foundation hash：46/46 PASS；
- Lockfile structural check：PASS；
- 文档断链：PASS；
- Source quality：PASS；
- Contract validation：PASS；
- Draft 2020-12 formal validation：PASS；
- 所有现有Lesson package：PASS；
- 新课脚手架 create -> formal validate：PASS；
- Node22运行正式 `npm test`：按设计明确拒绝；
- 版本无关逻辑回归：56/56 tests PASS；
- SQLite close/reopen、Recovery、Session隔离：PASS；
- Server + Backstage双端口 smoke：PASS；
- Dist/public asset isolation：PASS；
- 50 Student + 40 Observer + Teacher 的真实WebSocket + SQLite参考场景：PASS。

参考并发只是本机回归基线，不等价于XP21A/教室Wi-Fi实测。

## 5. 尚不能伪报完成的 Gate

当前执行沙箱没有 Docker，也没有 Node24.21.0/npm11.19.0/TypeScript7.0.2正式安装环境，因此本轮**不能诚实声称**：

- `npm ci && npm run check` 已在精确正式工具链上真实执行；
- Apple Silicon Mac的 `linux/arm64` Docker build/run/restart/LAN rehearsal已通过。

R3.6已经把这两件事变成Codex/Mac接手后的显式首轮Gate，而不是隐藏前提。

## 6. CR7 判定

- Foundation Architecture：**PASS / 保持稳定**；
- Codex Handoff结构：**PASS**；
- Development Mother Package：**PASS**；
- Public Lesson RC：**尚未到达，继续D1-D7真实产品开发**。

下一步不再做纯架构迭代；优先 Presentation Engine PoC + Authoring Studio Alpha 与 Student TransformBoard Practice Alpha。

## 7. 封包前最后修订

- 对72个TS/MJS源码文件做语义不变的可读性整理；
- `quality:check` 新增源码单行360字符上限，防止后续重新出现极端压缩代码；
- 完整业务回归更新为 **56/56 PASS**；
- 再次执行非法Lesson反例，正式Schema正确拒绝非法 `participantMode` / `submissionPolicy`；
- lockfile的7个外部npm包条目均具备registry `resolved` 与SHA-512 `integrity`；
- 当前沙箱在线 `npm ci` 尝试因网络超时未完成，因此不把“npm registry下载链”伪报为已验证；
- Apple Silicon Docker仍由 `npm run docker:gate` 作为教师Mac上的硬Release Gate。
