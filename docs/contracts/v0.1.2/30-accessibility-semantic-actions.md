> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Semantic Action & Accessibility Principle v0.1.2

Complex Applets should expose semantic commands/events rather than making meaning depend only on pointer coordinates.
Examples: `transform.rotate`, `transform.move`, `instruction.block.added`.

Benefits:
- alternative keyboard/switch/accessibility controls can call the same semantic action;
- replay and automated tests use the same contract;
- Rule/LLM analysis consumes mathematical/learning meaning instead of raw UI gestures;
- future native App hosts can map different input devices to the same Applet behavior.

Applet Manifest therefore declares `handledCommandTypes` and `emittedEventTypes`.
For interactions where dragging is not pedagogically essential, a future UI SHOULD provide an alternative non-drag control. When dragging itself is the learning object, document it as essential and still preserve semantic state/events.
