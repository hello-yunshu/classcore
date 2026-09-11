# State Machine Specification v0.1.2

## Session
`created --system.session.ready--> ready --session.start--> running <-> paused --session.end--> ended`

`system.session.ready` 是 Server/Preflight 产生的系统 transition，不是普通教师 Command。

## Activity
`inactive -> active <-> paused -> closed ->(reopen)-> active`

`activity.advance` 是 Runtime orchestration command：关闭/挂起当前 Activity，解析 Lesson 顺序并激活下一 Activity，不是单一 Activity 状态迁移。

## Submission
`draft -> submitted -> accepted`

## Advice
`observing -> triggered -> shown -> waiting -> resolved | escalated | expired`

## Controller Lease
`unassigned -> held -> released/expired -> held`；claim/renew/release/takeover 必须由 Server 原子处理并检查 revision。
