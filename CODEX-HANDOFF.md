# CODEX-HANDOFF — R3.10 当前开发交接

## 一句话状态

R3.10 是 **Release-Assurance Closure & Codex Mother Package**：Foundation v0.1.2 保持稳定，已经有可执行 HTTP/WebSocket + SQLite/WAL vertical slice、7 个中性 Web Shell、恢复/Session 隔离/伪名/Presentation Runtime 契约和参考并发测试；它仍不是最终公开课产品。

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
- D2 Student Practice Alpha：Student 轻量 TransformBoard 已支持选择、拖动、画布平移、旋转、旋转中心、重置、本地保存与刷新恢复；
- D2 Authoring Studio Alpha：浏览器内 Scene Studio 已支持页面增删/复制/排序、文字/图片 URL/SVG/基础图形、元素移动/尺寸/图层、保存重开和预览播放；
- D2 Alpha 有模型级回归与真实浏览器验收，Student 不加载 Presentation 编辑器，Foundation 与现有 Surface/Service Plane 边界保持不变；

## 当前明确未完成

- TransformBoard 与真实课堂 Server 的 Join/Activity/Submission 链接入；
- 真正第三方 Presentation Engine（优先快速 PoC PPTist；不合适再评估 web-ppt）或 D7 级 Scene Runtime 接入；
- 完整 Join / Presence / Outbox / Submission / Artifact Exchange 产品链；
- Teacher / Observer / Display 正式 UI；
- Lesson-specific Analytics Runtime 与《图案的还原》规则智能；
- Apple Silicon Mac 上真实 Docker build/run/restart；
- 真实路由器 + XP21A LAN rehearsal（自动 host LAN-interface probe 不能替代）；
- XP21A 小规模真机 smoke（若设备可得）。

## 开发优先级

1. Server真实 Session/Join/Presence + SQLite persistence；
2. Teacher Runtime / Display / Observer 同步；
3. D7 级 Presentation Scene/Step Runtime 与 Authoring binding；
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

1. 运行 `npm run doctor`，再运行 `npm run bootstrap`；首次 bootstrap 需要访问 npm/Python 包源；
2. 先完成 Presentation Engine 限时 PoC，并让 Authoring Studio 真正能开始制作本次公开课 Deck；
3. 同步推进 Student TransformBoard Practice Alpha；
4. 每个小阶段至少运行 `npm run check:fast`，涉及 Runtime/Storage/Realtime/Presentation/Docker 时运行完整 `npm run check`；
5. 只有真实实现证据表明现有 Foundation 无法表达需求时，才提出 Foundation 变更，不要因为某个页面实现不方便而改 Core。


## 当前最近一次验证证据

本轮升级前的独立构建自动回归为 **105/105 PASS**；升级到 Node 26.8.2/npm 11.19.1/Python 3.14.7 后必须重新复验。除 R3.8 已有的 Lesson/Authorization/Docker 反例外，CR11 在既有数组/object-key/roster/class 防线之上，继续拒绝普通文本、URL、stringified JSON 以及多层 percent/Unicode/hex/HTML 实体编码中的稳定身份 token，并把同一 mutation corpus 锁定在 TS Runtime、JS Lesson Validator 与 Python Formal Validator。

当前环境若缺少精确 Node 26.8.2/npm 11.19.1/Python 3.14.7 或 Docker，不得把对应 Gate 伪报为通过。Codex 在可联网正式环境先执行 `npm run bootstrap`；在教师 Apple Silicon Mac 冻结 RC 前执行 `npm run release:d7`，随后按 `docs/deployment/CLASSROOM-LAN-REHEARSAL.md` 完成真实 XP21A/LAN 演练。

本轮 D2 Alpha 已完成；主要工作已经从“继续设计架构”切换为“完成能稳定上课的真实产品”。

## D2 Alpha 最新验证

- `npm run check`：完整通过；108/108 unit tests，Contract/Formal/Lesson/Dist/HTTP/WS/Load/Smoke 全部通过；
- 真实浏览器：Student 旋转中心/旋转/保存/刷新恢复，Authoring 页面与元素 CRUD/保存/预览/刷新恢复通过；两端无 error/warning console log；
- 仍未声称 D7 完成：认证课堂 Server、Join/Presence、Teacher/Observer/Display 同步、D7 Presentation Runtime、真实 Docker/LAN/XP21A 仍待完成。
