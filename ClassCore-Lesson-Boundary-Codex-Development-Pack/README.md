# ClassCore Lesson Boundary + Codex Development Pack

本包用于下一阶段：把《图案的还原》作为**第一节真实 Lesson**接入 ClassCore，同时保护 Core，使下一节课不需要修改半个平台。

生成时审计基线：

- repository: `hello-yunshu/classcore`
- branch: `main`
- HEAD: `956d7930c115357c79371336204fdcfb0491f069`

> 执行时必须先重新拉取 `origin/main`。如果 HEAD 已前进，以最新代码为准。

## 为什么需要这个包

当前仓库的方向是正确的：

- `lessons/` 已存在；
- 有 `lesson:new` / `lesson:validate`；
- 有正式 Lesson Package validator；
- Core 的 Runtime / Storage / Realtime / Identity / Intelligence / Projection / Applet SDK 基本保持通用；
- Public Lesson starter 已经把 Lesson / Activity / Applet / Config / Analytics / Presentation 分开。

此前审计记录的问题已在本次闭环中处理；当前实现状态如下：

1. `lessons/pattern-restoration` 已是通过正式结构与 Draft 2020-12 校验的真实 Lesson Package；
2. TransformBoard 已下沉为可复用 shared capability，Student Classroom 只消费服务端 Activity/config；
3. Lesson boundary gate 会阻止 Core/通用 Surface 引入 Lesson、课程 namespace/title、生产 mock shortcut 和固定课堂身份；
4. `lesson-deletion:check` 在不复制 `lessons/` 的临时副本中完成边界检查与 TypeScript 编译；
5. `lesson:new` 的第二课模板包含统一 `analyticsProvider` 入口，并通过结构与正式 Schema 校验；
6. D7 现场设备、局域网和 Docker 证据仍按 fail-closed 规则单独保留，不以自动化测试替代。

## 公开课真实运行入口

开发包中的《图案的还原》不是由通用参考 Server 自动加载。`apps/server/runtime/server.mjs` 仍然是 lesson-agnostic 的未认证参考 vertical slice；要检查本课真实接入，必须启动认证课堂运行时，并显式指定 Lesson：

```bash
env HOST=127.0.0.1 PORT=9602 \
  LOCAL_TOOLS_HOST=127.0.0.1 LOCAL_TOOLS_PORT=9688 \
  CLASSROOM_DATA_DIR=/private/tmp/classcore-visual-check-auth \
  CLASSROOM_LESSON=pattern-restoration CLASSROOM_DEMO_MODE=true \
  CLASSROOM_RUNTIME_MODE=authenticated-classroom-server \
  CLASSROOM_AUTHENTICATION=true CLASSROOM_PRODUCT_READY=true \
  node apps/server/runtime/authenticated-server.mjs
```

浏览器验收入口（本地演示凭证来自 `fixtures/authenticated-demo-credentials.json`）：

```text
学生：  http://127.0.0.1:9602/student?mode=classroom&session=class:authenticated-demo       凭证 A17
教师：  http://127.0.0.1:9602/teacher?mode=classroom&locator=class:authenticated-demo&code=T17
大屏：  http://127.0.0.1:9602/display?mode=classroom&sessionId=session:authenticated-demo&locator=class:authenticated-demo&code=D17
观察：  http://127.0.0.1:9602/observer?session=class:authenticated-demo&code=O17
后台：  http://127.0.0.1:9688/backstage
备课：  http://127.0.0.1:9688/authoring（从课程准备台打开时会带上 courseId 与已绑定 Presentation）
```

## 课程准备台与课堂控制台

教师流程拆为两个界面：

```text
课程准备台（Backstage）
  创建课程工作区 → 导入 PPT/图片/音频等资源 → 使用 Lesson Package 活动与 Applet → 发布版本
                                                                  ↓
课堂控制台（Teacher Runtime）
  选择已发布课程 → 开始课堂 Session → 控制活动/Stage/Presentation
                                                                  ↓
Student / Display / Observer
  使用服务端签发入口加入同一个 Session，并跟随课程状态
```

课程工作区保存在运行数据目录的 `course-workspaces/<slug>/`，包含课程元数据、资源文件、Presentation 绑定和版本状态。当前创建课程以已有 `lessons/<slug>` 为运行基座，先保证新课程不修改 Core；草稿课程不能启动，必须先发布版本。

认证课堂 API：

- `GET /api/courses`：读取内置 Lesson Package 与课程工作区；
- `POST /api/courses`：创建草稿课程；
- `POST /api/courses/:courseId/resources`：加入文件资源，PPTX 自动生成 Published Presentation；
- `POST /api/courses/:courseId/publish`：发布课程版本；
- `POST /api/courses/:courseId/start`：创建独立 Session，签发四端入口。

开始课堂后 Session 固定课程版本、Presentation pin 和当前活动；课程后台后续修改不会改变正在运行的课堂。

若学生端 URL 缺少 `mode=classroom`，或使用 `server.mjs` 而非 `authenticated-server.mjs`，看到的是通用 Practice/等待状态，不能作为本课未接入的证据。

## 本包的最终目标

让架构稳定为：

```text
ClassCore Core
    ↑
Shared Capabilities / Reusable Applets
    ↑
Lesson Package
```

并满足：

> 删除 `lessons/pattern-restoration` 后，ClassCore Core 仍然可以正常 build / test。

以及：

> 下一节课优先只新增 `lessons/<next-lesson>`，而不是修改 Runtime、Teacher、Student、Intelligence Core。

## 使用顺序

1. 读 `00-start-here/CODEX-START-HERE.md`
2. 将 `00-start-here/AGENTS-MD-PATCH.md` 合并进仓库根 `AGENTS.md`
3. 让 Codex 先执行 `codex-tasks/00-ASK-AUDIT-AND-PLAN.md`
4. 审核计划后，再依次执行 Task 01 → 07
5. 每个 Task 独立检查、测试、提交
6. 不允许一次性让 Codex “把全部功能都做完”

## 参考文件

`reference/html/` 原样保存用户已经定稿的：
- 4 碎片学生端
- 2 碎片几何参考
- 教师课堂控制平台

这些是设计与交互参考，**不能直接 iframe 或复制 mock 到 production**。
