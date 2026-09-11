# 前端 Design 边界

## 当前已经约定

- 6 Product Surface + 1 Engineering Surface 的职责；
- Student轻量、Teacher/Observer富客户端、Display渲染优先；
- 数据权限、Projection、Stage/Presentation同步方式；
- 各端最小可用入口和响应式/弱设备约束。

## 当前明确不冻结

颜色、字体、圆角、阴影、图标、导航视觉、Dashboard布局、卡片语言、动效风格、Design Token、完整组件库和正式页面视觉稿。

R3.10 的中性 Web Shell 只用于证明“端能运行、路由能打开、Surface Contract能加载、Server能连接”，不得作为最终视觉设计继续堆叠。

## 后续 Design 阶段

在 Teacher/Observer/Student 正式页面大规模开发前，单独产出：

`Product Design Principles -> Information Architecture -> Surface Layout -> Interaction Pattern -> Design Token -> Component Library -> Motion/Accessibility`

其中 Student、Teacher、Observer、Display 应共享基础品牌语言，但信息密度和交互复杂度允许明显不同。
