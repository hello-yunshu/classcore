# 风险登记表 — R3.10

| 风险 | 影响 | 主要控制 | D7处理 |
|---|---|---|---|
| 学生设备渲染过重 | 高 | student-light、本地优先、简单2D、节流 | 先删效果，不改数学交互 |
| 无线拥堵 | 高 | 小语义Event、订阅制Live、QoS | 先降Observer/Live |
| 慢消费者堆积 | 高 | 有界队列、合并、订阅上限 | 禁止无限缓存Observer流量 |
| Durable Event重复/丢失 | 严重 | Outbox、ACK、幂等、SQLite事务 | 不允许静默丢失 |
| Teacher主控掉线 | 高 | Lease renew/expiry/takeover | Companion接管 |
| Server重启 | 高 | D7前最小持久化、reconnect | 恢复或走明确恢复流程 |
| 网页PPT集成拖延 | 高 | D1 4小时PoC、D2 Studio Alpha | 早切换引擎/缩编辑范围 |
| Presentation动画不稳 | 中 | 确定性scene/step | 降动画，不删演示主链 |
| Observer过重拖累课堂 | 高 | QoS/优先级 | 先降Observer |
| 身份串线 | 高 | claim/reconnect token/reset | 后台可重置设备绑定 |
| 范围膨胀 | 严重 | P0/P1/P2 | D7前禁止新Core抽象 |
| 没有大规模实机 | 中 | 多浏览器/虚拟客户端/限速/故障 | 明确限制，不伪称实机通过 |

安全相关风险只处理会直接破坏课堂使用的基础问题，不扩展为重型安全项目。


## R3.10 当前风险
- **原生依赖不支持 `linux/arm64`**：D7 前所有 Server 核心依赖优先验证 ARM64 Linux；不能靠强制 amd64 模拟维持主路径。
- **Server restart 恢复状态不完整**：D4-D6 按 `RECOVERY-MINIMUM-STATE.md` 对齐 SQLite。
- **Presentation scene/step 越界**：权威播放状态写入前必须经过 `PresentationRuntimeIndex`。
- **并发验证过晚**：轻量 48~50 Student + Observer 基线前移到 D6。

- **Vertical slice被误当最终Server**：R3.10 transport只证明运行链；完整课堂协议必须继续接入Runtime/Storage contracts。
- **Web Shell被误当视觉稿**：所有中性Shell明确标记“Design未冻结”，正式UI另行设计。

- **SQLite驱动成熟度**：R3.10 `node:sqlite` 仅作为零依赖参考实现；D3-D4在Apple Silicon Docker上压测后决定是否继续，Storage Contract保持可替换。
