# Security

## Trust model

`dsh-plugin-focus` runs as a host-side Cordis plugin in the DeepSeek Harness
process, with the same trust level as any installed bundle. Installing it runs
third-party code on your machine — review the source first.

## What the plugin can and cannot do

- **Filesystem**: all file access goes through the host `ctx.fs` service
  (the policy-aware backend). Every resolved path is containment-checked
  against the calling agent's session workspace — the board file and archive
  file can never escape it.
- **Network**: none. The plugin makes no network requests.
- **Secrets**: none. The plugin never reads credentials, environment secrets,
  or files outside the session workspace.
- **Model context**: the automatic injection adds the board text as a
  plugin-sourced snapshot message; it contains only what the agent itself
  wrote to the board.

## Reporting a vulnerability

Open an issue in this repository. There is no private disclosure channel yet.
