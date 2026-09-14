# ClassCore — Student / Teacher Runtime Integration Master Prompt

> 目标：将已经定稿的学生端与教师端设计框架接入 ClassCore 的真实课堂 Runtime，并与当前 Presentation Studio 的视觉语言统一。
>
> 核心原则：**保留设计，不重做；替换 mock，不复制 demo；纵向打通课堂链，不继续横向堆底层框架。**
>
> 生成本参考包时仓库基线：`hello-yunshu/classcore` / `main` / `956d7930c115357c79371336204fdcfb0491f069`。
>
> 执行前先拉最新 `main`。若代码已前进，以最新代码为准，但不得破坏本提示词中的产品语义、视觉基线和信任边界。

---

## 0. 角色与任务

你是 ClassCore 的连续开发 Agent。你的任务不是重新设计学生端/教师端，不是重新发明课堂框架，也不是把三个参考 HTML 粗暴复制到仓库，而是：

1. 审计最新仓库；
2. 把学生端与教师端设计框架拆成可维护模块；
3. 接入 ClassCore 已存在的 Session / Identity / Authorization / Applet / Event / Snapshot / Submission / LiveState / Analytics / Stage / Presentation Runtime；
4. 将 UI 样式对齐当前 Presentation Studio；
5. 保证本课《图案的还原》的体验与参考 HTML 高度一致；
6. 去掉所有 production mock / 假数据 / 假 AI / 假在线人数 / 浏览器自封身份；
7. 保留 Practice Mode 作为离线/本地练习能力，但 Classroom Mode 必须 server-authoritative；
8. 用真实浏览器 E2E、弱设备预算、断线恢复和课堂纵向测试证明完成度；
9. 不到证据闭合，不得宣称 D7 / RC / READY。

---

# 1. 参考文件与优先级

## A. `reference-html/4-fragment-student.html`
**学生端主视觉 + 主交互参考。**

保留：
- 页面整体结构；
- 顶部标题/身份位置；
- 16×8 方格；
- 路径记录框；
- 表达词 / 方向 / 旋转方向 / 数字 / 单位 / 分隔输入；
- 图号和顶点字母点击输入；
- 计时；
- undo / reset；
- 成功失败反馈；
- 五年级输入密度；
- 几何与严格内容判定；
- 编号/标字母的视觉效果；
- 分组提交的课堂意图。

不得原样进入生产：
- 自选 `studentNo` 作为正式身份；
- `localStorage` 作为课堂权威状态；
- `BroadcastChannel` 作为课堂总线；
- `%4` 作为 Core 分组规则；
- 学生页面直接暴露“教师工具”；
- 浏览器自己判定“已提交给老师”。

## B. `reference-html/teacher-control.html`
**Teacher Runtime 主视觉、信息架构和课堂工作流参考。**

保留：
- 三栏教师控制台；
- 左侧显示源 / Presentation / AI；
- 中央 Stage 预览；
- 右侧学生选择 / 随机学生 / 隐藏工具 / 消息；
- 顶部课堂服务/在线状态；
- 指定 1～4 名学生；
- 多学生画面布局；
- 编号 / 标字母；
- AI 分析入口；
- AI 推荐资源；
- “使用 / 暂不使用”；
- PPT + 学生资源共同进入课堂显示的产品意图；
- 入口 / QR 的交互意图。

必须替换：
- 假学生数组；
- 假在线人数；
- 假离线集合；
- fake QR；
- fake PPT；
- 固定 AI 数字和固定 AI 文案；
- DOM 全局变量充当课堂 authority；
- Teacher 自己直接决定公共身份；
- Teacher 页面自己充当 Display。

## C. `reference-html/2-fragment-student.html`
**底层几何与简洁操作参考。**

优先借鉴：
- 整格单轴平移；
- 选择顶点作为旋转中心；
- 连续旋转预览；
- 结束后吸附 90°；
- 边界检查；
- history；
- geometry-only / strict-content；
- fixed piece 不可交互；
- `exportState / undo / reset / submit` API 化思路。

---

# 2. 权威代码边界

必须复用：

```text
packages/contracts
packages/runtime
packages/applet-sdk
packages/storage
packages/realtime
packages/intelligence
packages/projections
packages/identity
packages/presentation
packages/presentation-webppt-adapter

apps/server
apps/student-web
apps/teacher-web
apps/display-web
apps/observer-web
apps/backstage
apps/presentation-studio
apps/simulation-rehearsal
```

信任链：

```text
Browser Surface
    ↓
Server API / Realtime
    ↓
Authorization / Projection
    ↓
Runtime / Storage / Intelligence / Presentation
```

