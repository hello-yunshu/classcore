# Student Client — product surface

Runtime profile: `student-light`. Practice Mode 通过 `/student` 启动；Classroom Mode 通过 `/student?mode=classroom` 启动，只提交课堂码和服务器授予的 Join Grant，不接受学生端自报 participant identity。

Classroom client 的 durable Outbox 优先使用 IndexedDB；无 IndexedDB 时只回退到内存实现。当前 reference server 仍不提供 authenticated classroom Join，因此 Classroom Mode 会明确显示连接失败，不把本地练习状态伪装成课堂提交。

认证课堂传输接通后，客户端会消费服务端下发的 current Activity 与 Snapshot，通过 `AppletHostRuntime` 挂载 lesson 提供的 Applet；Event、Snapshot、Submission 只有收到结构化 ACK 才会从 Outbox 移除，LiveState 则按可丢弃的实时通道发送。
