# 网页版 PPT 引擎决策 — D1限时Gate

## 目标

需要的是**网页原生的PPT式制作 + 播放 + 课堂同步**，不是单纯浏览`.pptx`。

## 候选

### PPTist（优先验证）
优点：浏览器内PPT式创作体验成熟，已有文字/图片/图形/媒体/公式/页面编辑与放映基础，并支持自定义元素扩展。

约束：当前上游采用AGPL-3.0。必须放在 Presentation Adapter 后，不能把其内部数据结构扩散到Foundation。未来若涉及闭源商业化，再单独处理许可决策。

### web-ppt（第二候选）
优点：MIT许可、core/edit-core/editor/viewer-core模块清楚、适合长期替换。

约束：编辑器成熟度需PoC验证，不能因架构更漂亮而拖慢D2交付。

## D1 Gate：最多4小时
用真实公开课内容验证：空白Deck、页面CRUD、文字/图片/SVG/图形、拖拽/缩放/图层、保存/重开、播放、step同步接缝、一个课堂动态占位元素。

决策规则：PPTist先过则用；明显不过立即试web-ppt；两者都不过就做只覆盖D7硬需求的极简Scene Studio。**禁止为了选引擎研究一整天。**

## 集成边界

`Engine-native document -> PresentationAsset -> Engine Adapter -> PresentationPlaybackState`

Classroom Runtime只关心Stage和权威播放状态，Student bundle永远不加载Presentation编辑器。
