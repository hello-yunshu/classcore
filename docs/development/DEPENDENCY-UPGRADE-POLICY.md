# 依赖升级策略

目标不是永远锁死某个版本，而是让升级可控、可验证、不会影响公开课稳定性。

## 默认策略

- Node：最新 LTS 作为生产默认；Current 只做试验验证。
- TypeScript/构建工具：最新 stable，若出现生态兼容问题允许暂缓一个稳定大版本，但不得长期同时维护两套主线。
- Server 核心依赖：优先成熟、跨 `linux/arm64` 与 `linux/amd64`、升级记录清晰的项目。
- 浏览器依赖：优先现代 evergreen 浏览器支持；Student 端额外以 XP21A 性能预算为硬约束。
- 依赖升级只改变 Capability/Adapter/Build 层，不把第三方库的数据结构写进 Foundation Contract。

## SQLite 特别说明

当前可执行参考实现仍使用 Node 26 自带的 `node:sqlite`，外层始终经 Storage Adapter 隔离。Node 26 为 Current 线，因此 D3-D4 必须在 Apple Silicon Docker 上做实际写入、WAL、重启和并发验证，并在 Node 26 更新后重新确认 API 行为。

若实测不稳，可切换到成熟 SQLite driver；切换只修改 Storage Adapter，Lesson / Activity / Applet / Surface / Foundation 不变。不要仅因为“版本更新”在公开课前主动增加 native addon 风险。

## 每次大版本升级的最小 Gate

- `npm ci` / lockfile 一致；
- strict typecheck；
- 53+ 契约/运行回归；
- Session 隔离与 serverSeq 重启连续性；
- 50 Student + 40 Observer 参考 WebSocket/SQLite 场景；
- Lesson template 生成后立即验证；
- Apple Silicon `linux/arm64` Docker build + health + volume restart；
- 若有第二架构环境，再验证 `linux/amd64`。
