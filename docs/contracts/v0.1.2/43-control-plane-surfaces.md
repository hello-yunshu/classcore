# Backstage / Authoring / Engineering Boundaries

## Backstage
Operations Control Plane UI，不是课堂 Participant。D7 最小职责：Session 创建、名单映射、凭证/二维码、Feature Policy、Preflight、Diagnostics、日志/导出、Lesson/Presentation 选择。LAN HTTP 部署时默认仅 Server Host 本机开放。

## Authoring Studio
备课创作 Surface。当前 D2 首要能力为 Web Presentation Studio；长期承载 Lesson/Activity/Applet 配置、资源、预览与发布。它与 Teacher Runtime 分包，避免课堂端加载重型编辑器。

## Simulation / Rehearsal
Engineering-only Surface。仅使用 synthetic participants；可模拟 Students/Observers/Teacher connections、断网、延迟、重复事件与重启恢复。不得使用生产身份凭证，也不得写入正式课堂 Identity Directory。
