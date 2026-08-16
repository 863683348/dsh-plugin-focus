# Changelog

## [1.0.0] — 2026-08-16

Initial release.

- `focus` tool: `set` / `get` / `append` / `clear` with a durable board file (`.dsh/focus.md`) in the session workspace.
- Automatic context injection: the board is re-injected at every turn start and whenever it changes (`agent/pre-step` snapshot, mirroring `dsh-time-context`).
- `clear` archives the old board to `.dsh/focus.md.bak`.
- `focusBoard` session projection for UIs (`useProjection('focusBoard')`).
- Read-only web panel (experimental, loader-format client bundle).
- `focus:instructions` prompt section.
- 10 unit tests; containment enforcement against the session workspace.
