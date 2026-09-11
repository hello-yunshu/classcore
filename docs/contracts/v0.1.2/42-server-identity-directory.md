# Server-only Identity Directory

真实姓名、座位号、班级、rosterId 等身份字段属于 Service Plane，不属于通用 Participant Contract，也不进入 Durable Learning Event。

权威映射示例：

`student:S17 -> { displayName, seatNo, rosterId, classId }`

访问规则：
- Teacher/Backstage 只能通过 Projection Service 查询；
- Student 只能获得自己的 self projection；
- Observer/Display 永远不能查询；
- Authoring Studio 不读取真实课堂身份；
- 外部 LLM 默认只接收匿名 subject。

Identity Directory 必须可在 Server restart 后恢复，或者可由本地 roster/session metadata 确定性重建。
