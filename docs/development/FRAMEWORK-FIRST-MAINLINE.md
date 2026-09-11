# Framework-First Mainline

Status: `implemented` for the generic in-process runtime slice; `integration-tested` by `tests/framework-runtime.test.mjs`; browser, Docker and LAN gates remain `NOT_EVALUATED`.

This mainline keeps the classroom spine independent from any lesson package:

```text
credential -> JoinGrant -> authenticated connection -> Presence
Applet -> validated event -> durable event -> Snapshot
Snapshot/intent -> Artifact -> Submission -> Transfer
Applet -> LiveState -> quality subscription -> Teacher/Observer projection
Artifact/Live/Analytics -> Stage -> Widget -> public or teacher projection
```

The generic implementation lives in the existing `runtime`, `storage`, `realtime`, `applet-sdk`, `projections` and `intelligence` packages. A future lesson should provide activity definitions, an applet plugin, config and optional providers; it must not need to add lesson vocabulary to the framework packages.

Evidence is intentionally separated: model/unit evidence does not imply authenticated product, browser, load, Docker or LAN readiness. D7 readiness remains fail-closed.
