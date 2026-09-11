# 测试策略 — R3.10

不假设能拿到几十台真实XP21A。主要证据来自自动化、虚拟客户端、多浏览器、限速和故障注入；少量实机只能作为额外Smoke。

## 必测层次
1. Contract/Schema负面测试：非法角色、状态、Event版本/payload、Projection泄露、Stage projector缺失等必须失败；
2. Runtime状态机：Session、Activity、Lease、Presentation revision；
3. Surface：6 Product + 1 Engineering 不变量、Student自身份、Teacher/Backstage可识别、Observer/Display同一伪名；
4. Browser multi-user：Teacher Primary/Companion、48 Student、1 Display、40 Observer；
5. Fault：刷新、断网、慢Observer、重复Event、Server restart、Lease takeover、Stage/Presentation漏消息恢复；
6. 性能：Student做CPU/网络限速；Teacher/Observer可更重，但不得影响Student durable；
7. 维护：新公开课模板生成、新Applet不改Core、旧fixture持续通过。

D7不追求攻防测试；只测试会直接影响课堂稳定和身份正确性的基础边界。


## 平台与部署验证
- D7 必须验证 Apple Silicon Mac + Docker 的 `linux/arm64` Server 路径；
- 不把系统锁死为 ARM64，D21 补 `linux/amd64` 构建/CI；
- Web 客户端仍按 capability 测试。

## D6 前置并发
至少先跑 48~50 Student + 20~40 Observer 的轻量参考场景；D8-D14 再升级到更完整 BrowserContext/Fault 测试。

## R3.10 新增 Level-B 验证

`npm run simulate:ws` 使用真实本机WebSocket + SQLite，不再只有队列算术。D6仍需加入浏览器上下文、网络故障和真实教师Mac Docker/LAN验证。

## CR11 mutation parity

`config/private-identity-mutation-corpus.json` 是身份隐私 fail-closed 的跨实现反例语料。Runtime TypeScript、Lesson JavaScript validator 与 Python formal validator 必须对同一案例给出一致 PASS/FAIL；新增身份引用命名空间或遍历结构时，先扩 corpus，再改实现。
