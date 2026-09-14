# Boundary CI Gate Spec

新增脚本建议：

```text
scripts/check-lesson-boundaries.mjs
```

并加入：

```text
npm run lesson-boundary:check
npm run check
```

## 必须检查

### 1. Import direction
Core roots：
- packages/contracts
- packages/runtime
- packages/storage
- packages/realtime
- packages/identity
- packages/intelligence
- packages/projections
- packages/platform
- packages/presentation

不得引用：
- `lessons/`
- `pattern-restoration`
- lesson package source path

### 2. Generic Surfaces
`apps/student-web`
`apps/teacher-web`
`apps/display-web`

不得直接 import：
- specific Lesson implementation；
- specific analytics provider；
- puzzle geometry source。

只允许通过 registry/manifest/runtime 接入。

### 3. Known namespace registry
维护明确的 lesson package IDs，例如：
```json
["lesson:pattern-restoration"]
```
检查它们不能出现在 Core source。

不要简单禁止“旋转”“平移”这些通用词。

### 4. Mock gate
Classroom production path 检查：
- fixed student arrays
- fake QR markers
- fixed AI demo metrics
- hard-coded recommendation student IDs
- BroadcastChannel submission

### 5. Delete-Lesson architecture test
设计测试确保 generic packages/apps 不依赖该 Lesson 的存在。

## 不应做
- 正则扫全仓所有中文；
- 禁止文档提及课例；
- 阻止 fixtures/examples 合理使用；
- 用 boundary gate 替代正式 Lesson schema validator。
