# 公开课 7 天交付计划 — R3.10

## 硬承诺
- D2：学生练习 Alpha + 网页版 PPT 创作 Alpha；
- D7：完整公开课 RC；
- Web Presentation 是 P0，不是可选增强；
- 六个 Product Surface 在 D7 都必须有正确的最小入口。

## D7 各端最低要求
- **学生端**：Join、当前 Activity、TransformBoard、本地优先、提交、自己的建议/身份。
- **教师端**：Activity/Stage/Presentation 控制、Lease、真实学生投影、重点资源和必要进度。
- **大屏端**：只读 Stage/Presentation，学生只显示与 Observer 相同的 Session 伪名。
- **Observer端**：只读、匿名、同步课件、聚合/证据/Advice/重点 Live，带 QoS 限额。
- **后台端**：本机创建课堂、名单、凭证/二维码、Feature Policy、Preflight、Diagnostics、日志、Lesson/Deck选择。
- **备课创作端**：页面编辑、基础素材、保存/重新打开、关键动画、课堂动态 Widget binding；编辑态不访问真实学生。
- **模拟演练台**：D6 前至少可生成基础虚拟学生/Observer和断线重连场景。

## 降级顺序
1. 降 Observer 刷新和富分析；
2. 降 Observer 多学生 Live；
3. 降 Teacher 非必要可视化；
4. 简化装饰性动画，但保留页/step/同步；
5. Advice 改 Teacher-confirm 或 OFF；
6. 关闭 Live Mirror，但保留 Event/Submission；
7. Backstage只保留必要操作。

永不优先牺牲：学生本地交互、Teacher Activity/Presentation 控制、Durable Event/Submission、基础恢复能力。