禁止：
- Student 直接写 SQLite；
- Teacher 浏览器直接读取 Identity Directory；
- Display 获取真实姓名/participantId mapping；
- Applet 自己管理 token / serverSeq / transport；
- Lesson-specific 规则写入 Foundation；
- Teacher 浏览器自己维护 authoritative Stage；
- Student localStorage 被视为提交成功。

---

# 3. 本轮目标不是“接两个页面”

必须实现纵向链：

```text
prepared Session
  ↓
Student Join / reconnect
  ↓
current Activity
  ↓
TransformBoard Applet
  ↓
Event
  ↓
Snapshot
  ↓
LiveState
  ↓
Submission / Artifact
  ↓
Teacher Runtime
  ↓
Analytics
  ↓
TeacherRecommendationGate
  ↓
Stage
  ↓
Display
```

Presentation 是 Stage 内容源之一，不是整个系统。

---

# 4. 视觉语言：与 Presentation Studio 对齐

统一 UI token：

```css
:root {
  --cc-ink: #24324b;
  --cc-ink-soft: #697386;
  --cc-muted: #7d8490;
  --cc-muted-strong: #697386;

  --cc-line: #d9d6cc;
  --cc-line-strong: #d2d0ca;

  --cc-paper: #f6f3ec;
  --cc-panel: #fbfaf7;
  --cc-panel-wash: #faf9f5;
  --cc-canvas: #e7e3d9;

  --cc-focus: #5575b8;
  --cc-focus-wash: #e3eaf7;

  --cc-signal: #c96b55;
  --cc-signal-wash: #fff8f6;

  --cc-gold: #897e70;
  --cc-success: #6b776c;

  --cc-shadow-soft: 0 19px 42px rgba(110,102,86,.11);
  --cc-shadow-float: 0 25px 70px rgba(0,0,0,.25);
}
```

## 教学色与品牌色分离

- 拼图黄色 `#FFD54A` 保留；
- 黑色几何轮廓保留；
- 教师 overlay 优先用 `--cc-focus`；
- UI shell 用 Studio token；
- success/error 允许更高辨识度；
- 不把数学对象改成米灰色；
- 不做霓虹科技风。

## 字体

```css
font-family:
  ui-sans-serif,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  "PingFang SC",
  "Microsoft YaHei",
  sans-serif;
```

学生端不能机械压缩成 Studio 的 11px：
- 学生主按钮 ≥ 14px；
- 重要反馈 ≥ 20px；
- touch target 尽量 ≥ 40px。

---

# 5. Student：Practice 与 Classroom 分离

## Practice Mode
允许：
- 无 Session；
- 本地启动；
- IndexedDB/localStorage 练习恢复；
- 明确显示“练习模式”；
- 不宣称已提交给教师。

## Classroom Mode
必须：
- sessionId；
- authenticated membership；
- reconnect；
- identity projection；
- current Activity；
- Applet Host；
- Event；
- Snapshot；
- LiveState；
- Submission；
- Outbox；
- Server ack。

Classroom Mode 禁止再用“输入 1—48”建立权威身份。

---

# 6. TransformBoard 必须成为真实 Applet

不要继续把当前 `apps/student-web` 的占位三图形扩成最终课。

创建 Lesson Package，例如：

```text
lessons/pattern-restoration/
  lesson.json
  applets/
    transform-board/
      manifest.json
      config.schema.json
      state.schema.json
      event.schema.json
      submission.schema.json
      src/
        model.ts
        geometry.ts
        reducer.ts
        renderer.ts
        student-view.ts
        teacher-overlay.ts
  analytics/
    profile.ts
  fixtures/
  presentation/
```

目录按仓库最新 loader 规范适配，但语义不变。

---

# 7. TransformBoard 状态

建议：

```ts
type TransformBoardState = {
  puzzleId: string;
  puzzleVersion: string;

  pieceStates: Record<string, {
    gridX: number;
    gridY: number;
    rotation: number;
  }>;

  history: TransformOperation[];

  rotationSelection: {
    pieceId: string;
    vertexId: string;
  } | null;

  recordTokens: RecordToken[];

  startedAt: string;
  elapsedMs: number;

  completion: {
    solved: boolean;
    solvedAt: string | null;
  };
};
```

教师编号/字母默认不进入学生数学权威状态。

---

# 8. 几何硬约束

