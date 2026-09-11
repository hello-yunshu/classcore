# D7 最小恢复状态 — R3.10

D7 不追求灾备系统，只要求课堂Server意外重启后能在可控步骤内恢复到可继续上课的状态。

## 唯一权威状态

- `ClassroomSession`：包含 status、currentActivityId、**唯一 FeaturePolicy 副本**；
- Membership；
- ControllerLease；
- Identity Directory；
- StudentClaim / reconnect binding；
- Session pseudonym mapping；
- StageState；
- PresentationPlaybackState；
- Applet Snapshot；
- Resolved Lesson/Deck pin。

## R3.10 已落地

- `RuntimeRecoveryStorage` 不再单独存 FeaturePolicy；
- `StudentClaimPersistenceStore`；
- SQLite/WAL参考实现；
- `RecoveryCoordinator`；
- SQLite close/reopen 自动测试；
- Claim + Pseudonym + Presentation restore 自动测试。

## 恢复顺序

`Pinned Lesson -> Session -> Membership/Identity -> Claim -> Pseudonym -> Lease/Stage -> Presentation -> Applet Snapshot -> Presence重新接入`

真实Server实现时只能通过这一编排入口恢复，不允许各Service自行无序恢复并互相覆盖。
