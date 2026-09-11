# SQLite Adapter 决策边界 — R3.10

R3.10 继续用 Node 26 自带的 `node:sqlite` 做**零外部运行依赖的可执行参考实现**，主要目的：尽快验证 WAL、持久 `serverSeq`、重启恢复、WebSocket ACK 前落盘和 Docker 跨架构路径。

这不是把 Foundation 或 Storage Contract 绑定到 `node:sqlite`。真实课堂 Server 只依赖 `ClassroomStorage / RuntimeRecoveryStorage` 等接口。

## 当前客观状态

Node 26 Current 线上的 `node:sqlite` 仍需按升级后的实际运行时重新验证。因此它适合作为当前少依赖 vertical slice，但必须通过 Apple Silicon Docker 的真实压力与恢复 Gate 后才能成为 D7 RC 的最终驱动决定。

## D3-D4 Gate

在教师 Apple Silicon Mac 上验证：

- Docker `linux/arm64` 原生运行；
- WAL 生效；
- 50 学生并发写入；
- Teacher Control 与 Event 共用 Session `serverSeq`；
- Server 重启后序号继续递增；
- 重复 Event/Control 返回原始序号；
- volume 重启后 Session/Claim/Pseudonym/Stage/Presentation 可恢复；
- 运行过程中没有明显 busy/锁等待尖峰。

如果实测足够稳定，D7继续使用；若出现明显阻塞或 API/平台问题，可切换成熟 SQLite driver。切换不得修改 Lesson / Activity / Applet / Surface / Foundation。