1. 逻辑网格固定 `16 × 8`；
2. 视觉缩放不能改变数学坐标；
3. 平移一次仅一个轴；
4. 最终吸附整格；
5. 旋转中心来自有效顶点；
6. 连续旋转预览；
7. 结束吸附 90°；
8. 绕真实 world pivot；
9. 不可越界；
10. fixed object 不可操作；
11. 内部图案用 strict-content；
12. geometry / strict-content 分离；
13. undo 恢复上一 committed state；
14. 失败继续计时；
15. 成功停止本次计时；
16. reconnect 恢复 Snapshot。

几何逻辑必须可脱离 DOM 单元测试。

---

# 9. Durable Event

至少：
- `transform.translate`
- `transform.rotate`
- `rotation-center.select`
- `record.token.append`
- `record.token.remove`
- `attempt.reset`
- `attempt.submit`
- `attempt.completed`

示例：

```ts
{
  type: "transform.translate",
  payload: {
    pieceId: "piece-ul-eye",
    from: { gridX: 2, gridY: 2, rotation: 0 },
    to: { gridX: 5, gridY: 2, rotation: 0 },
    direction: "right",
    distance: 3
  }
}
```

浏览器不能在 payload 中自封 participantId。

---

# 10. LiveState

pointermove 预览走 LiveState，不写 durable Event。

LiveState 可包括：

```ts
{
  puzzleId,
  pieceStates,
  currentOperationPreview,
  recordPreview,
  elapsedMs,
  solved
}
```

规则：
- Live 可丢；
- Event / Submission 不可因慢 Observer/Display 丢；
- Teacher focus 高频；
- thumbnail 低频；
- 使用现有 `LiveStateBroker`。

---

# 11. 路径记录

保留参考学生端的：
- 表达词；
- 方向；
- 旋转方向；
- 数字 0～9；
- 单位；
- 分隔符；
- 图号/字母点击输入。

不要只存字符串。

建议结构化 token：

```ts
type RecordToken =
  | { kind: "figure"; figureId: string; display: "①" }
  | { kind: "vertex"; vertexId: string; display: "A" }
  | { kind: "word"; value: "向" | "平移" | "绕点" | "旋转" }
  | { kind: "direction"; value: "up" | "down" | "left" | "right"; display: string }
  | { kind: "rotation"; value: "clockwise" | "counterclockwise"; display: string }
  | { kind: "digit"; value: string }
  | { kind: "unit"; value: "格" | "度" }
  | { kind: "separator"; value: "，" | "；" };
```

---

# 12. 身份与分组

参考 HTML 的“每 4 人一组”只可作为 Lesson config。

禁止 `%4` 进入 Foundation。

Server 决定：
- group；
- leader；
- submission recipient。

Student UI 只显示 Server projection 后的结果。

如果后续取消组长中转，应该改 config，不改 Core。

---

# 13. Submission / Outbox

提交 payload 至少含：
- Snapshot ref；
- solved；
- elapsedMs；
- recordTokens；
- recordText；
- operation summary；
- EvidenceRef/event range；
- puzzle version。

点击提交：
1. 本地校验；
2. Applet `submit()`；
3. Server Submission；
4. ack 后“已提交”；
5. 断线则“待发送”；
6. reconnect 幂等重发。

`localStorage.setItem()` 绝不等于提交成功。

---

# 14. Teacher Runtime：保留三栏，不重做

```text
┌──────────────────────────────────────────────┐
│ Top Status                                   │
├────────────┬──────────────────────┬──────────┤
│ Left       │ Center Stage Preview │ Right    │
│ Sources    │                      │ Students │
│ PPT ctrl   │                      │ Random   │
│ AI         │                      │ Messages │
└────────────┴──────────────────────┴──────────┘
```

---

# 15. Teacher 左栏

## Stage Source
统一到底层 Stage：
- Presentation；
- selected live；
- selected artifact；
- comparison；
- activity summary；
- recommended resource。

## Presentation
必须用 authoritative PlaybackState + Controller Lease。

不得 `currentPage++` 当正式状态。

## AI
显示真实：
- 已接收；
- 已分析；
- 分类；
- 推荐；
- 状态。

不得保留固定 28 / 24 / 86%。

---

# 16. Teacher 中央 Stage Preview

Teacher 中央预览 authoritative Stage。

至少支持：
- presentation
- selected-live-view
- selected-artifact
- student-comparison
- recommended-resource
- activity-summary

教师点“使用推荐资源”：

```text
Recommendation candidate
  ↓ confirm
Stage.set(...)
  ↓
Teacher preview
  ↓
Display
```

---

# 17. Teacher 右栏

真实来源：
- Presence；
- TeacherStudentProjection；
- Submission；
- Live；
- events。

