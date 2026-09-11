> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Extension & Collaboration Boundary v0.1.2

Applet `StateScopeRef` supports participant/pair/group/session, but that does NOT imply a mandatory CRDT or one collaboration algorithm.

Applet collaboration may later choose:
- independent per-participant state;
- Server-authoritative shared commands/state;
- an Applet-specific collaboration engine/CRDT behind the Applet Host;
- an External Tool Gateway.

The Core contract only requires serializable state, semantic commands/events, permission checks, and recoverability. It deliberately does not freeze a collaborative editing technology.

Trusted first-party Applets run in-process/within the trusted Web application. Untrusted third-party code remains outside this trust boundary and uses a sandboxed/external gateway.
