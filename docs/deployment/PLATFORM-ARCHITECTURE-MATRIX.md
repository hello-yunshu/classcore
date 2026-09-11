# 平台与 CPU 架构支持矩阵 — R3.10

## 1. 核心原则

系统**不冻结为单一 CPU 架构**。应用逻辑、课堂契约、Lesson/Applet/Presentation 都必须保持跨架构；浏览器端按能力检测，不按 `arm64/x64` 写业务分支。

但此次公开课有一个明确的 P0 部署要求：

> **Apple Silicon MacBook Pro + Docker 必须原生运行 Server，目标容器架构为 `linux/arm64`。**

这是“当前必须支持目标”，不是“系统只能运行在 ARM64”。

## 2. Server 官方目标

| 目标 | 状态 | Gate | 说明 |
|---|---|---|---|
| `linux/arm64` | 当前必须支持 | D7 | Apple Silicon Mac + Docker，本次公开课主路径 |
| `linux/amd64` | 兼容目标 | D21 | 未来普通 x86_64 Windows/Linux 主机的 Docker 路径 |
| `windows/arm64` 原生 Server | 暂不要求 | 未来 | Docker 可覆盖多数需求 |
| `darwin/arm64` 原生 Server | 暂不要求 | 未来 | 当前统一走 Docker，避免双运行时 |

## 3. Docker 原则

- Dockerfile 不写死 `--platform=linux/amd64`；
- Apple Silicon 上优先原生 `linux/arm64`，不依赖 x86 模拟；
- 同一源码允许 Buildx 构建 `linux/arm64,linux/amd64`；
- 核心原生依赖必须优先检查 `linux/arm64` 支持；长期尽量同时支持 `linux/amd64`；
- 如果某原生依赖只支持 x86_64，不应进入 D7 核心路径，除非有明确替代或充分验证。

## 4. 浏览器客户端

Student / Teacher / Display / Observer / Backstage / Authoring Studio 的 Web 代码不建立 CPU 白名单。

客户端依据：
- Pointer Events；
- IndexedDB；
- WebSocket；
- 内存/并发能力；
- secure context；
- 触点数量；
- 浏览器实际运行基准。

因此学生设备即使是 ARM64，也不会因为“ARM”自动进入低性能模式；真正决定 `student-light` 的是 Surface Profile 和设备能力。

## 5. 当前发布判定

D7：必须证明 `linux/arm64` 路径可以构建/运行真实 Server；如果当前开发环境无法执行 Docker，至少完成 Dockerfile/Compose 静态检查，并在教师 Mac 上首次可用时立即补实际构建验证。

D21：补 `linux/amd64` 构建验证或 CI Buildx；不要求所有平台都有实机。

## 6. Server运行时

生产基线切换到 Node 26 Current；Server业务代码不根据 `arm64/amd64` 分叉，平台差异留在镜像构建与原生依赖兼容层。由于 Current 非 LTS，D7 发布前必须重新完成完整运行时 Gate。
