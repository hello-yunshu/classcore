# MASTER PROMPT — ClassCore Lesson Isolation + Pattern Restoration Integration

## 0. North Star

本轮目标不是“把《图案的还原》写进 ClassCore”。

目标是：

> 用《图案的还原》验证 ClassCore 的课例插件架构，并保证第二节课可以通过新增 Lesson Package 开发，而不是修改 Core。

成功标准：

```text
Core 不认识“图案的还原”
Student Shell 不认识“图案的还原”
Teacher Shell 不认识“图案的还原”
Intelligence Core 不认识“平移/旋转”
Stage Core 不认识“笑脸”
```

但运行时可以通过：

```text
Lesson Package
→ Applet
→ Analytics Profile
→ Presentation
→ Stage
```

完整上完这节课。

---

# 1. 三层边界

## Layer A — Core

只允许通用课堂概念：

```text
Session
Activity
Participant
Membership
Identity
Authorization
Applet
Event
Snapshot
Submission
Artifact
LiveState
Analytics
Recommendation
Stage
Projection
Presentation
Storage
Reconnect
Outbox
Controller Lease
```

Core 不得出现：

```text
pattern-restoration
图案的还原
笑脸
16×8
4碎片
fragmentA
眼睛
平移几格
绕点旋转
①②③④
8号和32号
每4人一组
顺时针90°
```

## Layer B — Shared Capability / Reusable Applet

允许通用交互能力，例如：

```text
TransformBoard Engine
Grid Board
Object Translation
Pivot Rotation
Undo
Teacher Annotation Overlay
Structured Math Record Input
Resource Comparison
```

它可以知道：
- grid；
- movable object；
- translate；
- rotate；
- pivot；
- constraint；
- event；
- snapshot。

不能知道：
- 这是笑脸；
- 4 个碎片；
- 黄色眼睛；
- 16×8；
- 目标答案；
- 本课记录语义；
- 本课推荐规则。

## Layer C — Lesson Package

这里只允许本课业务：

```text
16×8
4个碎片
碎片形状
内部眼睛图案
初始位置
目标位置
允许旋转顶点
编号顺序
字母规则
路径记录词库
分组规则
本课 Analytics 分类
典型学生选择
本课 Presentation
本课素材
```

---

# 2. 依赖方向

只允许：

```text
Core ← Shared ← Lesson
```

禁止：

```text
Core → Lesson
Shared → 特定 Lesson
apps/student-web → pattern-restoration implementation
apps/teacher-web → pattern-restoration classifier
```

严禁：

```ts
if (lessonId === 'pattern-restoration') { ... }
```

出现在：
- `packages/**`
- `apps/student-web/**`
- `apps/teacher-web/**`
- `apps/server/**` 的通用 Runtime 路径。

---

# 3. 晋升规则

第一次出现：
> 留在 Lesson。

第二节课再次出现：
> 比较语义，不因为“长得像”就抽象。

只有接口、生命周期、数据模型真正一致：
> 抽到 Shared。

多课型、跨学科都需要且与业务无关：
> 才考虑 Core。

禁止“以后可能复用”就提前塞 Core。

---

# 4. 当前审计事实

生成本包时：

- `lessons/` 只有 README；
- starter template 已存在；
- `lesson:new` 已存在；
- `lesson:validate` / `validate:lessons` 已存在；
- Lesson Package validator 已具有跨文件、schema、identity-neutral、server-owned event、Presentation binding 等检查；
- Applet SDK 仍保持通用；
- Intelligence Runtime 仍保持通用；
- Student Surface 仍直接写有 TransformBoard Demo 与本课标题；
- TypeScript include 仍以 `packages/**` / `apps/**` 为主；
- workspaces 仍以 `packages/*` / `apps/*` 为主；
- workspace check 还不是 Lesson/Core semantic boundary gate。

这些事实执行时必须重新验证。

---

# 5. 第一原则：不要先决定 TransformBoard 一定进入 Shared

第一节真实 Lesson 接入时：

优先允许：

```text
lessons/pattern-restoration/
  applet/
    transform-board/
```

只有当现有 Applet loading/build 机制明确要求可执行类型注册在 Shared 层，才建立例如：

```text
packages/applets-transform-board/
```

但即使进入 Shared，也只允许通用 engine。

本课 geometry / answer / labels / record rules 必须仍在 Lesson config。

---

# 6. 必须解决 Lesson 可执行代码问题

当前 Lesson Package 偏向数据包。

本轮需要审计并选择**最小、最安全**的可执行扩展方式。

允许方案：

### 方案 A：Shared Applet + Lesson Config（优先）
```text
packages/applets-transform-board
lessons/pattern-restoration/configs.json
```

适用于 TransformBoard 行为完全可配置。

### 方案 B：正式 Lesson Code Plugin seam
只有真实需求无法由 config / Analytics Profile 表达时才做。

要求：
- 明确 build/loader；
- schema/version；
- allowlist；
- no arbitrary path execution；
- Core 不 import lesson source；
- Lesson plugin 通过 Registry 注册；
- CI 可验证。

禁止为了这一课随便把 `lessons/**/*.ts` 加进 `tsconfig` 然后让 apps 相对路径 import。

---

# 7. Student Shell

最终：

