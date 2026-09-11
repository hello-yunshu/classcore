# 文档总入口

本仓库主要文档使用中文；代码标识符、协议字段、事件名、错误码继续使用英文。

## 新接手者先读

1. `AGENTS.md`：Codex/Agent 永久工程规则；
2. `CODEX-HANDOFF.md`：R3.10 当前状态与下一步；
3. `docs/development/MASTER-DEVELOPMENT-PLAN.md`：唯一权威长期计划；
4. `docs/architecture/SURFACE-SERVICE-PLANE.md`：6 Product Surface + 1 Engineering Surface + Service Plane；
5. `docs/development/STABILITY-PERFORMANCE-MAINTAINABILITY.md`：稳定、流畅、可维护优先级；
6. `docs/development/RELEASE-GATES.md`：D2 / D7 / D21 验收标准。

## 当前权威专题文档

- `docs/deployment/PLATFORM-ARCHITECTURE-MATRIX.md`：跨架构与 Apple Silicon `linux/arm64` 当前硬目标；
- `docs/deployment/DOCKER-RUNTIME-BASELINE.md`：Docker 课堂端口/Backstage host-only 端口；
- `docs/development/RECOVERY-MINIMUM-STATE.md`：D7 Server restart 最小恢复状态；
- `docs/development/PERFORMANCE-REFERENCE-BASELINE.md`：并发/性能参考基线；
- `docs/development/FRONTEND-DESIGN-BOUNDARY.md`：前端视觉尚未冻结；
- `docs/development/NEW-PUBLIC-LESSON-GUIDE.md`：未来新公开课如何扩展；
- `docs/development/TOOLCHAIN-REPRODUCIBILITY.md`：clean checkout / lockfile / bootstrap；
- `docs/development/STORAGE-ADAPTER-DECISION.md`：SQLite adapter 边界；
- `docs/development/TRANSPORT-ADAPTER-DECISION.md`：WebSocket vertical slice 与最终 Transport 边界。

`docs/contracts/v0.1.2/` 是 Foundation 契约，原则冻结；是否发生漂移由根目录 `FOUNDATION-SHA256SUMS` 与 `npm run foundation:check` 自动判断。

历史审计只看 `docs/archive/HISTORY.md`，不要用历史报告覆盖当前计划。

- `docs/deployment/CLASSROOM-LAN-REHEARSAL.md`：D7 真实路由器 + XP21A LAN 人工硬 Gate；自动 Docker probe 不可替代。
