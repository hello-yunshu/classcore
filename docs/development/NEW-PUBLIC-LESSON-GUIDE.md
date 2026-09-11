# 新公开课落地指南

目标：未来新增公开课时，**优先增加课程能力，不修改 Foundation Core**。

## 标准路径
1. 优先运行 `npm run lesson:new -- lesson-slug "课程标题"`，由脚手架生成完整 Lesson Package；
2. 立即运行 `npm run lesson:validate -- lessons/lesson-slug`；
3. 定义 `lesson.json` 与线性 Activity；
4. 优先复用已有 Applet；若不存在，再新增 Applet；
5. 为新 Applet 提供 manifest 和 config/state/event/command schema；
6. 新增本课 Analytics Profile，而不是把学科指标写进 Runtime；
7. 在 Authoring Studio 制作 Web Presentation；动态学生内容使用语义 binding；整个 ClassroomWidgetBinding（包括 bindingId、selector、parameters、fallback）不得硬编码 participant/roster/class/connection 等稳定身份引用；
8. 为 Teacher/Observer/Display 注册对应 Projection；
9. 增加本课 fixtures、Simulation scenario 和回归测试；
10. 只有当现有 Contract 无法表达需求时，才提交 Core 变更提案。

## 哪些情况通常不应该改 Core
- 新的数学知识点；
- 新的学生操作工具；
- 新的诊断规则；
- 新的课件页面/动画；
- 新的学生资源推荐逻辑；
- 新的课堂统计图。

这些分别属于 Applet、Analytics Profile、Presentation、Projection 或 Surface。

## 允许修改 Core 的条件
必须同时满足：
- 不是某一课特例；
- 至少两个不同课程/学科都需要；
- 现有 Applet/Capability/Adapter 无法表达；
- 有自动测试证明新增抽象不会破坏旧课。

## 身份隐私扩展规则

新增稳定身份字段或引用命名空间时，必须先更新 `config/private-identity-policy.json` 与 `config/private-identity-mutation-corpus.json`，运行 `npm run policy:generate`，再通过完整 `npm run check`。不要在单个 Lesson/Presentation 中自行维护另一套黑名单。
