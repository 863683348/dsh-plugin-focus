# dsh-plugin-focus — Focus Board for DeepSeek Harness agents

A real, installable **DSH plugin** (DeepSeek Harness / Cordis profile bundle) that gives the agent a `focus` tool and a durable **focus board** — a small note file (default `.dsh/focus.md`) in the session workspace that pins **the objective, hard constraints, and decisions** across context compaction and across sessions on the same workspace. The todo list tracks *what to do next*; the focus board tracks *why we are doing it and what must not drift*.

## Features

| Feature | Status |
| --- | --- |
| `focus` tool — `set` / `get` / `append` / `clear` | ✅ stable |
| Prompt guidance section (`focus:instructions`) | ✅ stable |
| **Automatic injection** — board is re-injected into model context at every turn start and whenever it changes | ✅ stable |
| **Archive on clear** — `clear` moves the old board to `.dsh/focus.md.bak` (accumulates) | ✅ stable |
| `focusBoard` session projection for UIs | ✅ stable |
| **Read-only web panel** (composer dock) | 🧪 experimental (loader-format client bundle, not verified against a running web instance) |

## How it works

- The board is a plain, append-friendly text file. Entries are timestamped and ordered; `get` renders newest-first with a configurable character cap (the file is never trimmed by rendering).
- The plugin is a single Cordis plugin: the host face (`lib/index.js`) registers the tool, the projection, and the auto-injection; the browser face (`lib/client.js`) renders the panel. The same composition row covers both faces via the package's `dsh.bundle` + `dsh.client` manifest sections.
- All file access goes through the host `ctx.fs` service, and every resolved path is containment-checked against the agent's session workspace — the board can never escape it.
- Auto-injection mirrors the in-box `dsh-time-context` mechanism: an `agent/pre-step` waterfall listener appends a plugin snapshot message carrying the board text (step 1 of every turn, plus mid-turn whenever the text changes). Resumed sessions get the board back on their first step.

## Install

The package declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, so it goes through DSH's official plugin management:

```bash
# from a local checkout (equivalent to pnpm add <path> + auto-reconcile of the bundles list)
dsh plugin --profile <profile> add /path/to/dsh-plugin-focus

# or after publishing to npm
dsh plugin --profile <profile> add dsh-plugin-focus
```

Restart DSH. The `focus` tool is registered host-wide; the read-only panel appears in the web UI on a web profile.

### Alternative: mount on one agent preset only

1. Copy a built-in preset to `$DSH_HOME/.agent-presets/<id>/` (never edit the deployment's own preset — an upgrade overwrites it).
2. Append to `agent.cordis.yml`:

```yaml
- id: focus
  name: 'dsh-plugin-focus'
  config:
    file: '.dsh/focus.md'
```

3. Make sure `dsh-plugin-focus` resolves (installed in the profile's `node_modules` or the module fallback directory).

## Usage (model side)

| action | args | behavior |
| --- | --- | --- |
| `set` | `note` (required) | append an entry pinning the current focus / constraints |
| `append` | `note` (required) | append a log entry (decision, discovery, reversal) |
| `get` | — | read the whole board (newest first, capped, omitted-count footer) |
| `clear` | — | empty the board; the old board is archived to the archive file |

The plugin also injects a `focus:instructions` prompt section (disable with `personaSection: false`) and re-injects the board into context automatically (disable with `autoInject: false`).

## Configuration

All optional, on the composition row's `config`:

| key | default | meaning |
| --- | --- | --- |
| `file` | `.dsh/focus.md` | board path, relative to the session workspace; **cannot escape it** (runtime-enforced) |
| `archiveFile` | `.dsh/focus.md.bak` | archive path for `clear` |
| `archive` | `true` | whether `clear` archives first |
| `maxEntries` | `60` | max entries kept on disk (oldest dropped) |
| `maxChars` | `8000` | render cap for `get` / auto-injection (view truncation only) |
| `autoInject` | `true` | inject the board into model context at turn start / on change |
| `personaSection` | `true` | register the prompt-guidance section |
| `sectionOrder` | `5` | prompt section order (persona is 0, ascending) |

## File format

```text
# Focus Board

<!-- dsh-plugin-focus v1 -->

## [2026-08-14T23:12:00.000Z] set
<note, may span lines>

## [2026-08-14T23:13:00.000Z] append
<another note>
```

Clearing appends an archive block (stamped with the clear time) to the archive file, so history accumulates.

## Design

- **Pure logic separated from the runtime**: `lib/board.js` has zero DSH/Cordis imports (parse / render / mutate / archive) and is unit-tested in isolation; `lib/index.js` is the Cordis plugin.
- **Safety**: every path resolves through `ctx.fs` and is containment-checked with `ctx.fs.contains` against the session workspace.
- **Lifecycle**: tool registration, projection, injection listener, and prompt section are all Cordis-scope-managed; stopping/removing the plugin cleans them up.
- **Two faces, one row**: the host loader imports `.`, the browser loader imports `./client` (via the `dsh.client` manifest). The `focusBoard` session projection (event `focus/write`) is the data seam any future UI can read with `useProjection('focusBoard')`.

## Tests

```bash
node --test test/
```

## Uninstall

```bash
dsh plugin --profile <profile> remove dsh-plugin-focus
```

## Roadmap

- Verify the web panel against a live web instance and iterate on the slot UI.
- Expose board mutations from the panel (edit / clear buttons).
- Optional: attach the board to `turn/start` events for explicit snapshot semantics.

## License

MIT

## FAQ

- **The board is empty in a fresh session — where did it go?** The board is per-workspace, not per-session: `focus set` in a session whose workspace already has a `.dsh/focus.md` reads the existing entries. Each agent session resolves the board from its own `session.header.cwd`.
- **Does the injection cost tokens?** The board is injected once per turn start (plus mid-turn only when the text changes), capped at `maxChars`. An empty board injects nothing.
- **Can the board escape my workspace?** No. Every path is resolved through `ctx.fs` and containment-checked against the session workspace; a configured path outside it fails loud.
- **The web panel is marked experimental — why?** The client bundle is hand-written in the loader format without a bundler and has not been verified against a running web instance yet.
- **How do I publish this to npm?** `npm publish` (a `prepublishOnly` test run is wired in). Then `dsh plugin add dsh-plugin-focus` installs it without a build step.

