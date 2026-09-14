# ClassCore 课堂工作台设计基线

本文档记录当前课堂课件工作台已经验证过的页面配色。它是后续 Student、Teacher、Observer、Display、Backstage、Authoring Studio 和 Simulation 页面复用的视觉基线，不代表 Foundation 契约冻结。

## 颜色语义

| Token | Value | 用途 |
| --- | --- | --- |
| `--paper` | `#F6F3EC` | 页面主背景、纸张感背景 |
| `--panel` | `#FBFAF7` | 卡片、面板、输入容器 |
| `--panel-wash` | `#FAF9F5` | 工具栏、浅层面板 |
| `--canvas` | `#E7E3D9` | 编辑画布、公共 Stage 容器 |
| `--ink` | `#24324B` | 主文字、主按钮、深色 Stage |
| `--ink-soft` | `#697386` | 次级文字、说明文字 |
| `--muted` | `#7D8490` | 状态、辅助文字、空状态 |
| `--line` | `#D9D6CC` | 普通边框和分隔线 |
| `--line-strong` | `#D2D0CA` | 输入框、画布、强调边框 |
| `--focus` | `#5575B8` | 选中、聚焦、交互主强调 |
| `--focus-wash` | `#E3EAF7` | 选中背景、轻量蓝色提示 |
| `--signal` | `#C96B55` | 关键操作、提醒、品牌点缀 |
| `--signal-wash` | `#FFF8F6` | 珊瑚色的浅背景和危险提示 |
| `--gold` | `#897E70` | 灰金辅助强调，不用于主要操作 |
| `--success` | `#6B776C` | 在线、完成等稳定状态 |

## 使用规则

- 新页面优先声明并复用上述语义变量，不重新发明同义颜色。
- 深墨蓝承担主要信息层级；聚焦蓝只表达选择、焦点和当前状态；珊瑚色只用于关键动作、提醒和品牌点缀。
- 页面背景、面板、画布保持暖纸色的明度层级，避免重新引入纯冷灰或高饱和渐变。
- 课件内容本身可以保留 PPTX 原始颜色；本基线约束的是产品页面、工具栏、Stage 容器和默认模板。
- 用户提供的课件文件不得为了套用页面配色而被直接改写。

当前实现参考：

- `apps/presentation-studio/src/studio.css`
- `apps/teacher-web/src/teacher.css`
- `apps/student-web/src/student.css`
- `apps/observer-web/src/observer.css`
- `scripts/build-web-shells.mjs`
