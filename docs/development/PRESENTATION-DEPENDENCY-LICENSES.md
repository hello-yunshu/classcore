# Presentation 依赖与许可证记录

本记录对应当前主线集成和构建依赖；版本以 `package-lock.json` 为准。

| 依赖 | 版本 | 用途 | 许可证 | 备注 |
|---|---:|---|---|---|
| `@web-ppt/core` | `0.5.0-beta.1` | 文档模型与 OOXML 解析 | MIT | 运行时依赖 |
| `@web-ppt/edit-core` | `0.5.0-beta.1` | 编辑命令与撤销重做 | MIT | 运行时依赖 |
| `@web-ppt/editor` | `0.5.0-beta.1` | 网页编辑器挂载 | MIT | 运行时依赖 |
| `@web-ppt/viewer-core` | `0.5.0-beta.1` | 播放与动画控制 | MIT | 运行时依赖 |
| `esbuild` | `0.28.2` | Studio 浏览器 bundle | MIT | 构建依赖 |
| `pptxgenjs` | `3.12.0` | 生成离线空白模板 | MIT | 构建依赖，不进入浏览器 bundle |

## 复核方式

依赖许可证来自安装包的 `package.json` 元数据；升级任一版本时，应重新检查许可证、依赖树和 bundle 边界，并更新本记录及决策文档。
