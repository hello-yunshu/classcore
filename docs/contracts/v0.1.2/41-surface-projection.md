# Surface & Projection Contract — CR2

## 1. Surface 不是 Role

正式产品 Surface 固定为：

1. `student`
2. `teacher-runtime`
3. `display`
4. `observer`
5. `backstage`
6. `authoring-studio`

工程 Surface：`simulation-rehearsal`。

课堂 ClientRole 仍只有 `student / teacher / observer / display`；`system` 仅为 Server 内部 actor。Backstage、Authoring Studio、Simulation 不得获得新的课堂角色。

## 2. 身份视图

- Student：只可识别自己；
- Teacher Runtime：通过 Teacher Projection 识别学生；
- Backstage：通过 Operations Projection 识别学生并可读取名单字段；
- Observer：只可获得 Session 级伪名；
- Display：与 Observer 使用同一 Session 级伪名；
- Authoring Studio：不得读取真实课堂学生身份；
- Simulation：只使用 synthetic identity。

任何浏览器 Surface 均不得直接访问 Server-only Identity Directory。

## 3. Stage 投影

`StageState` 是 Server 内部 canonical state。Teacher/Observer/Display 接收的是 `ProjectedStageState`。

每个 Stage `contentType` 必须注册 projector；缺少 projector 时 fail-closed。尤其 Observer/Display 永不得直接收到 canonical payload。

## 4. Presentation Widget

网页演示中的课堂动态 Widget 必须通过 Projection-aware Resolver：Teacher 可获得 identifiable projection；Observer/Display 只能获得 public pseudonymous projection。Presentation Engine 不得访问 Identity Directory。
