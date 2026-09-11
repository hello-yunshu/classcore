# Surface map

## 6 个正式产品 Surface

- `student-web` — Student Client
- `teacher-web` — Teacher Runtime
- `display-web` — Display Client
- `observer-web` — Observer Client
- `backstage` — Operations Control Plane
- `presentation-studio` — Authoring Studio

## 1 个工程 Surface

- `simulation-rehearsal` — Simulation / Rehearsal Console

## Service Plane Host

- `server` — Classroom Server Host（不是用户 Surface）

Surface 与课堂 Role 不同：只有 Student/Teacher/Observer/Display 属于 ClientRole；Backstage/Authoring/Simulation 不新增课堂角色。
