# 工具链与可复现性 — R3.10

## 当前正式基线

唯一版本源：`config/toolchain.json`。

- Node.js **26.8.2 Current**；
- npm **11.19.1**，采用 Node 26.8.2 官方发行包自带版本；
- TypeScript **7.0.2 stable**；
- Python **3.14.7**；`jsonschema` **4.26.0 stable**，安装在项目 `.venv`，不进入课堂运行镜像；`requirements-dev.txt` 同时精确锁定 attrs、jsonschema-specifications、referencing、rpds-py、typing-extensions，避免传递依赖漂移。

Node 26 当前仍是 Current；本项目按用户要求固定到 26.8.2，但课堂发布前必须重新完成完整 Release Gate。以后新的 Node 大版本进入 LTS 或发布新 Current 后，先跑完整 Release Gate，再修改中央版本文件；不保留 Node 22 / TypeScript 5 正式兼容分支。

## Clean checkout / Codex 接手

```bash
npm run doctor
npm run bootstrap
```

`bootstrap` 的固定顺序：

1. 核对 Node/npm；
2. `npm ci` 按 `package-lock.json` 安装 Node workspace；
3. 创建 `.venv` 并安装 `requirements-dev.txt`；
4. 执行完整 `npm run check`。

`npm test` 自己会先 `npm run build`，因此在没有 `dist/` 的新 ZIP 中也不会产生“缺 dist”的假失败。

## Lockfile

R3.10 正式携带 `package-lock.json`。Docker 与 CI 统一使用 `npm ci`，不再在构建时执行开放式 `npm install`。Python validation chain 采用 exact pins；`toolchain` 会检查 `.venv` 中这些版本。

当前外部 Node 依赖极少：主要为 TypeScript 编译工具。未来新增依赖时：

- 优先最新 stable/LTS；
- 不为追新引入实验性核心依赖；
- 重大版本升级必须重新跑完整 `npm run check` 和 Docker Gate；
- native 依赖至少保证 `linux/arm64`，并优先同时支持 `linux/amd64`。

## TypeScript 7

项目使用 TypeScript 7 的长期配置写法，不保留旧 `baseUrl` 兼容层。工具链升级不能迫使 Foundation v0.1.2 跟着变化。

## 产物策略

`dist/`、`node_modules/`、`.venv/` 不进入源码 ZIP。每个 checkout 都由 lockfile + 正式工具链重新生成构建产物。