```text
Student Shell
├─ Join
├─ Connection
├─ Identity Projection
├─ Current Activity
└─ Applet Host
```

Student Shell 不允许包含：
- puzzle coordinates；
- piece definitions；
- record vocabulary；
- solve logic；
- grouping algorithm；
- 本课 analytics。

现有 `apps/student-web/src/entry.ts` 的课例 Demo 必须迁出。

允许保留：
- Practice Mode shell；
- generic Applet Host；
- generic activity status；
- network/outbox UI；
- generic submit status。

---

# 8. Teacher Shell

最终：

```text
Teacher Runtime
├─ Session / Lease
├─ Activity
├─ Presentation
├─ Student Resource Explorer
├─ Live
├─ AnalyticsResult
├─ Recommendation
└─ Stage
```

Teacher Shell 不知道：
- “先旋转后平移”是什么意思；
- 为什么 8 号和 32 号值得比较；
- 本课编号规则；
- 4 碎片几何答案。

它只消费结构化：
- `AnalyticsResult`
- `RecommendationCandidate`
- `Artifact`
- `LiveView`
- `StageState`

---

# 9. Intelligence

Core Intelligence 只负责：
- Provider runtime；
- timeout；
- fallback；
- provenance；
- AnalyticsResult；
- Recommendation；
- TeacherRecommendationGate。

本课分类：
- rotate-first；
- translate-first；
- missing-pivot；
- missing-distance；
- concise-path；
- high-trial；

全部留在 Lesson Analytics Profile / provider。

禁止：
```text
packages/intelligence/src/pattern-restoration-*.ts
```

---

# 10. Stage

Core Stage 只认识：

```text
presentation
live-view
artifact
student-comparison
activity-summary
recommended-resource
```

不认识：

```text
笑脸比较
旋转路径比较
```

Lesson/Analytics 产出通用 Stage candidate。

---

# 11. Grouping

“每4人一组、4/8/12为组长”只能是：
- Lesson config；
- Session assignment；
- Submission policy。

绝不能进入 Student/Core 算法。

---

# 12. UI 设计

Student / Teacher 视觉使用参考 HTML。
平台 chrome 与 Presentation Studio token 对齐。

保留教学色：
- `#FFD54A` puzzle yellow；
- 黑色几何边线；
- 高辨识成功/失败状态。

不要为了统一视觉修改数学对象编码。

---

# 13. Boundary CI

必须新增比现有 `workspace:check` 更强的 Lesson boundary check。

至少检查：

1. Core roots 不允许 import `lessons/`；
2. Shared packages 不允许 import具体 Lesson；
3. Student/Teacher generic shell 不允许 import具体 Lesson implementation；
4. Core 不允许出现已登记 lesson-specific namespace/token；
5. production apps 不允许出现明确 mock patterns；
6. Lesson 删除后 Core build 仍能通过（可设计成测试 fixture / boundary test）；
7. Lesson Package 继续通过原有 validator。

不要用脆弱的全仓中文关键词禁用误伤正常文档。Gate 应以：
- dependency graph；
- import path；
- registered namespace；
- known package IDs；
- explicit production mock markers；

为主。

---

# 14. No Mock

正式 D7 路径禁止：

```text
demo-teacher header 作为正式认证
hard-coded students[50]
fake online count
fake QR
fixed AI 28/24/86
fixed student recommendation IDs
fake PPT
BroadcastChannel submission
localStorage == submitted
```

Practice Mode 可以有本地数据，但必须明确与 Classroom Mode 分开。

---

# 15. Lesson Package 目标结构

参考：

```text
lessons/pattern-restoration/
├─ package.manifest.json
├─ lesson.json
├─ activities.json
├─ applets.manifest.json
├─ configs.json
├─ analytics/
│  ├─ profile.json
│  └─ README.md
├─ assets/
├─ presentation/
└─ tests/
```

如果 Applet 是 Shared：

```text
applets.manifest.json
→ 指向已注册 TransformBoard type
configs.json
→ 定义本课 16×8 / pieces / target / strict content
```

---

# 16. TransformBoard Engine

如果抽 Shared，只能包含：

```text
coordinate system
grid snapping
single-axis translate
pivot rotate
rotation snapping
bounds
history
serialization
event normalization
render primitives
```

Lesson config 承载：

```text
grid width/height
piece SVG/geometry
piece semantic ID
initial transform
target transform
strict content
fixed pieces
available pivots
labels
```

---

# 17. 真实完成标准

第一节课接入完成后，应通过以下架构测试：

### Test A
删除 `lessons/pattern-restoration`：
- Core typecheck/build 仍通过；
- generic Student/Teacher shells 仍 build；
- Lesson validation 只报告该 Lesson 不存在，而不是 Core 编译失败。

### Test B
创建：
```bash
npm run lesson:new -- second-lesson "第二节课"
```
不修改 Core，也能得到合法 package。

### Test C
搜索：
```text
pattern-restoration
图案的还原
fragment-ul-eye
```
在 Core roots 中为 0。

### Test D
本课运行时仍完成：
Student → Event/Snapshot/Live/Submission → Teacher → Analytics → Stage → Display。

---

# 18. 开发顺序

严格按 `codex-tasks/` 执行。

不要提前做后续阶段。

状态在真实课堂闭环前保持：

`LESSON-INTEGRATION / NOT-FROZEN`
