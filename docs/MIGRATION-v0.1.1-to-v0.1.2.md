# Migration v0.1.1 -> v0.1.2

v0.x 允许破坏性修正。本版主要变化：

1. 增加 Session Membership / Join / ClientHello / ServerHello。
2. `ClientCommandEnvelope` 删除客户端自报 `sessionId`；Server 从 ConnectionContext 注入。
3. Applet Manifest 增加 config/state/event schema versions、emittedEventTypes、handledCommandTypes、platform capabilities。
4. `ClientAppletEvent` 增加 `eventEnvelopeVersion`、`appletEventSchemaVersion`；Server Accepted Event 自己生成 eventId/serverSeq/time。
5. Storage 改为原子 `acceptClientEventAtomically` 语义。
6. Submission 改用 `submitterScope + submittedBy`，支持 pair/group。
7. Feature Policy 对受控动作 fail-closed。
8. Controller Lease 增加 renew / expired takeover。
9. Lesson Package 增加 `runtimeApiVersion`；Session 改为钉死 `ResolvedLessonReference`，不再只保存 lessonId。
10. Platform 增加 capability reporting；Applet mount 需检查 required platform capabilities。
11. Applet SDK 增加 config/state/event migration hooks。
12. Observer pseudonym 只通过 projection 生成，不再随 JoinGrant 混入 subject 概念。

旧 v0.1.1 示例/代码需要按新 wire schema 更新；v1.0 兼容承诺尚未开始。
