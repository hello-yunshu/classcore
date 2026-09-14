# Architecture Boundary Audit

## 当前总体判断

- Core 设计边界：好
- Core 真实污染：目前较少
- Lesson Package 设计：好
- Lesson 执行代码 seam：不完整
- Student Surface：已有明显课例 Demo
- Teacher Surface：相对通用
- CI semantic boundary：不足
- 第一节真实 Lesson：尚未落地

## 目前最危险的污染入口

### Student
`apps/student-web/src/entry.ts`

不应长期存在：
- 本课标题
- fragmentA/B/C
- 具体 puzzle geometry
- solve rules
- record vocabulary

### Teacher
接入参考设计后尤其要防：
- fixed students
- fixed recommendation 8/32
- 本课 path classifier
- `%4` grouping

### Intelligence
保持现在的 generic runtime，不加入本课 classifier。

### Server
不要为了本课增加 `/api/pattern-restoration/...` 这种绕过 Lesson/Applet/Submission 的平行接口。

## Boundary 的真正目标

不是“文件放在 lessons/ 就算隔离”。

而是：

> 通用层完全不知道某节课的业务语义；Lesson 通过合同/注册/配置使用平台能力。
