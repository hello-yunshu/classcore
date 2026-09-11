# 功能改动应该放在哪里

这是未来开发新公开课时的快速判断表。

| 需求 | 优先落点 |
|---|---|
| 新课程流程 | Lesson / Activity |
| 新学生交互工具 | Applet |
| Applet配置/状态/事件变化 | Applet Schema + Migration |
| 新的学生学习指标/策略分类 | Learning Analytics Profile |
| 新的规则诊断/建议 | Intelligence Provider / Lesson Profile |
| 新课件页面/动画 | Authoring Studio / Presentation Asset |
| 在课件中显示学生动态资源 | Presentation semantic binding + Projection |
| 教师端新的决策视图 | Teacher Surface Projection/UI |
| Observer新的研究视图 | Observer Projection/UI |
| 大屏新的展示形式 | Stage Content Projector + Display Renderer |
| 课堂名单/凭证/设备重置 | Backstage + Server Identity/Membership |
| 新公开课并发/故障场景 | Simulation / Rehearsal |
| 第三方LMS/标准接入 | Integration Gateway |

只有当多个不同课程都无法通过以上扩展点表达同一需求时，才考虑修改 Foundation。