支持：
- 指定 1～4；
- 在线/离线；
- 搜索；
- 随机在线学生；
- clear；
- live thumbnail；
- submission 状态；
- 消息摘要。

禁止硬编码 `students = Array.from(...)`。

---

# 18. 编号 / 标字母

保留视觉和语义，但从学生自有工具迁移成 Teacher/Stage overlay。

原则：
- Student 不显示教师工具按钮；
- overlay 不污染学生数学状态；
- 编号按 initial geometry；
- 位置移动后编号身份不变；
- 字母不重复；
- 已有字母稳定；
- 字母避开顶点和图形；
- Stage 可展示 overlay；
- 若需 Student 同步看到，再用 explicit Applet command。

---

# 19. AI / Analytics

AI 不是聊天。

第一阶段：

```text
events + record
  ↓ feature extraction
  ↓ classification
  ↓ representative selection
  ↓ EvidenceRef
  ↓ Teacher recommendation
```

建议特征：
- rotate-first / translate-first；
- 先位置后方向 / 先方向后位置；
- piece 顺序；
- translate 次数；
- rotate 次数；
- undo/reset 次数；
- 完成时间；
- 一次成功与否；
- record 是否有运动方式；
- 平移是否含方向+距离；
- 旋转是否含 pivot+方向+角度；
- 记录顺序与实际操作是否一致；
- 冗余/试错程度。

外部 LLM：
- 只做语言总结增强；
- timeout/failure fallback；
- 不改 authoritative state；
- 推荐必须过 `TeacherRecommendationGate`。

---

# 20. 推荐资源 UI

保留：

> AI分析：……
>
> 是否使用推荐资源？
>
> [使用] [暂不使用]

但数据动态生成。

建议：

```ts
{
  recommendationId,
  kind: "student-comparison",
  subjectRefs,
  rationale,
  evidenceRefs,
  confidence,
  status: "candidate"
}
```

点击“使用”：
- confirm；
- Stage.set。

点击“暂不使用”：
- dismiss。

---

# 21. Message Stream

不是聊天系统。

只显示课堂事件摘要：
- submission received；
- request-view；
- attempt completed；
- reconnect/offline；
- leader submitted；
- analytics ready。

bounded + dedup。

---

# 22. Entry / QR

fake QR 替换为：
- Student Join URL；
- Observer Join URL；
- session credential / join code。

创建 authority 留在 Backstage/Server。

---

# 23. Display

接入不能破坏：
- read-only；
- Stage projection；
- public pseudonym；
- Presentation exact pin/fingerprint；
- selected student resource 匿名；
- overlay 经 public projection；
- 慢 Display 不阻塞 Student durable path。

---

# 24. Backstage 最小依赖

至少提供：
- Session；
- roster；
- join credentials；
- teacher credential；
- Lesson；
- Presentation；
- Feature Policy；
- Preflight；
- diagnostics。

不要让 Teacher 页面再造第二套 Session 管理。

---

# 25. 代码组织

Student 建议：

```text
apps/student-web/src/
  entry.ts
  student.css
  runtime/
    classroom-client.ts
    join.ts
    reconnect.ts
    outbox.ts
  applet-host/
    mount-current-activity.ts
  views/
    join-view.ts
    activity-shell.ts
    status-strip.ts
```

Lesson TransformBoard：

```text
lessons/.../applets/transform-board/
  geometry.ts
  model.ts
  reducer.ts
  events.ts
  submission.ts
  renderer.ts
  student-view.ts
```

Teacher：

```text
apps/teacher-web/src/
  entry.ts
  teacher.css
  runtime/
    teacher-session.ts
    controller-lease.ts
    stage-client.ts
    presentation-client.ts
    live-client.ts
    analytics-client.ts
  views/
    teacher-shell.ts
    source-panel.ts
    stage-preview.ts
    student-resource-panel.ts
    ai-panel.ts
    message-panel.ts
    entry-panel.ts
```

---

# 26. 绝对禁止的“快速接入”

以下任一存在都不得判完成：

1. iframe 原封不动塞 HTML；
2. Student 本地数字当 participantId；
3. Teacher 假 50 人；
4. 固定 AI 数字；
5. fake QR；
6. fake PPT；
7. `currentPage++` 代替 Server state；
8. Browser 直接 authoritative Stage；
9. BroadcastChannel 代替 Submission；
10. localStorage 当“已提交”；
11. Student 读取全班真实身份；
12. Student bundle 引入 web-ppt editor；
13. 重做已定稿布局；
14. lesson-specific 规则污染 Foundation；
15. 没真实 Browser E2E 就宣称 READY。

---

# 27. XP21A / student-light

