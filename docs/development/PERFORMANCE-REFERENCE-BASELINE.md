# 性能与并发参考基线 — R3.10

## 原则

没有大规模 XP21A 实机条件时，不虚构实机SLA。使用分层基线持续比较版本退化。

## Level A：QoS 数学参考

`npm run simulate:load` 只验证优先级/丢弃策略：Student Durable 和 Teacher Control 不应先于 Observer Live 被丢弃。

## Level B：真实本机 Transport + Storage

`npm run simulate:ws` 当前默认启动真实 HTTP/WebSocket Server，连接 **50 Student + 40 Observer + 1 Teacher**，学生事件在ACK前写入 SQLite，Teacher控制同时向Observer广播Stage同步。

它验证：真实socket数量、JSON消息、WebSocket framing、SQLite写入、ACK、广播和进程生命周期；但仍不等价于真实Wi-Fi、浏览器渲染、XP21A触控/GPU性能。

## Level C：D3-D6浏览器与故障

逐步加入：多个BrowserContext/页面、CPU throttling、网络延迟、断网重连、慢Observer、Server restart、Teacher Primary/Companion接管。

## 关注指标

- Student本地pointer交互不等待网络；
- Durable Event/Submission无持续积压；
- Teacher control在Observer压力下仍优先；
- Live允许降帧但最新状态不能无限落后；
- 内存与队列有界；
- Server restart后Identity/Claim/Pseudonym/Stage/Presentation一致恢复。
