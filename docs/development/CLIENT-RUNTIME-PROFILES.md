# 客户端运行档位 — R3.10

共享 Contract 不代表所有端性能预算相同。

## Student — `student-light`
目标：弱 Android 平板也要跟手、稳定。
- 只加载当前 Activity/Applet；
- 不加载全班分析、多学生渲染、重图表、本地AI；
- Pointer Events + 简单2D渲染；
- Live节流/合并，Durable Event小而可靠；
- reconnect/outbox 不依赖 Service Worker。

## Teacher — `teacher-rich`
目标：课堂控制与教学决策。
- 可加载班级聚合、推荐资源、2-4个Live、证据、Stage控制和Diagnostics；
- 多教师设备 + Lease；
- 默认不加载重型创作编辑器，“编辑课件”打开独立 Authoring Studio bundle。

## Observer — `observer-rich`
目标：观察和研究，不拖慢课堂。
- 同步Presentation、匿名学生、聚合、证据、Advice、重点Live、时间线；
- 只读；
- 网络/CPU压力时先降级。

## Display — `display-render`
目标：干净的大屏输出。
- 无管理/编辑器；
- 只渲染 Projected Stage/Presentation；
- 学生统一伪名；
- reconnect 后从权威状态恢复。

## Backstage — `backstage-ops`
目标：本地运维和排错。
- Session、名单、凭证、Feature Policy、Preflight、Diagnostics、日志/导出；
- D7 默认仅本机；
- 可以看 operations projection，但浏览器不直接导入 Identity Directory。

## Authoring Studio — `authoring-rich`
目标：高效备课。
- D2 网页版PPT编辑器；以后扩Lesson/Activity/Applet/Assets/Preview/Publish；
- 可使用重型编辑库；
- 编辑态不读取真实课堂学生。

## Simulation — `simulation-engineering`
目标：可重复验证。
- 虚拟学生/Observer、延迟、断线、重复/乱序、restart、Lease；
- synthetic identities only；
- 可以较重，因为不是生产课堂端。

## 服务端流量优先级
1. Student durable event/submission
2. Teacher control
3. Snapshot / 必要Advice
4. Teacher Live
5. Display Stage/Presentation sync
6. Observer Live / rich analytics
7. Diagnostics/background export
