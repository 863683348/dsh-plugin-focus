# Release checklist

Reusable template for shipping a new version of a dsh plugin across all three
channels: **npm** (installable), **GitHub topic** (discoverable), and the
**awesome list** (curated). For new plugins, copy this file and follow it.

## 0. Before you start

- [ ] `package.json` declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` and `cordis.patch.yml` exists next to it — this is what makes `dsh plugin add` work. (`dsh.client` alone is NOT installable.)
- [ ] Official `@deepseek-ai/*` packages are `peerDependencies`, not `dependencies`.
- [ ] LICENSE file present; `publishConfig.access` = `public` (unscoped packages are public by default anyway).
- [ ] `npm pack --dry-run` shows exactly the files you want to ship.

## 1. Publish to npm

**One-time setup** (per npm account, not per project):

- Create a **granular access token**: npmjs.com → Access Tokens → Generate New Token → Granular.
  - Package: **All packages** (⚠️ "Only select packages" cannot select a not-yet-existing package name — new projects must use All packages).
  - Access: **Read and write**.
  - ✅ **Bypass 2FA for publishing** — without it `npm publish` fails 403 even with a valid token.

**Per release** (with the helper script, or manually):

```powershell
# via env var
$env:NPM_TOKEN = "npm_..."   # or drop it in npm-token.txt (gitignored)
pwsh -File scripts/publish-npm.ps1

# manual equivalent
npm publish   # runs prepublishOnly tests first
```

**If this repo has the tag-driven GitHub Action** (`.github/workflows/publish.yml`),
you never touch npm locally: just push a version tag:

```bash
npm version patch -m "chore: release v%s"   # bumps version + commits
git push --tags                            # CI runs tests + npm publish
```

Requires the `NPM_TOKEN` secret in the repo: Settings → Secrets and variables → Actions.

## 2. Make it discoverable (GitHub topic)

- [ ] Repo Settings → Topics → add `dsh-plugin` (required by every market/storefront that indexes the topic).
- [ ] Optional extra topics: `deepseek-harness`, `cordis`, plus a functional tag.

## 3. Submit to the awesome list (optional but recommended)

awesome-dsh-plugin (https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) is the
curated directory. CI requirements:

- [ ] `dsh.bundle` manifest (checked automatically)
- [ ] Repo at least **1 day old** and **≥ 10 commits** (CI fails otherwise; resubmission is not penalized)
- [ ] `dsh-plugin` topic present

PR format — **do not edit the READMEs by hand**, the list is generated:

```yaml
# data/plugins/<owner>__<repo>.yml
url: https://github.com/owner/repo
name: owner/repo
category: memory          # ui | theme | model | session | memory | tools | skill | workflow | notify | dev | market | fun
description:
  en: 'One line, no marketing, quote if it contains ": ".'
  zh: 一句话描述，以句号结尾。
```

Then regenerate the READMEs and commit both:

```bash
npm ci && node scripts/generate-readme.mjs   # in the awesome repo checkout
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| 403 "Two-factor authentication ... required" | classic token + 2FA | granular token with **Bypass 2FA for publishing** |
| 403 "may not perform that action" | granular token scoped to "Only select packages" and the package doesn't exist yet | token with **All packages** |
| 403 on a NEW package version | token lacks write access to that package | same as above / scope the token to the package |
| EPERM on npm cache paths | DSH file sandbox blocks `AppData\npm-cache` | add `--cache <workspace>/.npm-cache` |
| CI age check fails on the awesome PR | repo younger than 1 day | push any update to the PR branch after 24 h to re-run CI |
