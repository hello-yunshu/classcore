# Surface 与 Projection 契约

## 六个产品Surface
Student、Teacher Runtime、Display、Observer、Backstage、Authoring Studio。

## 一个工程Surface
Simulation / Rehearsal。

## Projection原则
- Canonical数据只在Service Plane内部；
- Teacher获得可识别投影；
- Backstage获得运维可识别投影；
- Student只获得自己的身份与数据；
- Observer/Display只获得同一Session伪名投影；
- Authoring Studio编辑态不获得真实课堂学生；
- Simulation只使用synthetic identity。

## 公共Stage能力隔离
Public Stage projector收到的context只有`forPublic()`，运行时对象本身不暴露`forTeacher()`；字段扫描只作为第二道防线。

## 动态网页PPT
Presentation Widget Resolver同样按Surface返回Teacher identifiable或Public pseudonymous projection，Deck只保存语义selector。
