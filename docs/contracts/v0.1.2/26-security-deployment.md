> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Security & Deployment Profile v0.1.2

## Core invariant
Core classroom operation MUST work in `lan-http` mode because student devices may open a Mac-hosted site at a private IP such as `http://192.168.x.x`. Core reliability MUST NOT depend on secure-context-only browser APIs.

Deployment profiles:
- `lan-http`: current classroom baseline; short-lived session credentials; no assumption of Service Worker, Web Crypto, camera/mic, or other secure-context APIs.
- `lan-https`: preferred LAN hardening when certificate deployment is practical.
- `remote-https`: Internet/cloud deployment; HTTPS/WSS required.
- `native-app`: desktop/mobile host; platform adapters may expose native capabilities.

## Browser security
- Validate every wire payload against the contract at trust boundaries.
- Never trust role/session/participant fields supplied by a client when they can be derived from authenticated connection context.
- Avoid `eval`, dynamic code execution, and unsanitized HTML sinks.
- Use CSP and sanitization as defense-in-depth where browser compatibility allows.
- Session access tokens are opaque, scoped, short-lived, and MUST NOT be written to Event/Advice/diagnostic logs.

## Applet trust boundary
v1 trusted Applets are bundled/reviewed first-party code and communicate only through Applet Host.
Arbitrary third-party JavaScript MUST NOT be loaded in-process as a trusted Applet.
Future untrusted/remote tools belong behind a sandboxed/external Tool Gateway (e.g. isolated iframe/origin or LTI-style launch), not inside the trusted Applet runtime.
