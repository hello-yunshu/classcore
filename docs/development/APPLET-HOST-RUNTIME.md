# Generic Applet Host Runtime

Status: `implemented` and `integration-tested` with the synthetic `generic-counter` fixture.

`AppletRegistry` rejects duplicate types and manifest mismatches. `AppletHostRuntime` resolves the manifest, checks required platform capabilities, initializes the plugin, loads config, restores a compatible Snapshot, resumes, pauses with a state capture, and destroys deterministically.

Applet code receives only `AppletExecutionContext` and `AppletHost`. Transport, access tokens, SQLite, server sequence allocation and identity resolution remain host/server responsibilities.
