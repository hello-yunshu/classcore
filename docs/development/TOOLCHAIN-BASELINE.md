# 工具链基线

当前课堂发布基线：

- Node.js 26.8.2 Current
- npm 11.19.1 stable
- TypeScript 7.0.2 stable
- Python 3.14.7 stable
- Python jsonschema 4.26.0 stable

原则：优先使用当前受支持的 LTS / stable 版本；不为 Node 22、TypeScript 5 等旧工具链保留兼容分支。当前按用户要求使用 Node 26.8.2 Current；由于它不是 LTS，必须在每次升级后运行完整 Release Gate，并在课堂发布前明确复核风险。工具链升级不得要求修改 Foundation v0.1.2 领域契约。

浏览器与 Server 业务逻辑不得基于 ARM/x86 写业务分支。此次公开课必须支持 Apple Silicon MacBook Pro 上 Docker 原生 `linux/arm64`；同一套代码保留 `linux/amd64` 构建能力。
