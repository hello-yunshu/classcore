> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Platform Abstraction Contract v0.1.2

Business/Applet code does not directly depend on browser implementation details. Platform services include storage, fullscreen, network and device/capability information; file picker/clipboard/camera/microphone/keepAwake remain optional extensions.

**Realtime Transport is not an Applet/business public Platform API.** It is a Runtime-internal adapter so Applets cannot bypass Command/Event/Authorization contracts.

Core must operate under `lan-http` without secure-context-only APIs. Client capability negotiation determines optional features such as Service Worker, OffscreenCanvas, camera/mic, or native host APIs.

Future Web/Capacitor/Tauri/Electron/native hosts implement the same platform contracts while preserving the classroom domain contracts.
