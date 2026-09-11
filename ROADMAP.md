# dsh-plugin-focus 路线图（Roadmap）

> 基线：**v1.0.1**（已发布 npm / 已挂 vertical-toolkits profile）
> 范围：接下来 5 个版本 **v1.1.0 → v1.5.0**
> 规划原则：看板文件保持纯文本可读可 diff；所有读写走 `ctx.fs` + 工作区 containment；自动注入机制不回归。

## 版本总览

| 版本 | 主题 | 关键交付 |
|---|---|---|
| v1.1.0 | 结构化条目 | 条目类型/状态标签（objective/constraint/decision/done）+ `summary` 汇总视图 |
| v1.2.0 | 多板 | 命名看板（项目/子任务）+ 板间切换与列举 |
| v1.3.0 | 历史与撤销 | 写入历史归档 + `undo` 回滚上一版 |
| v1.4.0 | 跨工作区聚合 | 聚合视图（多工作区板汇总） |
| v1.5.0 | 与待办集成 | 与 todo/plan 互通（导入/导出任务清单） |

## v1.1.0 ✅ 已完成 — 结构化条目

### 新增能力
- **条目标签**：`append` / `set` 支持 `kind`（objective | constraint | decision | note）与 `status`（open | done），写入为 `- [ ] (decision) 文本` 形式，保持纯文本可读。
- **`summary` 动作**：按 kind/status 分组汇总（数量、完成率、最近变更），输出紧凑 Markdown；自动注入时优先注入 constraint 与 open 条目。

### 实现位置
- `lib/board.js`：新增条目解析（标签/勾选）、统计与渲染纯函数（向后兼容旧格式）
- `lib/index.js`：`focus` 增加 `summary` 动作与 `kind` / `status` 参数

### 验收标准
- [ ] `node --check` 通过；新增单测 ≥ 8 个（标签解析、勾选、分组统计、旧格式兼容、边界）
- [ ] 原有 `board.test.mjs` 全绿（不回归）
- [ ] README 更新（新动作与标签约定）
- [ ] vertical-toolkits dump-config 正常

## v1.2.0 — 多板

- `board` 参数：命名板（`.dsh/focus/<name>.md`），`list` 列举全部板与条目数
- 默认板保持 `.dsh/focus.md`，切换不破坏既有注入

## v1.3.0 — 历史与撤销

- 每次写入归档到 `.dsh/focus-history/`（按时间戳）
- `undo`：回滚到上一版并记录回滚原因

## v1.4.0 — 跨工作区聚合

- `aggregate`：读取多个工作区路径下的板并汇总（只读，containment 逐路径校验）

## v1.5.0 — 与待办集成

- `export_todos`：把 open 条目导出为待办清单
- `import_todos`：把待办凝练为决策/约束条目

## 发布节奏

每个版本走完整 dsh-factory 流程：本地验证 → npm publish → GitHub topic → awesome PR。
