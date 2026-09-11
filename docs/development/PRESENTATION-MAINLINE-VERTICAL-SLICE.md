# Presentation 主线纵向切片

## 当前可复验链

```text
Teacher Library
  -> Server-first Project / Draft autosave
  -> validate + server fingerprint
  -> Rehearsal 或 Published immutable Revision
  -> Prepare exact Runtime Cache + Session Pin
  -> Controller Lease 下的 Teacher presentation.control
  -> SQLite PlaybackState
  -> authoritative resolver
  -> Display exact cached player / reconnect
```

## 状态边界

| 领域 | 当前状态 | 说明 |
| --- | --- | --- |
| Storage | `model-tested` | staged claim quota/GC strong-ref、dedupe、soft-delete purge、bounded cache、quota preflight、hash repair/reconcile |
| Freeze | `model-tested` | current-Draft-only、Server bytes-derived web-ppt RuntimeIndex、server fingerprint、strict metadata/binding 校验 |
| Library | `browser-bundle-built` | 新建、导入、搜索、Picker、编辑、重命名、副本、导出、历史、删除、Server-first Prepare；reference owner header 仍非正式认证 |
| Classroom runtime | `loopback integration-tested` | Rehearsal Session、Published Prepare、Session Pin、45s Controller Lease renew/reconnect、durable PlaybackState、Display exact remount/reconnect |
| Browser E2E | `NOT_EVALUATED` | 需要真实 Playwright 双 context、offline-after-prepare 和 console gate |
| Docker/LAN/device | `NOT_EVALUATED` | 需要 Apple Silicon Docker、真实 LAN、XP21A；不能由本机单测替代 |

## 验证命令

```bash
npm run build
npm run typecheck
node --test tests/presentation-library.test.mjs
node --test tests/presentation-library-api.test.mjs tests/presentation-runtime-server.test.mjs
npm run check:display-boundary
```

完整 `npm run check` 仍需在允许本机 loopback/WebSocket 的环境中运行；沙箱禁止监听端口时，相关结果只能记为 `NOT_EVALUATED`，不能写成 PASS。
