# 课堂 LAN 真机演练 — R3.10

这一步是 **D7 人工硬 Gate**，不能被 CI、Docker build 或宿主机自身的 LAN-interface probe 替代。

## 自动 Gate 能证明什么

`npm run docker:gate` 会验证：

- 当前宿主对应 Docker 架构镜像可构建；
- 运行镜像使用非 root `node` 用户；
- Classroom 9602 与 Local Tools 9688 的容器运行路径可用；
- 9688 在宿主只绑定 `127.0.0.1`；
- SQLite volume 重启后幂等与 `serverSeq` 连续；
- 若宿主存在可用非 loopback IPv4，则尝试通过宿主 LAN 地址访问 Classroom 端口。

最后一项只叫 **host LAN-interface publication probe**。它仍然是“同一台 Mac 访问自己的 LAN 地址”，不能证明学校路由器、AP 隔离、XP21A 浏览器、真实 Wi-Fi 拥塞都正常。

## D7 真机步骤

1. 教师 Apple Silicon Mac 连接公开课当天实际使用的路由器/Wi-Fi，并关闭可能改变路由的临时代理/VPN。
2. 使用正式 Compose 或 RC 启动方式启动 Classroom Server，确认 `http://127.0.0.1:9688/healthz` 正常。
3. 在 Mac 上确认 `http://<Mac局域网IPv4>:9602/healthz` 正常；同时确认 `http://<Mac局域网IPv4>:9688/healthz` **不可访问**。
4. 至少使用 1 台学校 XP21A 打开 `http://<Mac局域网IPv4>:9602`，完成页面加载、加入课堂、一次交互、一次提交/事件发送、断网后恢复。
5. 若条件允许，扩展到 6～10 台 XP21A，同时再打开 Teacher/Display/Observer，确认学生操作优先级没有被 Observer 流量拖垮。
6. 记录：Mac IP、路由器/AP、XP21A 数量、浏览器版本/系统版本、开始时间、是否重连成功、是否出现明显卡顿、失败截图或日志。
7. 只有以上真机步骤通过，才可在 D7 记录中写“LAN rehearsal PASS”。

## 失败时优先排查

- AP/路由器是否启用了客户端隔离；
- Mac 防火墙是否阻止 9602；
- Mac 局域网 IP 是否变化；
- 9602 是否被其它进程占用；
- XP21A 是否与 Mac 处于同一子网；
- 代理/VPN 是否改写了路由；
- 浏览器是否缓存了旧页面或 Service Worker（若后续引入）。

不要为了绕过网络问题把 9688 暴露到 LAN，也不要把 Local Tools 合并回 Classroom 端口。
