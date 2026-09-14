# Runtime Verification — Pattern Restoration

本文件是开发包的运行验收补充，不改变 Core/Lesson 架构边界。

## 先区分两个 Server

| 入口 | 用途 | 能否证明《图案的还原》真实接入 |
| --- | --- | --- |
| `apps/server/runtime/server.mjs` | lesson-agnostic、未认证参考 vertical slice | 否；只能验证通用 Runtime 契约 |
| `apps/server/runtime/authenticated-server.mjs` | 显式加载 Lesson Package 的认证课堂运行时 | 是；用于本课 Student/Teacher/Display/Observer 纵向验收 |

认证运行时必须同时设置 `CLASSROOM_LESSON=pattern-restoration`、`CLASSROOM_DEMO_MODE=true`、`CLASSROOM_AUTHENTICATION=true` 和 `CLASSROOM_PRODUCT_READY=true`。课堂端使用 `9602`，本机工具端使用 `9688`。

## 六端检查顺序

1. 启动认证运行时。
2. 打开 Student classroom URL，并使用 `A17` 加入。
3. 打开 Teacher URL，使用 `T17` 加入；确认学生列表出现 `S17`。
4. 打开 Display URL，使用 `D17`；确认状态为只读投影。
5. 打开 Observer URL，使用 `O17`；确认状态为匿名观察，在线列表只显示 `anon:*`。
6. 打开 `http://127.0.0.1:9688/backstage` 与 `/authoring`；确认本机工具端可访问，后台健康信息显示平台与架构。

## 课程准备台到课堂控制台

1. 打开 `http://127.0.0.1:9688/backstage`，确认可以看到 `图案的还原` Lesson Package。
2. 选择课程并点击 `开始课堂`；浏览器应跳转到带 `mode=classroom`、Session locator 和 `T17` 的 Teacher Runtime，并显示 `已连接 · 教师 T01`。
3. 课程工作区可通过 `创建课程` 创建草稿；选择工作区后导入资源，PPTX 会生成 Published Presentation；点击 `发布版本` 后 `开始课堂` 才可用。
4. 记录启动结果中的 Teacher/Student/Display/Observer 入口，让四个 Surface 使用同一个 Session locator 加入；Teacher Runtime 会显示当前课程、学生课堂码、观察端凭证和可复制的大屏地址。Teacher 发布 `当前活动` 后，Display 和 Observer 应显示相同的公共 Stage。
5. Teacher 取得控制权后，控制权标记应显示“自动续租”；等待超过 20 秒再发布当前活动，仍应成功。若控制权失效，Stage 区域应显示具体恢复提示，而不是只显示无上下文的错误。

接受条件：草稿课程不能启动；启动后的四端 `sessionId` 相同；Session 使用已发布课程版本；后台后续编辑不改变已启动 Session。

## 接入通过条件

- Student 显示课程标题 `图案的还原`、当前 Activity `activity:restore-independent` 和 TransformBoard。
- Teacher 显示认证连接、服务端 Presence、学生资源/Stage 控制入口和服务端生成的 Display URL。
- Display/Observer 已连接且只接收公共 Stage/Presentation 投影；Observer 不显示真实学生身份。
- 六个页面浏览器日志没有 error/warning；`npm run check` 通过。

裸 `/student`、裸 `/display`，或未带 `mode=classroom` 的页面属于通用/等待状态，不应拿来判断本课接入失败。
