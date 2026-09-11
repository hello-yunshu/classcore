# Identity & Identifier Specification v0.1.2

推荐：
- `lesson:pattern-restoration`
- `activity:restore-independent`
- `applet:transform-board`（Type）
- `applet-instance:restore-main`（Instance）
- `session:<uuid>`
- `student:S17` / `teacher:T01`
- `connection:<uuid>`
- `pair:<uuid>` / `group:<uuid>`
- `event:<ulid>` / `command:<ulid>` / `artifact:<ulid>`

硬规则：
1. ParticipantId 与 ConnectionId 永远分离。
2. Teacher Primary/Companion 不是 Participant 属性，而是 Connection/ControllerLease 状态。
3. Observer 与 Display 对外共同使用 `publicSubjectId`（如 `anon:07`），不暴露稳定 participantId；同一 Session 中同一学生在两端编号一致。
4. Durable ID 一旦产生不得复用。
5. Applet Type ID 与 Applet Instance ID 不得混用。
- `membership:<uuid>`：Participant 在某 Session 的授权成员关系。
- `lease:<uuid>`：Teacher 控制权租约。
- `subscription:<uuid>`：Live State 订阅。
- `lesson-package:<slug>`：课程包身份；运行时另保存 resolved package fingerprint。

补充硬规则：
6. Session 必须钉死 Resolved Lesson Reference，不能把“当前磁盘上的 lesson.json”当成运行中的动态真相。
7. Client 自报的 session/role/participant 不构成身份依据；只认服务器认证的 Connection + Membership。
8. `clientEventId` 是 Outbox 重试幂等身份，必须使用足够唯一的 ID，不得使用刷新后从 1 重新开始的裸计数器；`streamSeq` 只在一个 `streamId` 内表达顺序。
