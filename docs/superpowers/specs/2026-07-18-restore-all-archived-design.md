# 一键恢复全部归档

日期:2026-07-18
状态:已确认(用户选定:一键为主,标签多时才弹确认)

## 背景

现在恢复归档只能逐个点每个归档任务的「恢复」。用户要「一键恢复全部」。

风险:一次重开所有归档任务的标签可能很多(几十上百),会瞬间开一堆、卡浏览器,且不像归档那样好撤销。
→ 因此**标签总数超过阈值时先弹一次确认**;不超阈值则真·一键。

## 方案

### SW 命令 `RESTORE_ALL_ARCHIVED`(`core/background/commands.ts` + `shared/messaging.ts`)

- 取所有 `status==='archived'` 的 context,逐个 `restoreContext(c.id, ctx)`(复用现有限速重开逻辑;
  暂存/陈旧簇同样被 restoreContext 正确处理 —— 标签回未分类、簇删除)。
- 每个恢复后 `onChange()`,让面板随任务逐个回来渐进刷新。返回 void。
- 并入 `COMMAND_TYPES`。

### 客户端(`entrypoints/sidepanel/App.tsx`)

- `restoreAll()`:若 `archivedTabCount > RESTORE_ALL_CONFIRM_THRESHOLD`(=10)→ `window.confirm`
  (文案含标签数/任务数);确认或未超阈值 → dispatch `RESTORE_ALL_ARCHIVED`。
- 归档区标题栏(`app.archivedSection` 那行)改为 flex 行,右侧加「全部恢复」按钮,仅当归档任务 **≥ 2** 时显示
  (只有 1 个时,该任务自带「恢复」已够,避免冗余)。

### i18n 四语

- `app.restoreAll`(按钮「全部恢复」)、`app.restoreAllConfirm`(确认文案,含 `{tabs}`/`{tasks}`)。

## 不做(YAGNI)

- 不做撤销(恢复不销毁数据;误触可再逐个归档)。确认已覆盖误开风险。
- 不显示进度条(限速重开;onChange 渐进刷新已够)。

## 测试

- 集成(仿 sync.integration):建两个任务各含标签 → 归档 → `RESTORE_ALL_ARCHIVED` →
  两个任务都回 `active`、标签重开(chromeTabId 回填)。
- 阈值/确认在客户端(window.confirm),不单测;靠 tsc/构建 + 真机。

## 验证

`tsc`/`oxlint`/`prettier`/`vitest`/`wxt build` 全绿。真机:多归档任务 → 归档区右上「全部恢复」→
(标签多则确认)→ 所有任务恢复、标签重开。
