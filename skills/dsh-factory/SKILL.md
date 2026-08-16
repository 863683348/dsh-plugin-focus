---
name: dsh-factory
description: 一条龙制造并发布 DeepSeek Harness (DSH) 插件：写插件代码（dsh.bundle + cordis.patch.yml + Cordis 插件）、本地验证（语法/单测/组合 dump）、发布 npm、打 GitHub dsh-plugin topic、提交 awesome-dsh-plugin 精选列表 PR。当用户要求"做一个 dsh 插件"、"dsh制造"、"造个插件"、"把插件发布到插件市场/上架"时使用本技能。
---

# dsh制造 (dsh-factory)

DSH 插件一条龙流水线：**写代码 → 验证 → npm publish → 打 topic → 提 awesome PR**。

## 0. 凭据（一次性配置，之后永远不要向用户要 token）

- npm token（granular，All packages + Read and write + **Bypass 2FA**）：`$DSH_HOME/secrets/npm-token.txt`
- GitHub token（classic `repo` 或 fine-grained）：`$DSH_HOME/secrets/github-token.txt`
- 规则：
  - 直接**从上述文件读取**（`$DSH_HOME` 通常为 `~/.dsh`），用完不落盘、不回显、不写入任何配置。
  - **绝不让用户在对话里粘贴 token**；文件不存在时给出放置路径让用户自己放好（首次一次性）。
  - npm 403 系列错误见文末踩坑表——几乎都是 token 类型/作用域问题，不是重试能解决的。

## 1. 写代码（插件骨架）

