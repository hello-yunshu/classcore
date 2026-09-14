# Product Surfaces, Engineering Surface & Service Plane — R3.10

## 6 个正式产品 Surface

1. **Student Client** (`student`)
   - 课堂/练习/复盘模式；
   - 弱设备优先；
   - 只识别自己；
   - 不加载 Teacher/Observer/Presentation Studio 重型能力。

2. **Teacher Runtime** (`teacher-runtime`)
   - 课堂控制、Activity、Stage、学生资源、实时镜像、教学决策；
   - 可识别学生，但只能通过 Server Projection API；
   - Presentation 编辑通过独立 Authoring Studio 打开。

3. **Display Client** (`display`)
   - 只读大屏；
   - 只消费 `ProjectedStageState<audience=display>`；
   - 学生身份与 Observer 使用同一 Session pseudonym；
   - 禁止访问真实 participantId/name mapping。

4. **Observer Client** (`observer`)
   - 只读研究/观察；
   - 只消费 public pseudonymous projection；
   - 可比 Student 更重，但 Observer QoS 不得拖累 Student Durable path。

5. **Backstage / Operations** (`backstage`)
   - 运维/控制面，不是课堂 Role；
   - Session、名单、凭证、Feature Policy、Preflight、Diagnostics、导出、Lesson/Deck 选择；
   - 第一版 LAN HTTP 默认仅 localhost；
   - 通过 operations projection 识别学生，不把 Identity Directory 暴露给浏览器。

6. **Authoring Studio** (`authoring-studio`)
   - 备课创作端；
   - D2 先交付 Web Presentation Studio；
   - 长期承载 Lesson/Activity/Applet/Assets/Preview/Publish；
   - 不读取真实课堂学生身份，动态 Widget 编辑态只用占位或模拟数据。

## 1 个工程 Surface

7. **Simulation / Rehearsal** (`simulation-rehearsal`)
   - 工程工具，不是生产 Role；
   - synthetic identities only；
   - 虚拟 Student/Observer、断网、延迟、重复/乱序、Server restart、Lease takeover。

## Service Plane

Service Plane 不是“第八个端”，由 Server/Runtime 内部能力组成：

- Classroom Server Host
- Runtime Core
- Realtime Hub
- Storage
- Identity Directory
- Projection Service
- Immutable Lesson Package Store
- Intelligence Runtime
- Learning Analytics Runtime（能力层，D7 可最小或关闭）
- Integration Gateway（未来）

### 核心信任边界

`Browser Surface -> Server API/Realtime -> Authorization/Projection -> Service Plane`

浏览器端不得直接依赖 `@classroom/server-identity` 或 `@classroom/server-projections`。真实学生身份只存在 Service Plane；所有对外学生数据先经过 Surface Projection。


## 当前部署映射

- 课堂 LAN `:9602`：Student / Teacher Runtime / Display / Observer；
- 教师本机工具 `127.0.0.1:9688`：Backstage / Authoring Studio；
- Simulation / Rehearsal：工程入口，不由生产 Server 暴露 HTTP；
- Service Plane：Server 内部，不是浏览器 Surface。

这个部署映射服务于稳定和职责隔离，不改变“6 Product Surface + 1 Engineering Surface + Service Plane”的产品架构。
