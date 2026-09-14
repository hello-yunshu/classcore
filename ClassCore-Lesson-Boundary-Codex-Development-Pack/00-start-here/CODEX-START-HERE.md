# Codex Start Here

## 最推荐的开发方式

不要把 `MASTER-PROMPT.md` 直接贴给 Codex 然后说“全部完成”。

正确方式是：

```text
Ask / Plan
→ Boundary Gate
→ Lesson Package
→ TransformBoard
→ Student Runtime
→ Teacher / Stage
→ Analytics
→ E2E / XP21A
```

每一阶段都让 Codex：
1. 先读当前代码；
2. 给出本阶段计划；
3. 修改；
4. 自测；
5. 自审；
6. 提交；
7. 停止。

---

## 第一次给 Codex 的消息

把整个参考包放进仓库，例如：

```text
docs/codex/pattern-restoration-integration/
```

然后给 Codex：

```text
请先不要修改代码。

先执行：
1. git fetch --all --prune
2. 确认当前 HEAD 和 origin/main
3. 阅读仓库根 AGENTS.md、CODEX-HANDOFF.md、MASTER-DEVELOPMENT-PLAN.md
4. 阅读 docs/codex/pattern-restoration-integration/README.md
5. 阅读 docs/codex/pattern-restoration-integration/MASTER-PROMPT.md
6. 阅读 docs/codex/pattern-restoration-integration/architecture/*
7. 阅读 codex-tasks/00-ASK-AUDIT-AND-PLAN.md

然后对照最新代码重新审计，不要假设包生成时的 HEAD 仍然最新。

本轮只输出：
- 当前代码与提示词要求的差异
- 哪些问题已经被新提交修复
- Task 01 的最小实施计划
- 将修改的文件
- 风险和验证命令

不要修改代码，不要创建提交。
```

计划正确后再进入 Task 01。

---

## 每个编码 Task 的标准开头

```text
继续上一阶段。先重新读取：
- AGENTS.md
- MASTER-PROMPT.md
- 本阶段 task 文件
- 与本阶段相关的最新代码

只执行当前 Task，不提前做后续 Task。

要求：
- 不破坏现有 Presentation Studio 视觉；
- 不重做已经定稿的 Student/Teacher 布局；
- 不把本课业务写进 Core；
- 不增加 lessonId 特判；
- 不保留 production mock；
- 优先复用现有 Contracts / Runtime / Applet SDK / Storage / Realtime / Intelligence / Projection；
- 每完成一个垂直小闭环立即测试；
- 完成后自审计 diff，再运行 task 中要求的验证；
- 修到验证通过；
- 最后给出 commit SHA、修改文件、测试结果、仍未完成项。
```

---

## Codex 不应该一次做什么

不要一次要求它：

```text
做完 Lesson + Student + Teacher + AI + Display + Backstage + Observer + XP21A
```

原因：
- 边界最容易在大任务里被悄悄破坏；
- 失败后很难定位；
- AI 可能为了“完成”而写 mock；
- E2E 证据会滞后。

一次 Task 应尽量是：
- 一个明确的架构目标；
- 几百行到一个可审查变更；
- 有确定测试；
- 能独立提交。

---

## Codex 完成 Task 后你怎么回

最简单：

```text
请先不要进入下一阶段。
完整审计刚刚的 commit：
1. 是否违反 Core/Lesson 依赖边界
2. 是否把课例常量写进 apps 或 packages
3. 是否存在 mock/假数据
4. 是否破坏现有 UI
5. 测试是否真的覆盖目标语义
6. 是否存在下一节课复用风险

发现问题直接修复并重新测试，直到本 Task 可以关闭。
```

之后再发：

```text
进入 Task 02，严格读取对应 task 文件，只完成这一阶段。
```