从模板复制：本技能目录 `templates/plugin-skeleton/`（或参考已发布的 [dsh-plugin-focus](https://github.com/863683348/dsh-plugin-focus)）。

一个可安装的 DSH 插件 = 三件套：

| 文件 | 内容 |
| --- | --- |
| `package.json` | **必须** `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`；官方 `@deepseek-ai/*` 一律 `peerDependencies`；`publishConfig.access: public` |
| `cordis.patch.yml` | 组合补丁：`- insert: [{ id: <插件id>, name: '<包名>', config: {...} }]` |
| `lib/index.js` | Cordis 插件：导出 `{ name, inject, Config, apply }`，在 `apply(ctx, config)` 里用 `ctx.tools.register(defineTool({...}))` 注册模型工具、`ctx.systemPrompt.section(...)` 注入提示词、`ctx.effect(...)` 管理生命周期 |

关键约束（照抄 dsh-plugin-focus 已验证的做法）：

- 工具 schema 用 JSON Schema（`parameters`/`output.schema`），`execute(args, exec)` 返回规范值；`exec.agent.session.header.cwd` 是会话工作区。
- 文件读写走宿主 `ctx.fs`（`resolve/stat/readText/writeText/contains`），并用 `ctx.fs.contains` 做工作区 containment 校验。
- 模型工具命名避免与内置冲突（read/write/edit/glob/grep/pwsh/todo_write/...）。
- 带前端 UI 时再加 `dsh.client` manifest + `./client` 入口（参考 dsh-plugin-focus/lib/client.js，标注 experimental 直至在运行实例验证）。

## 2. 验证（发布前必须全绿）

在沙箱里注意：`node --test` 会 spawn 子进程被 EPERM 拦截，改用**主模块方式**跑：

```powershell
$node = "$env:DSH_NODE_DIR\node.exe"   # 或直接 node
node --check lib\index.js && node --check lib\board.js
node test\xxx.test.mjs                 # node:test 主模块方式（不要用 node --test）
```

- 纯逻辑模块（无 DSH/Cordis import）单独放 `lib/*.js` 并写单测。
- 端到端组合验证：`node <dsh安装>/lib/bin.js --profile <临时profile> --dump-config`，确认插件行进入组合树；或在真实 profile 里 `dsh plugin add <路径>` 后 dump。`$DSH_HOME` 外的写入需要权限升级（用户批准）。
- 真实依赖冒烟（可选但推荐）：在插件目录建 `node_modules/@deepseek-ai` junction 指向 DSH 安装里的真实包，`import` 插件验证导出形状（name/inject/Config/apply）。

## 3. 发布 npm

用模板脚本 `templates/publish-npm.ps1`（复制到项目 `scripts/publish-npm.ps1` 并提交）：

```powershell
pwsh -File scripts/publish-npm.ps1     # 自动从 secrets 读 token
```

要点：

- 认证：临时 `.npmrc`（gitignored）写入 `//registry.npmjs.org/:_authToken=<token>`，发布完删除；npm cache 用 `--cache <项目>/.npm-cache` 避免沙箱 EPERM。
- `--ignore-scripts`（沙箱拦 npm 子进程；测试已在第 2 步手动验证通过）。
- 发布前 `npm pack --dry-run` 核对内容物。
- 包名先查占用：`GET https://registry.npmjs.org/<name>` → 404 才可用；被占用就换名或加 scope。

## 4. 打 GitHub topic

`dsh-plugin` topic 是市场索引的必需标签（还有 `deepseek-harness`、`cordis` 等可选）：

```bash
# 有 gh：gh repo edit <owner>/<repo> --add-topic dsh-plugin
# 无 gh：用 github-token.txt + REST API（PATCH /repos/{owner}/{repo} 的 topics 字段，或 PUT /repos/{owner}/{repo}/topics）
```

仓库若无 remote：`git init -b main` + commit + 用 token 建仓（POST /user/repos）并推送（git 的 schannel 若失败用 `-c http.sslBackend=openssl` + 一次性 `https://x-access-token:<token>@github.com/...` URL，推完把 remote 改回干净 URL）。

## 5. 提 awesome-dsh-plugin PR

规则（CI 自动检查）：

- 必须声明 `dsh.bundle`（自动检查）
- 仓库 ≥ **1 天** 且 ≥ **10 commits**（不足则先补足/等待，规则允许达标后重新提交，无惩罚）
- 已打 `dsh-plugin` topic

流程：

1. fork `awesome-dsh-plugin/awesome-dsh-plugin`（POST /forks，token）。
2. 浅克隆 fork（`git clone --depth 1`，网络不稳时试 `-c http.sslBackend=openssl`）。
3. 添加 `data/plugins/<owner>__<repo>.yml`（模板：`templates/awesome-entry.yml`）；**不要手改 README**。
4. 生成 README：fork 仓库内 `npm ci`（无 npm 时用 junction 链接 js-yaml）后 `node scripts/generate-readme.mjs`；用 `--check` 确认同步。
5. 提交到分支 `add/<repo>`，推送 fork，POST /pulls 创建 PR（base: main, head: <owner>:add/<repo>）。
6. CI 的 age 检查若失败：**等满 24h 后在同一分支推空提交**（`git commit --allow-empty -m "ci: re-run"`）触发重跑，无需重开 PR。
7. 可选：`data/screenshots.json` 加 1-8 张 GitHub 托管截图；category 取值：`ui` `theme` `model` `session` `memory` `tools` `skill` `workflow` `notify` `dev` `market` `fun`。

## 踩坑速查

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| npm 403 "2FA required" | 经典 token + 2FA | granular token + **Bypass 2FA for publishing** |
| npm 403 "may not perform that action" | granular token 只选了 select packages 且包还不存在 | **All packages** token |
| npm EPERM 缓存路径 | 沙箱拦 `AppData\npm-cache` | `--cache <项目>/.npm-cache` |
| git schannel TLS 失败 | 网络环境/证书 | `-c http.sslBackend=openssl` |
| `node --test` EPERM | 沙箱拦子进程管道 | 主模块方式跑测试文件 |
| awesome CI age 失败 | 仓库 < 1 天 | 24h 后同分支推空提交重跑 |
| PowerShell 路径报错 | 路径含 `'`（如 l'x） | 单引号转 `''` 或避免单引号字符串 |

## 模板

- `templates/plugin-skeleton/` — 最小可发布插件骨架（package.json + cordis.patch.yml + lib/index.js）
- `templates/publish-npm.ps1` — 一键发布脚本（secrets 读 token）
- `templates/awesome-entry.yml` — awesome 条目模板
- `templates/RELEASE.md` — 发布清单（随项目提交一份）
