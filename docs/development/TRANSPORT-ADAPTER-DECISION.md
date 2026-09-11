# WebSocket Transport 决策边界 — R3.10

R3.10 为了在离线环境里证明“真实 socket + SQLite + Docker入口”能够运行，保留一个依赖 Node 内置模块的最小 WebSocket vertical slice。它是**运行链验证器**，不是长期承诺的 WebSocket 框架。

## R3.10 已补的稳定性边界

- `MAX_WS_MESSAGE_BYTES` 默认 256 KiB，避免异常大消息无限增长接收缓冲；
- 支持标准文本消息 fragmentation，拒绝未掩码客户端帧、二进制消息和异常控制帧；
- Observer 只有显式 subscribe 后才接收 Stage；Display默认接收；
- 慢公共端达到 `OBSERVER_MAX_BUFFER_BYTES` 时优先丢弃 Stage live frame，不阻塞 Student durable / Teacher control；
- Event / Control ID 与 `serverSeq` 都按 Session 隔离；
- `serverSeq` 分配与幂等映射写入 SQLite，同一消息重试返回原始序号，Server重启后继续递增；
- 重复 Teacher Control ACK 但不重复广播。

## D1-D3 是否替换 transport 实现

首次联网安装依赖后，可以PoC成熟的 WebSocket/HTTP Server 方案，但**不是为了“库更多”而强制替换**。选择标准按：

1. 学生/教师主链稳定性；
2. Apple Silicon Docker `linux/arm64`；
3. 背压、心跳、断线检测；
4. 维护成本与调试透明度；
5. 依赖成熟度与升级路径。

无论使用哪种库，都必须保持现有 Runtime/Storage/Surface Contract，不把第三方 WebSocket 对象泄漏到 Foundation。
