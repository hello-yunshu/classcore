> 中文说明：本文件为历史/专项技术参考，保留英文细节；当前权威开发说明以 `docs/README.md` 与中文主计划为准。

# Engineering Evidence for the Roadmap

This file records external engineering facts that materially affect the development plan. It does not turn external technologies into Foundation contracts.

## Playwright — multi-user browser simulation

Official documentation describes BrowserContexts as isolated, incognito-like browser sessions with independent cookies/local storage, and explicitly demonstrates multiple contexts in one scenario. This supports using many isolated Student/Teacher/Observer sessions for repeatable classroom tests without requiring one physical device per user.

- https://playwright.dev/docs/browser-contexts
- https://playwright.dev/docs/test-parallel

Architecture implication:
- browser-level multi-user tests are a primary repeatable gate;
- protocol-level virtual clients are still preferred for larger load tests so browser rendering does not dominate the measurement.

## Browser WebSocket — application-level backpressure is required

MDN documents that the standard browser `WebSocket` interface has no built-in backpressure. If messages arrive faster than the application processes them, buffering can cause memory/CPU problems.

- https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API

Architecture implication:
- use widely compatible standard WebSocket for the Student baseline;
- implement bounded queues/coalescing/QoS in the application;
- Durable Event and Live State must have different delivery policies;
- slow Observer connections are shed/throttled before Student durable traffic.

## SQLite WAL — appropriate for a single-host classroom Server

SQLite documentation states that WAL permits readers and a writer to proceed concurrently and that all processes using the database must be on the same host; WAL is not designed for a network filesystem.

- https://www.sqlite.org/wal.html

Architecture implication:
- Teacher Mac local SQLite remains a reasonable default;
- evaluate/use WAL mode in Server implementation;
- keep database and WAL together on the Teacher Mac;
- explicitly test busy/checkpoint/restart paths rather than assuming unlimited write concurrency.

## Evidence boundary

These sources support implementation choices and test strategy. They do not prove XP21A performance, school AP capacity or final classroom usability. Those claims must remain explicitly unverified unless tested in the actual environment.

## web-ppt — current Presentation engine

The project exposes separate core/edit-core/editor/viewer-core packages, performs browser-side ppt/pptx parsing/rendering, and is MIT licensed. Its editor is currently documented on a beta/`next` line.

- https://github.com/unStone/web-ppt

Architecture implication:
- web-ppt is the only Presentation editor/playback engine continued in the current roadmap;
- its headless viewer state and package boundaries fit synchronized playback;
- the next phase exposes its existing text, image, table, transform, style and navigation seams through a deliberate Studio layout;
- Adapter boundaries remain to prevent third-party document types from entering Foundation.
