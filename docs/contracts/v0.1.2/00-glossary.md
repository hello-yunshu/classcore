# Domain Vocabulary Specification v0.1.2

- **Lesson**：一节课的结构化运行定义，不等于页面或程序。
- **Activity**：具有教学目的、参与方式、Applet、提交/建议策略的课堂运行单元。
- **Applet Type**：一种可复用交互工具的类型，例如 `applet:transform-board`。
- **Applet Instance**：Applet Type 在某个 Activity 中的一份实际实例，例如 `applet-instance:sender-board`。
- **Participant**：人或展示角色的课堂身份；不等于设备连接。
- **Connection**：某台设备/浏览器标签页到 Session 的实时连接。
- **Command**：希望系统执行什么；必须由服务器认证连接、授权、校验状态后执行。
- **Client Applet Event**：Applet 侧产生、等待 Server 接受的候选学习事件；不能自称 actor/session。
- **Domain Event**：Server 接受/产生后的不可变事实，具有权威 actor、session 和 serverSeq。
- **Applet State**：某 Applet Instance 在某 StateScope 下可序列化、可恢复的完整状态。
- **Live State**：为了实时镜像而发送的瞬态状态，latest-wins，可丢旧帧。
- **Snapshot**：用于恢复的完整 Applet State 快照。
- **Learning Artifact**：学习过程中产生的可引用对象，有不可变 revision。
- **Submission**：将特定 Artifact revision 正式提交给 Activity。
- **Artifact Transfer**：把 Artifact 的特定 revision 从一方发送给另一方/组。
- **Classroom Stage**：教师控制的全班公共展示状态。
- **Diagnosis / Intervention / Advice**：判断、介入决策、三端支架表达。
- **Session Membership**：Participant 获准进入某一次 Session 的有状态授权关系；Connection 必须绑定 active Membership。
- **Protocol Handshake**：正常课堂消息前对协议、Runtime 版本、设备能力和 Session Policy 的协商。
- **Resolved Lesson Reference**：Session 启动时固定的 Lesson Package/版本/指纹；运行中不随备课文件修改而变化。
- **Read Model / Projection**：由 Server 从权威状态生成、面向各 Product Surface 的用途特定视图；Observer/Display 共享 public pseudonym，Teacher/Backstage 可用受权的 identifiable projection。
- **External Tool Gateway**：未来第三方/远程工具的隔离接入边界，不等于 trusted Applet。

- **Product Surface**：面向用户的独立产品/界面边界；R3.1 固定六个。
- **Engineering Surface**：仅开发/演练使用的界面边界，不属于生产课堂身份。
- **Service Plane**：Server/Runtime/Storage/Identity/Projection 等后端可信执行面，不是用户 Surface。
- **Session Pseudonym**：当前 Session 内稳定的公共学生标识，Observer 与 Display 共用。
