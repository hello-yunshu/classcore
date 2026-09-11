# Research Basis for v0.1.2

本架构不是复制某一个教育平台，而是将成熟体系中经过长期验证的边界拆出来，再按本项目的 LAN-first/低端学生设备/实时课堂需求做减法。

- **Open edX XBlock**：参考 Runtime 托管学习组件、服务注入和不同状态 scope；验证 Applet Host + StateScope 方向。
- **H5P**：参考内容类型的参数语义、依赖、版本和运行前校验；验证 Applet Manifest/config validation 方向。
- **1EdTech LTI 1.3/Advantage**：参考平台与外部学习工具之间的安全边界；形成 External Tool Gateway，而不是把第三方 JS 当 trusted Applet。
- **xAPI / 1EdTech Caliper**：参考跨工具学习事件的语义表达；内部 Event 保持独立，但可通过 adapter 导出标准事件。
- **QTI / OneRoster / Common Cartridge**：作为未来 assessment/roster/content 互操作 adapter，不污染内部 Lesson/Activity 模型。
- **Yjs / Automerge local-first ideas**：借鉴浏览器本地持久化和离线恢复；本项目当前不引入 CRDT，只使用 IndexedDB Outbox/Snapshot。
- **Browser secure-context model**：核心 LAN HTTP 不依赖 Service Worker/摄像头/麦克风等 secure-context-only API；未来通过 LAN HTTPS/native deployment 扩展。
- **Web Components / platform abstraction ideas**：保持 Applet/业务 Contract 与 UI 框架、Web/App 宿主解耦，但不强迫 v1 使用某一种组件技术。
- **WCAG / semantic interaction**：操作记录和 Applet command/event 尽量表达语义而非鼠标坐标，使替代输入、回放、自动测试和未来无障碍更容易。

核心取舍：成熟系统证明“运行时边界、状态 scope、事件语义、工具隔离、互操作 adapter”值得长期保留；微服务、CRDT、完整 LMS、完整国际标准实现、云账号体系在当前公开课范围内都属于过度设计，因此没有引入。
