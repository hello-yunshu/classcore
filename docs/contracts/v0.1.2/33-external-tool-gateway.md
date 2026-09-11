> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# External Tool Gateway Boundary v0.1.2

Trusted Applets are bundled, reviewed code running under Applet Host contracts.

Future third-party or remotely hosted tools use a separate `External Tool Gateway` boundary. That gateway is responsible for:
- secure launch/authentication;
- scoped identity/role sharing;
- capability/service negotiation;
- sandbox/origin isolation;
- translating tool events/results into internal Artifacts/Events/Results.

Do not make arbitrary external JavaScript a trusted in-process Applet. LTI-style integrations, sandboxed iframes and other external protocols can be adapters behind this boundary without changing the internal Lesson/Activity model.
