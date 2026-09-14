# Lesson Package Design

## 本课业务应放在哪里

| 业务 | 归属 |
|---|---|
| 课题名 | Lesson |
| 16×8 | Lesson config |
| 4 个碎片 | Lesson config |
| SVG/内部图案 | Lesson assets/config |
| 初始/目标位置 | Lesson config |
| strict-content | Lesson config |
| 顶点字母候选 | Lesson config |
| 编号顺序 | Lesson config |
| 平移/旋转规则 | Shared TransformBoard engine + Lesson config |
| 路径记录 token 词库 | Lesson config |
| 分组/组长 | Lesson/Session config |
| rotate-first 等分类 | Lesson Analytics |
| 推荐典型学生 | Lesson Analytics output |
| timeout/fallback | Intelligence Core |
| Recommendation confirm | Core |
| Stage comparison | Core |
| Presentation | Lesson asset/binding |

## 不要把 UI 参考文件本身当 Lesson runtime

HTML 只是：
- 设计规范；
- 行为参考；
- geometry reference。

生产代码必须模块化。
