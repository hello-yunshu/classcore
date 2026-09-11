# D7 网页版 PPT / Web Presentation 能力范围

> Roadmap R3.10。该能力是公开课 RC 的 **P0**，位于 Foundation v0.1.2 之上的 Capability Layer。

## 产品含义

不是重做 Microsoft PowerPoint，也不把 `.pptx` 高保真兼容作为课堂前提。目标是：**教师能在浏览器里像做PPT一样制作网页课件，并由Teacher控制，同步到Display/Observer。**

## D2前必须可制作
- 页面增删复制排序；
- 文字、图片、SVG、基础图形；
- 位置、大小、层级；
- 保存/重新打开 `PresentationAsset`；
- 预览/播放。

## D7必须可播放和同步
- 出现、淡入淡出、移动、缩放、强调等课内关键动画；
- 场景/页面切换；
- 确定性 step 顺序；
- Teacher上一/下一页、上一/下一step、跳转、播放/暂停；
- `presentation.control` 必须经过Teacher Controller Lease与revision；
- Display/Observer只读同步；
- 重连后从权威 `PresentationPlaybackState` 恢复。

## 动态课堂内容
课件可绑定：学生作品、选定Live、学生对比、班级摘要等。绑定必须使用**语义selector**，例如 `teacher-focus`、`selected-artifact`，不能写死 `student:S17`。

## 允许延期
完整PPTX导入导出、母版、SmartArt、Office级字体兼容、复杂图表、动画时间轴编辑器等均不是D7 Gate。
