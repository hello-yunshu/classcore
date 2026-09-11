# Presentation Library 与课堂冻结模型

本阶段把 Presentation 从单一 `deckId` 资源推进为教师账号下的长期课件项目，同时保持 Foundation v0.1.2 不变。当前实现覆盖 reference runtime 的持久化边界；认证账号服务器、真实浏览器 E2E 与 Docker/LAN Gate 仍是未验证项。

## 产品模型

```text
PresentationProject
  ├── Current Draft（一个可变指针，不进入永久 Revision 历史）
  ├── Recovery Checkpoints（有限数量）
  ├── Rehearsal Revision（不可变、默认 TTL）
  └── Published Revision（不可变、课堂版本）
```

Project 只保存 `ownerUserId`、标题、当前 Draft 指针和文档元数据。PPTX/OOXML bytes 不进入 Project JSON 或 SQLite BLOB。

## AssetStore

`PresentationLibraryStore` 使用 content-addressed 文件：

```text
<dataDir>/presentation-assets/<sha256[0:2]>/<sha256>
```

写入顺序为临时文件 → `fsync`/close → hash 校验 → atomic rename → metadata transaction。SQLite 只保存 `assetId/sha256/mimeType/size/storagePath`。相同 bytes 只产生一个 blob。

## Draft 与并发

自动保存只更新 `currentDraftAssetId` 和乐观并发 token `currentDraftRevision`。服务端支持 `expectedRevision`/`If-Match`；token 不匹配返回 `draft-conflict`，不执行静默 last-write-wins。Draft 指针变化时最多保留配置数量的 Recovery Checkpoint。

## Rehearsal、Published 与恢复

- Rehearsal 创建独立 metadata revision，但复用已有 `assetId`；默认按 `rehearsalRetentionDays` 过期。
- Published Revision 的 `assetId`、fingerprint、Runtime Index 与 classroom bindings 在创建时固定，历史记录不原地修改。
- 恢复旧版本的语义是把它复制为新的 Current Draft；Published/Rehearsal 本身保持不变。
- Session Pin 记录 `sessionId → presentationId → revisionId → assetId`。课堂播放只能从 pin 读取，不跟随项目 latest。

## Runtime Cache、Quota 与 GC

Prepare 阶段会把 exact pinned asset 校验 hash 后写入有界 Runtime Cache，并将其标记为 pinned。LRU 只清理未 pin 条目。空间统计按 owner 的 unique referenced assets 计算。

无引用 asset 先写入 GC candidate，经过 `gcGracePeriodMs` 后再次计算 Project/Checkpoint/Revision/Session Pin 引用，仍为零才删除 metadata 与 blob。Project 删除只写 `deletedAt`。

## API 与课堂接缝

Reference server 暴露最小 `/api/presentations`、Draft、Rehearsal、Published、Session Pin 和 Prepare 路径；owner 通过当前 reference adapter 提供，认证课堂 Server 尚未实现。Presentation WebSocket 控制复用现有 transport dedup 与 SQLite playback store：Teacher 控制 exact pinned revision，Display/Observer 只接收 `presentation.sync`。

普通教师界面不显示 `assetId`、SHA、Runtime Index 或 OOXML。当前 Studio 的本地 IndexedDB 仍是浏览器 prototype；把它接到认证账号 API、Picker、版本历史和离线 pending 状态，是下一阶段工作。

## 当前验证边界

已验证：

- content-addressed 去重与 metadata-only SQLite；
- 50 次同内容 Draft 保存不产生永久 Revision；
- Draft conflict、有限 Recovery、Rehearsal TTL、Published immutable restore；
- Session Pin、准备缓存、GC candidate/grace period；
- web-ppt 页面上下移、批量 Undo、动画 append/显式 clear、当前编辑态 Preview 的代码回归。

未验证：

- 认证账号服务器与真实身份授权；
- Playwright 浏览器完整流程；
- macOS Docker `linux/arm64`/`linux/amd64` 运行 Gate；
- 真实 LAN、断互联网课堂、Server restart + Display reconnect 端到端演练；
- XP21A 真机。
