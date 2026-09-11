# Authoring Studio — product surface

正式备课创作 Surface。当前已完成 web-ppt Presentation Studio 的 Editor Foundation、三栏布局、真实缩略图、内容工具、预览与本地 Published AssetStore 发布冻结链。

生产入口通过 `PresentationStudioController` 收拢 web-ppt 命令；草稿和发布二进制都使用 IndexedDB，发布记录包含校验后的 Runtime Index 与 SHA-256 fingerprint。Server 侧的课堂 Published Presentation API、Teacher lease 和 Display recovery 仍属于下一段课堂纵向接缝。

它不是 Teacher Runtime，也不是课堂 Participant Role。课堂运行时 Teacher 可从“编辑课件”入口打开独立路由/Bundle。Authoring Studio 不读取真实课堂学生身份；动态课堂 Widget 在编辑态使用占位/模拟数据，运行态由 Projection-aware Resolver 注入。
