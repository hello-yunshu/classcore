# 稳定、流畅、可维护：工程优先级

## 1. 总优先级

本项目不是高安全等级互联网系统。当前工程优先级固定为：

**稳定性 > 流畅性 > 可恢复性 > 可维护性 > 基础安全。**

基础安全只做到防止课堂误操作、身份串线、Observer/Display 泄露、后台误开放等明显问题；不引入重型零信任、复杂加密体系或攻防框架。

## 2. 稳定性
- Student 的 Durable Event、Submission、Teacher Control 永不因 Observer 富功能而丢失；
- 弱网下学生本地交互继续工作，网络恢复后补传；
- 任何增强能力可降级，不影响核心教学链路；
- D7 前最小 Session/Activity/Stage/Presentation/Identity/Pseudonym/Snapshot 状态必须可恢复。

## 3. 流畅性
- Student 使用 `student-light`，只加载当前 Activity/Applet；
- TransformBoard 本地先渲染，Live State 节流，Durable Event 只在语义动作完成时提交；
- Teacher/Observer 可使用更重的图表、时间线和多窗口，但服务端优先级始终低于 Student Durable 与 Teacher Control；
- 网页 PPT 编辑器只进入 Authoring Studio，不进入 Student bundle。

## 4. 可维护性
- Core 不写具体学科逻辑；
- 新公开课优先新增 Lesson / Applet / Analytics Profile / Presentation Asset；
- 公共接口通过 Schema/Type/Test 三件套维护；
- 每个 Applet 自带 manifest + config/state/event/command schema；
- 每个公开课至少有一个可自动运行的 example/fixture；
- 避免跨包相对路径、重复业务规则、页面直接访问 Service Plane。

## 5. 基础安全边界
仅保留以下硬边界：
- Observer/Display 只读且学生身份匿名；
- Backstage D7 默认仅本机；
- `system` 永远不是客户端角色；
- Applet 只能在 `interactive` access mode 下提交学习事件；
- Authoring Studio 的课件绑定不得写死真实学生。

不为 D7 引入：OAuth 平台、复杂 RBAC、证书体系、WAF、攻击检测、云密钥系统等。

## 6. 跨架构运行
- Server 应用逻辑不按 ARM/x86 分叉；
- 当前公开课必须支持 Apple Silicon Mac + Docker 原生 `linux/arm64`；
- 长期保留 `linux/amd64` 容器目标；
- Web 端按 capability 而非 CPU 白名单运行；
- 原生依赖优先选择同时支持 Linux ARM64/AMD64 的实现。
