# Presentation Library 与课堂冻结模型

本阶段把 Presentation 从单一 `deckId` 资源推进为教师账号下的长期课件项目，同时保持 Foundation v0.1.2 不变。当前实现覆盖 reference runtime 的持久化边界、raw Asset API、Teacher“我的课件”入口和 Studio 的 Server Draft autosave；reference owner header 仍不是认证账号服务器。

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

Prepare 阶段会把 exact pinned asset 校验 hash 后写入有界 Runtime Cache，并按 `sessionId → assetId` 记录 strong pin。LRU 只清理没有任何 prepared/active Session 引用的条目。空间统计按 owner 的 unique referenced assets 计算。

无引用 asset 先写入 GC candidate，经过 `gcGracePeriodMs` 后再次计算 Project/Checkpoint/Revision/Session Pin 引用，仍为零才删除 metadata 与 blob。Project 删除只写 `deletedAt`。

## API 与课堂接缝

Reference server 暴露 raw `/api/presentation-assets`、`/api/presentations`、Draft、Rehearsal、Published、Session lifecycle、Session Pin、Prepare 和 revision switch 路径；owner 通过当前 reference adapter 提供，认证课堂 Server 尚未实现。Presentation WebSocket 控制使用 SQLite durable outcome dedup 与 playback store：Teacher 控制 exact pinned revision，Display/Observer 只接收 `presentation.sync`。

普通教师界面不显示 `assetId`、SHA、Runtime Index 或 OOXML。Teacher Library 已接入 reference API；Studio 仍以 IndexedDB 作为离线缓存，并在 reference 服务可用时同步 Server Draft，冲突显示为需重新加载，断网时显示等待同步。认证账号、Picker/课堂设计绑定、完整版本历史 UI 与正式离线课堂仍是下一阶段。

## 当前验证边界

已验证：

- content-addressed 去重与 metadata-only SQLite；
- raw Asset upload、owner claim、Server Draft autosave、server-derived fingerprint 与 current-draft-only freeze；
- 50 次同内容 Draft 保存不产生永久 Revision；
- Draft conflict、有限 Recovery、Rehearsal TTL、Published immutable restore；
- Session lifecycle、按 Session 的 cache pin/release、准备缓存、GC candidate/grace period、维护 runner；
- Teacher Library reference UI 与 Studio generation-drained autosave/current-state thumbnail path；
- Presentation control success/failure outcome replay，失败重试不会变成成功；
- web-ppt 页面上下移、批量 Undo、动画 append/显式 clear、当前编辑态 Preview 的代码回归。

未验证：

- 正式认证账号服务器与真实身份授权；当前 reference owner header 只能作为开发适配层；
- Playwright 浏览器完整流程与双 context conflict/offline evidence；
- macOS Docker `linux/arm64`/`linux/amd64` 运行 Gate；
- 真实 LAN、断互联网课堂、Server restart + Display reconnect 端到端演练；
- XP21A 真机。
