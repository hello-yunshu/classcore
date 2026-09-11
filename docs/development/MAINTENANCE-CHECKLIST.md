# 可维护性检查清单

每增加一节公开课或一个Applet，至少检查：
- [ ] 没有修改 Foundation contracts，除非有明确架构理由；
- [ ] Applet有manifest和config/state/event/command schema；
- [ ] 有最小example/fixture；
- [ ] Student bundle没有引入Teacher/Observer/Presentation重依赖；
- [ ] 公共学生数据经过Projection；
- [ ] Durable Event是语义事件，不记录无意义逐像素轨迹；
- [ ] 新规则属于Analytics/Intelligence Profile而不是Runtime；
- [ ] 新课件使用Presentation Adapter，不依赖具体引擎内部API扩散；
- [ ] `npm run check`通过；
- [ ] 至少增加一个回归测试证明新能力不破坏旧课。
