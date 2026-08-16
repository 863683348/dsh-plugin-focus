# dsh-plugin-focus — DeepSeek Harness Agent 专注板

一个真实可安装的 **DSH 插件**（DeepSeek Harness / Cordis profile bundle）：给 agent 一个 `focus` 工具和一块**持久化专注板**（默认 `.dsh/focus.md`，位于会话工作区），钉住**目标、硬约束、已做的决定**——跨上下文压缩、跨同工作区的新会话都能存活。todo 列表管"下一步做什么"；专注板管"为什么做、不能违背什么"。

## 功能

| 功能 | 状态 |
| --- | --- |
| `focus` 工具 —— `set` / `get` / `append` / `clear` | ✅ 稳定 |
| 提示词指引段落（`focus:instructions`） | ✅ 稳定 |
| **自动注入** —— 每轮开始及板子变化时自动把专注板放回模型上下文 | ✅ 稳定 |
| **clear 归档** —— 清空时旧板子归档到 `.dsh/focus.md.bak`（可累积） | ✅ 稳定 |
| `focusBoard` 会话投影（供 UI 读取） | ✅ 稳定 |
| **只读 Web 面板**（输入框上方 dock） | 🧪 实验性（手写 loader 格式 client bundle，未在运行中的 web 实例上验证） |

## 工作原理

- 板子是纯文本、追加友好的文件；条目带时间戳按序排列；`get` 最新在前、按字符上限截断（渲染永不删文件）。
- 单个 Cordis 插件、两面一体：宿主面（`lib/index.js`）注册工具/投影/自动注入，浏览器面（`lib/client.js`）渲染面板；同一组合行通过包的 `dsh.bundle` + `dsh.client` manifest 同时覆盖两面。
- 所有文件访问走宿主 `ctx.fs` 服务，且每个解析出的路径都做会话工作区 containment 校验——板子永远逃不出工作区。
- 自动注入复刻内置 `dsh-time-context` 机制：`agent/pre-step` waterfall 监听器追加一条携带板子文本的 plugin snapshot 消息（每轮 step 1，以及中途板子文本变化时）。会话恢复后第一步就会把板子带回来。

## 安装

包声明了 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，走 DSH 官方插件管理：

```bash
# 从本地目录安装（等价于 pnpm add <路径> + 自动 reconcile bundles 列表）
dsh plugin --profile <profile名> add /path/to/dsh-plugin-focus

# 或发布到 npm 后
dsh plugin --profile <profile名> add dsh-plugin-focus
```

重启 DSH。`focus` 工具宿主级注册；web profile 的界面上会出现只读面板。

### 备选：只挂到某个 agent preset

1. 复制内置 preset 到 `$DSH_HOME/.agent-presets/<id>/`（不要改部署自带的 preset——升级会被覆盖）。
2. 在 `agent.cordis.yml` 追加：

```yaml
- id: focus
  name: 'dsh-plugin-focus'
  config:
    file: '.dsh/focus.md'
```

3. 确保 `dsh-plugin-focus` 可解析（装在 profile 的 `node_modules` 或模块回退目录）。

## 模型侧用法

| action | 参数 | 行为 |
| --- | --- | --- |
| `set` | `note`（必填） | 追加一条"当前焦点/约束" |
| `append` | `note`（必填） | 追加日志条目（决定、发现、反转） |
| `get` | — | 读整块板（最新在前，截断并注明省略数） |
| `clear` | — | 清空板子；旧板子归档到归档文件 |

插件还会注入 `focus:instructions` 提示词段落（可用 `personaSection: false` 关闭），并自动把板子放回上下文（可用 `autoInject: false` 关闭）。

## 配置

组合行 `config` 全部可选：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `file` | `.dsh/focus.md` | 板文件路径，相对会话工作区；**禁止逃逸工作区**（运行时强制） |
| `archiveFile` | `.dsh/focus.md.bak` | `clear` 的归档路径 |
| `archive` | `true` | `clear` 是否先归档 |
| `maxEntries` | `60` | 磁盘最多保留条目数（最旧丢弃） |
| `maxChars` | `8000` | `get` / 自动注入的渲染上限（仅视图截断） |
| `autoInject` | `true` | 每轮开始/板子变化时自动注入上下文 |
| `personaSection` | `true` | 注册提示词指引段落 |
| `sectionOrder` | `5` | 提示词段落顺序（persona 为 0，升序） |

## 文件格式

```text
# Focus Board

<!-- dsh-plugin-focus v1 -->

## [2026-08-14T23:12:00.000Z] set
<note，可多行>

## [2026-08-14T23:13:00.000Z] append
<另一条>
```

清空时向归档文件追加一段带清空时间的归档块，历史得以累积。

## 设计

- **纯逻辑与运行时分离**：`lib/board.js` 零 DSH/Cordis 依赖（解析/渲染/变更/归档），可独立单测；`lib/index.js` 才是 Cordis 插件。
- **安全**：路径经 `ctx.fs` 解析，并用 `ctx.fs.contains` 对会话工作区做 containment 校验。
- **生命周期**：工具、投影、注入监听、提示词段落全部由 Cordis scope 管理，插件停止/移除自动清理。
- **两面一行**：宿主加载 `.`，浏览器加载 `./client`（经 `dsh.client` manifest）；`focusBoard` 会话投影（事件 `focus/write`）是未来任何 UI 的数据接缝，可用 `useProjection('focusBoard')` 读取。

## 测试

```bash
node --test test/
```

## 卸载

```bash
dsh plugin --profile <profile名> remove dsh-plugin-focus
```

## Roadmap

- 在运行中的 web 实例上验证面板并迭代 slot UI。
- 面板直接提供编辑/清空操作。
- 可选：把板子挂到 `turn/start` 事件上获得显式快照语义。

## License

MIT
