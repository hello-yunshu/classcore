> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Intelligence Provider Data Boundary v0.1.2

Rule/LLM/Hybrid providers share one Intelligence Contract, but providers do not automatically receive all classroom data.

- Local Rule providers may use Server-side identifiers as needed for deterministic tracking.
- External LLM providers receive the minimum necessary learning context and session-scoped/pseudonymous subject identifiers by default, not student names/roster data.
- Provider credentials never enter Student/Observer clients, Events, Advice text, or diagnostic logs.
- Provider output is untrusted until schema/policy validation succeeds.
- External provider timeout/failure falls back to deterministic classroom-safe behavior; no Activity waits on LLM availability.
- Provider provenance is stored so future research can distinguish Rule, LLM and Hybrid outputs.

This boundary permits future AI upgrades without changing the Student/Teacher/Observer/Display projection contracts or making personal identity part of the model prompt contract.
