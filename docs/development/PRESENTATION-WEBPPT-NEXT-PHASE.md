# web-ppt 完整接入与布局计划

修订日期：2026-09-11

## 1. 决策已收口

- Presentation 编辑与播放只推进 `web-ppt`；不再评估、接入或保留其它编辑引擎分支。
- 当前 `@classroom/presentation-webppt-adapter` 是可运行的薄接入层，不代表 web-ppt 全部能力已经接入 Studio。
- Scene Studio 只保留为 contract harness、测试夹具和紧急降级，不继续扩展为第二套 Office 编辑器。
- Foundation v0.1.2、`PresentationAsset`、`PresentationPlaybackState`、Runtime Index 和 Projection 边界不改；第三方文档模型仍只停留在 adapter/Studio bundle。

## 2. 下一阶段目标

把当前“能打开、能保存、能播放”的 Alpha，推进为教师可以稳定制作《图案的还原》最终课件的 web-ppt Authoring Studio：

```text
真实 web-ppt 编辑能力
  -> 稳定的 Studio 工具栏 / 布局
  -> 本地草稿与 Published Presentation
  -> Teacher 权威播放控制
  -> Display 播放与恢复
```

## 2.1 当前实现状态（2026-09-11）

Editor Foundation、Layout Shell 和第一批 Content & Style Tools 已完成。当前 Studio 已通过 controller façade 使用 web-ppt 的页面、对象、文字、图形、表格、图片、背景、变换、层级、对齐、动画、预览和 OOXML 保存能力；页带缩略图由独立 web-ppt Viewer 真实渲染。IndexedDB 保留离线 draft cache，reference 服务可用时通过 raw Asset API + `If-Match` 同步 Server Draft；发布正式走 Server fingerprint。

Reference Server 已补齐 metadata-only AssetStore、raw upload/owner claim/quota、Draft expectedRevision conflict、Recovery/Rehearsal/Published/Restore、Session lifecycle、按 Session Runtime Cache pin/release、maintenance runner，以及 pinned revision 的 Presentation control/sync/restart vertical slice。Teacher Library 和 reference Studio Server Draft autosave 已接入；仍未完成的产品接缝是认证账号 owner authorization、完整 Picker、正式 Teacher lease、Display-only browser player reconnect 和真实 LAN/Docker/XP21A 演练；reference 实现不能替代这些 Gate。

完整接入的含义是“把 web-ppt 已有的编辑能力接入产品入口”，不是在 ClassCore 里重新实现编辑器内核。

## 3. 能力范围

### P0：下一阶段必须完成

- 页面：新增、复制、删除、排序、切换、缩略图真实渲染；
- 画布：多选、移动、缩放、旋转、翻转、吸附、层级调整、复制粘贴、删除；
- 内容：文字编辑与基础段落/字符格式、基础图形、图片本地导入、SVG、表格；
- 样式：填充、描边、页面背景、对齐与等距分布；
- 播放：页面切换、动画批次、上一动画/下一动画、完成当前页动画；
- 文件：PPT/PPTX 导入、真实 OOXML 保存、重开、离线资源、内容指纹；
- 课堂接缝：Runtime Index、绑定占位、Published Presentation 草稿→校验→冻结→发布。

### P1：同一阶段完成基础接入后再补

- 超链接、隐藏页面、多个 mounted view、缩放与参考线控制；
- 键盘快捷键、IME/中文输入、无障碍焦点与 reduced-motion；
- 字体替换与本地字体策略；
- 课堂播放态接入 Teacher lease、SQLite recovery、Display reconnect。

### 明确不在本阶段承诺

复杂图表/SmartArt/OLE 的完整编辑、PowerPoint 全量主题系统、完整时间轴、多人 CRDT 协作和所有 PPTX 兼容性。对这些对象优先保证安全解析、稳定显示、尽可能保留和 fail-closed，不把“可显示”写成“可编辑”。

## 4. Studio 布局方案

### 设计方向

采用“教师备课桌”而不是通用 Dashboard：中央是带纸面比例的课件画布，左侧是可快速扫读的页带，右侧是当前对象的检查台；蓝色负责选择/对齐，珊瑚色只用于播放/发布等课堂动作。视觉语言沿用当前纸张、墨色、细线基础，但先做布局与交互，再冻结最终 Design Token。

暂定色彩：

| Token | 值 | 用途 |
|---|---|---|
| `paper` | `#F6F3EC` | 工作台背景 |
| `ink` | `#24324B` | 主要操作与标题 |
| `canvas` | `#E7E3D9` | 画布外框 |
| `line` | `#D9D6CC` | 分隔线与边界 |
| `focus` | `#5575B8` | 选中、对齐、焦点 |
| `signal` | `#C96B55` | 播放、发布、警示 |

