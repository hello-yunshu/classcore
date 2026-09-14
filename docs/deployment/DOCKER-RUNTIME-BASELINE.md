# Docker Runtime Baseline — R3.10

## 当前目标

- Host：Apple Silicon MacBook Pro；
- Docker Server：本次 P0 为原生 `linux/arm64`；
- 兼容目标：`linux/amd64`；
- 业务代码不得按 CPU 架构分叉。

## 端口与 Surface

课堂 LAN 服务：

```text
container 0.0.0.0:9602
host      0.0.0.0:9602
```

9602 只承载 **Student / Teacher Runtime / Display / Observer**。课堂设备不应通过此端口加载 Backstage、Authoring Studio 或 Simulation。

教师本机工具端口：

```text
container 0.0.0.0:9688
host      127.0.0.1:9688
```

9688 提供 **Backstage `/backstage` + Authoring Studio `/authoring`**。因此教师 Mac 可以访问它们，但 LAN 中学生设备无法直接连接 9688。这个边界由 Docker host port binding 实现，不依赖容器内 `remoteAddress` 判断。

**Simulation / Rehearsal 是工程 Surface，不由生产 Server 暴露 HTTP 路由。** 它通过测试脚本、工程入口和后续专用开发工具运行。

## 构建

当前机器镜像：

```bash
deploy/docker/build-current.sh classroom-runtime:local
```

长期多架构推送：

```bash
deploy/docker/build-multiarch.sh registry/image:tag
```

Dockerfile 使用 `package-lock.json + npm ci`，避免构建时依赖漂移。

## 自动 Release Gate

在教师 Apple Silicon Mac 上执行：

```bash
npm run release:d7
```

其中 `docker:gate` 会自动验证：

- 当前宿主对应镜像可构建；
- 课堂端口与本机工具端口可启动；
- Backstage / Authoring 仅走本机工具端口；
- Simulation 不进入生产 HTTP 路由；
- Teacher WebSocket control 可写入；
- 容器重启后重复 control 保持幂等；
- SQLite 中的 `serverSeq` 可从 1 继续到 2。

这仍不能替代真实教室 LAN / XP21A smoke，但能消除大量“Docker 只是静态配置、从未真正运行”的风险。

## 数据

SQLite 数据目录 `/data` 必须映射到本地 Docker volume。不要把 SQLite/WAL 放在网络文件系统。

## D7 必验

在实际 Apple Silicon Mac 上至少执行：`npm run release:d7`、浏览器 LAN 访问、50 学生参考并发、必要的小规模 XP21A smoke、Server restart 和 SQLite 恢复。当前非 Docker 审计环境不能替代这一 Gate。