目标：
- Android / SeeWooOS；
- 3GB；
- 1920×1200；
- touch；
- WLAN；
- 弱浏览器优先。

要求：
- no Presentation editor；
- no Teacher analytics bundle；
- no Observer；
- no CDN；
- DOM/SVG 优先；
- pointer events；
- LiveState 降频；
- refresh 可恢复；
- 短断网不丢 Submission。

---

# 28. 视觉 Gate

Student：
- 4-fragment 关键布局高度一致；
- 16×8 一致；
- record panel 一致；
- 输入区一致；
- overlay 一致；
- 只做 ClassCore palette 对齐；
- 教师工具按钮从 Student UI 移走，但标注视觉结果保留。

Teacher：
- 三栏一致；
- source/PPT/AI/Stage/student/message 区块一致；
- 不重做 dashboard；
- UI token 与 Studio 对齐；
- mock 替换后密度基本不变。

Screenshot：
- Teacher 1440×900；
- Teacher 1280×800；
- Student 1920×1200；
- Student 1280×800 fallback。

---

# 29. E2E Gate

## Student
- join
- identity
- activity
- applet mount
- translate
- rotate
- undo
- record
- submit
- ack
- refresh restore
- offline pending
- reconnect resend
- duplicate submit idempotent

## Teacher
- join
- lease
- presence
- select student
- live thumbnail
- focus live
- submission
- analytics
- recommendation
- confirm
- Stage update
- Display update
- Presentation control
- reconnect
- lease renew/takeover

## Privacy
- Display/Observer 无姓名/participantId；
- Student 只看自己；
- Teacher 可见 teacher projection；
- client payload 不能注入 owner/identity。

---

# 30. 故障降级

- AI timeout → 不阻断课堂；
- Live 断 → 显示不可用/最后更新时间；
- Student offline → Outbox；
- Display offline → reconnect；
- Presentation fingerprint mismatch → fail closed；
- Server restart → 恢复最小关键状态；
- Teacher disconnect → lease grace；
- Observer slow → coalesce/drop Observer live。

---

# 31. 开发顺序

### Phase 1
UI extraction + token 对齐，零功能语义变化，建立 screenshot baseline。

### Phase 2
Lesson Package + TransformBoard Applet。

### Phase 3
Student Classroom：Join / Activity / Event / Snapshot / Live / Submission / reconnect。

### Phase 4
Teacher Runtime：Session / Lease / Presence / Student resources / Stage / Presentation。

### Phase 5
Analytics / AI。

### Phase 6
Display / Observer seam。

### Phase 7
E2E / restart / offline / Docker / XP21A。

---

# 32. 每轮自审计

```text
1. pull latest main
2. read AGENTS / CODEX-HANDOFF / MASTER-DEVELOPMENT-PLAN
3. compare current code
4. implement smallest vertical closure
5. npm run check
6. browser E2E
7. screenshot
8. audit mock / duplicate authority / privacy / recovery
9. fix
10. rerun
11. update evidence
```

---

# 33. 真正的完成定义

完成不是“页面长得像参考 HTML”。

而是：

> 学生使用 XP21A 通过真实入口进入 Session，加载《图案的还原》TransformBoard，完成平移/旋转与路径记录；Teacher Runtime 能看到 Presence、Live、Submission 与过程证据；AI/规则系统基于真实数据分类并推荐典型资源；教师确认后资源进入 Stage；Display 使用匿名公开投影显示；刷新、短时断网、Teacher/Display 重连以及 Server restart 后关键状态可恢复；Presentation 仍与 Stage 共存。

并且：
- Student/Teacher 视觉保持参考框架；
- UI 色彩与 Presentation Studio 对齐；
- 无 production mock；
- 无第二套 authority；
- lesson-specific 逻辑不污染 Foundation；
- AI/Observer 故障不拖垮 Student 主链；
- 有真实 Browser + XP21A / LAN 证据。

未满足前：

`PUBLIC-LESSON-INTEGRATION / NOT-FROZEN`

---

# 34. 现在就开始时的第一批任务

1. 建当前公开课 Lesson Package；
2. 从 4-fragment HTML 抽 geometry/model/render/record；
3. TransformBoard 注册为真实 Applet；
4. Student 保留布局并套 Studio tokens；
5. Student 接 current Activity/AppletHost；
6. Teacher 保留三栏并套同一 tokens；
7. Teacher 接 Presence + Student selection + Stage preview；
8. 移除生产 mock；
9. 接 Submission；
10. 接 LiveState；
11. 接本课 Analytics。

**不要先继续扩 PPT 编辑器，也不要先完善 Observer。**