```text
┌──────────────────── Document Bar: 文件 / 标题 / 保存状态 / 发布 / 播放 ────────────────────┐
├──────────────────── Context Toolbar: 撤销 | 插入 | 排列 | 样式 | 动画 | 视图 ───────────────┤
│  Filmstrip 224px  │                 Canvas Stage                  │  Inspector 288px          │
│  ┌──────────────┐  │          ┌──────────────────────┐             │  对象 / 页面 / 动画       │
│  │ 01 thumbnail │  │          │                      │             │  选择对象后显示上下文属性 │
│  │ 02 thumbnail │  │          │       16 : 9          │             │  未选择时显示页面属性     │
│  └──────────────┘  │          └──────────────────────┘             │  底部显示 binding 状态     │
│  + 新页面 / 排序   │          zoom / fit / guides                 │                         │
└──────────────────── status bar: 当前页 / 变更 / 快捷键提示 / 错误 ─────────────────────────┘
```

### 布局约束

- 主目标尺寸为教师 Mac 的 `1280×800` 与 `1440×900`；编辑工作台最小宽度按约 `1180px` 设计，不强行把完整编辑器压进手机。
- 画布永远保持 16:9，采用 fit-to-stage；缩放、标尺和参考线只影响视图，不改变文档坐标。
- 左侧页带使用真实 web-ppt 缩略图 view，不再用占位文字；页带滚动独立于画布。
- 右侧检查台固定为上下文面板：`对象`、`页面`、`动画` 三个标签；引擎诊断信息放进折叠的 Diagnostics，不占主编辑空间。
- 顶部把“文件动作”和“编辑动作”分组；`保存`、`发布`、`播放`保持稳定位置，不随选择对象改变。
- 工具栏命令通过一个 ClassCore controller façade 进入 adapter，页面组件不得散落直接拼装 web-ppt command。
- 低于 `1180px`：检查台变为右侧 drawer；低于 `900px`：页带变为底部横向 strip，检查台改为 modal/drawer；移动端只保证预览与只读，不承诺完整编辑。

### 交互与无障碍

- 选中态、拖拽态、保存态、发布态、错误态必须有视觉和文本双重反馈；
- 所有工具栏可键盘访问，画布操作保留 web-ppt 原生快捷键和 IME 输入；
- 预览播放支持键盘前进/后退/退出，遵守 `prefers-reduced-motion`；
- 不用颜色单独表达选中、警告或发布状态；
- 页面缩略图、对象列表、属性面板共享同一个 stable scene/element identity。

## 5. 实施顺序与验收 Gate

### A. Editor Foundation

建立 command façade、能力探测和 selection/change subscription；先接入页面、选择、变换、层级和撤销/重做。Gate：所有命令可撤销，保存后 scene/element identity 不漂移。

### B. Layout Shell

稳定三栏工作台、真实缩略图、多视图 canvas、context toolbar、inspector tabs、缩放/fit 和响应式 drawer。Gate：`1280×800`、`1440×900`、`1024×768` 三个尺寸下无画布裁切、操作区不遮挡、焦点可见。

### C. Content & Style Tools

依次接文字、图片、表格、图形、SVG、填充/描边、对齐/等距、背景和超链接。每种工具都要有：创建、选中、修改、撤销、保存、重开、预览证据。

### D. Publish & Classroom

补认证账号 Published Presentation/AssetStore、校验/冻结/fingerprint、Teacher lease、SQLite playback recovery、Display-only player 和 reconnect。Reference Server 已提供模型级路径和回归；正式 Gate 仍要求 Teacher 控制是唯一权威来源，Display 不读取编辑器或私有身份。

### E. Failure and Regression Gate

覆盖坏 PPTX、缺失图片、未知 scene、非法 step、重复发布、刷新、Server restart、Display reconnect、离线资源和 bundle 体积；任一关键资源或状态不可信时必须阻断或降级，不静默继续。

## 6. 下一步具体任务

1. 将 Library/Project/Picker/版本历史从 local-only IndexedDB 接到认证账号 API，并保留 offline pending 状态；
2. 将 Draft autosave、Recovery、Rehearsal 和 Published UI 接入教师可理解的“已保存/等待同步/版本历史”语义；
3. 把 reference 的 pinned revision playback 接到正式 Teacher lease、Display player 和 public projection；
4. 补 selected-artifact overlay、Playwright browser refresh/reconnect 和 bundle/offline evidence；
5. 最后做 Docker/LAN/XP21A 证据，未运行的 Gate 继续标记未验证。

每个涉及 Presentation/Runtime/Storage/Realtime 的小阶段运行 `npm run check`；布局阶段额外进行三尺寸真实浏览器截图和键盘/IME验收。
