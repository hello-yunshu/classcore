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

## PPTist — immediate PowerPoint-like web authoring candidate

The upstream project is an online presentation editor/player designed to reproduce common PowerPoint authoring workflows, and its repository documents custom element extension. Current upstream is AGPL-3.0, so it must stay behind an Adapter boundary and future closed-source/commercial use requires an explicit license decision.

- https://github.com/pipipi-pikachu/PPTist
- https://github.com/pipipi-pikachu/PPTist/blob/master/doc/CustomElement.md

Architecture implication:
- strong D1 candidate for fast blank-deck authoring;
- do not encode PPTist element structures into Foundation contracts;
- represent classroom dynamic data through Presentation bindings/custom elements;
- Student bundles never import the editor.

## web-ppt — modular MIT alternative

The project exposes separate core/edit-core/editor/viewer-core packages, performs browser-side ppt/pptx parsing/rendering, and is MIT licensed. Its editor is currently documented on a beta/`next` line.

- https://github.com/unStone/web-ppt

Architecture implication:
- strong alternative/future engine because its headless viewer state and package boundaries fit synchronized playback;
- D1 must prove blank-deck authoring and the exact D2 workflow before using it as the immediate Studio foundation;
- Adapter design must permit a future engine swap without Foundation changes.
