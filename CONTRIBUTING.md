# Contributing

Thanks for helping! This project is small and simple on purpose.

## Development

```bash
node --test test/          # unit tests (pure logic, no DSH runtime needed)
node scripts/demo.mjs      # runnable demo of the board lifecycle
```

## Structure

- `lib/board.js` — pure logic: parse / serialize / render / mutate / archive. Zero DSH or Cordis imports; everything here is unit-tested in isolation.
- `lib/index.js` — the Cordis plugin (host face): `focus` tool, `agent/pre-step` auto-injection, `focusBoard` session projection, prompt section.
- `lib/client.js` — browser face: read-only panel in the composer dock (experimental).
- `cordis.patch.yml` — the bundle patch layer that inserts the composition row.
- `package.json` — declares `dsh.bundle` (installable via `dsh plugin add`) and `dsh.client`.

## Code style

- Plain JavaScript (ESM), no TypeScript, no bundler.
- Double-quoted strings; string concatenation over template literals (keeps the emitted bundles simple).
- `lib/board.js` must stay dependency-free.
- New behavior needs a unit test in `test/board.test.mjs`.

## Releasing

Bump `version` in `package.json`, update `CHANGELOG.md`, tag and push.
