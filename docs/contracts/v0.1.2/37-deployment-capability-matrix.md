> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Deployment Capability Matrix v0.1.2

`lan-http` is the compatibility baseline for the current classroom. It is suitable only on a trusted/isolated classroom LAN and does not provide transport confidentiality.

| Capability class | lan-http | lan-https / remote-https | native-app |
|---|---|---|---|
| Core Lesson/Activity/Applet/Event | required | required | required |
| WebSocket / IndexedDB / Pointer interaction | expected | expected | adapter equivalent |
| Service Worker / installable PWA | not required; often unavailable by private-IP HTTP | available where browser supports | n/a/host-specific |
| Camera / microphone and other secure-context browser APIs | do not assume | available subject to permission | native adapter |
| Sensitive external AI / cloud services | avoid direct client access | Server/provider gateway | Server/provider gateway |

A future oral-language, camera, sensor, or similar Applet declares the needed platform capabilities. The Session preflight must reject/degrade rather than letting the Applet fail mid-class.
