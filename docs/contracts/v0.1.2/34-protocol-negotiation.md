> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Protocol Handshake & Capability Negotiation v0.1.2

Normal classroom traffic MUST begin only after authenticated Session Membership and `ClientHello -> ServerHello` negotiation.

The handshake separates four questions:
1. **Protocol compatibility** — can both ends understand the wire envelope?
2. **Runtime compatibility** — can this client run the current Classroom Runtime API?
3. **Platform capability** — does the device actually provide IndexedDB, Pointer Events, WebSocket, workers, secure-context-only features, etc.?
4. **Session policy** — even if a device supports a feature, is that feature enabled for this Session?

An Applet mounts only when Host API and all required platform capabilities are satisfied. Optional capabilities may select faster implementations (for example OffscreenCanvas) but MUST NOT silently change learning semantics.

Compatibility failures are explicit (`version-mismatch` / `capability-missing`); clients do not enter a half-working Activity.
