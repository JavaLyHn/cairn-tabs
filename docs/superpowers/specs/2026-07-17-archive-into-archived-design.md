# 把开着的标签直接归档进「已归档任务」

日期:2026-07-17
状态:已确认(用户选定:交互=拖拽;撤销=带撤销)

## 背景

用户诉求:「没归档的窗口想归档到已经归档的任务里面,可以不用恢复已经归档的任务就能归档」。

**现状**:已归档任务的分组**不接受拖拽**(`ContextGroup` 里 `canDrop = variant !== 'archived'`)。
要把一个开着的标签加进某个已归档任务,只能:恢复整个任务(重开它全部标签)→ 拖进去 → 再整体归档。很绕。

## 目标

把一个开着的标签**直接拖进某个已归档任务** → 该标签被归档进去(关闭其浏览器标签、并入任务标签清单),
**任务保持归档状态、不被恢复/重开**。整个动作**可撤销**。

## 设计

### 交互(UI)

- `ContextGroup`:`canDrop` 改为对所有 variant 允许(含 `archived`),已归档分组也能接收拖拽。
- 拖到已归档分组上 → 沿用现有 DnD,触发 `onDropTab(tabId)`。
- 反馈:复用撤销 toast(见下),文案「已归档到「任务名」 · 撤销」——不再单独弹 flash,避免双 toast。

### 后台(`MOVE_TAB` 扩展,`core/background/commands.ts`)

在现有移动 + 锁定 + 记负样本之后,按**目标任务状态**分支:

- 目标 = **已归档** 且被拖标签是**开着的**(`chromeTabId != null`)且源≠目标:
  - 清空该标签 `chromeTabId`/`windowId`;
  - 持锁(`pauseSync`/`resumeSync`)`chrome.tabs.remove` 关闭浏览器标签(复用归档同款锁,防事件回灌幻影);
  - `onReclaim?.(BYTES_PER_DISCARD)` 计入回收内存;
  - 注册撤销:`undo.registerTabArchive({ tabId, fromContextId }, UNDO_TTL_MS)`;
  - 返回 `{ type:'UNDOABLE', action:'archive-tab', token, ttlMs }`。
- 目标 = 已归档 但标签本身已归档(`chromeTabId == null`,归档任务间挪动):纯移动,不关不撤销。
- 目标 = **活跃**:维持原逻辑(`ensureTabInContextGroup` 并入原生分组)。

### 撤销(`core/background/undo.ts` + `MOVE_TAB` 逆操作)

- `UndoManager` 新增:
  - `TabArchiveUndo { tabId: string; fromContextId: string }`;
  - `UndoEntry`/`UndoConsumed` 增字段 `tabArchive?`;
  - `registerTabArchive(payload, ttlMs)`(action = `'archive-tab'`);
  - `consume` 一并返回 `tabArchive`。
- `UNDO` 命令:`e.tabArchive` 时执行 `undoTabArchive` —— 重开浏览器标签
  (`chrome.tabs.create`+`bindChromeTab`)、把记录移回 `fromContextId`(若原任务已删除则兜回未分类)、
  并入原任务原生分组。归档任务保持归档不变。

### 客户端撤销状态(`store.ts` / `App.tsx`)

- `UndoState` 增可选 `name?: string`(承载目标任务名,给 toast 文案用)。
- `App.tsx` 的 `onDropTab` 改为 `async`:`await moveTab(...)`,若返回 `UNDOABLE` 则
  `setUndo({ action, token, ttlMs, name: 目标任务名 })`。
- `UndoToast` 标签规则新增:`action === 'archive-tab'` → `t('undo.archivedInto', { name })`。

### i18n(四语)

新增 `undo.archivedInto`(如「已归档到「{name}」」/`Archived into “{name}”` 等)。

## 不做(YAGNI)

- 不做多选批量拖(逐个拖即可);不加右键「归档到任务…」选择器(拖拽已够,和现有 UX 一致)。
- 不改归档任务的 `archivedAt`/排序(加标签不让它在归档区跳位)。

## 测试

- `tests/archive-into-archived.integration.test.ts`(新增,仿 `sync.integration`):
  - 开一个标签(落未分类)→ 建一个任务并归档它 → `MOVE_TAB` 该开着标签到已归档任务:
    断言 标签 `contextId` = 归档任务、`chromeTabId` 清空、`fake.tabsById` 少一个(浏览器标签已关)、
    归档任务仍 `archived`、返回 `UNDOABLE` action `archive-tab`。
  - `UNDO`:断言 标签重开(`chromeTabId` 回填)、移回原任务、归档任务仍 archived。
  - 归档任务间挪动已归档标签:纯移动、不返回 UNDOABLE。
- `tests/context-group.test.tsx`:archived variant 现在能接收 drop(`onDropTab` 被调用)。
- `tests/undo.test.ts`:`registerTabArchive` + `consume` 往返带回 `tabArchive`。

## 架构一致性

SW 仍是唯一写库方;关闭浏览器标签走既有 sync-lock;UI 只发命令 + 订阅快照;
撤销经既有 `UndoManager`/`UNDOABLE`/`UNDO` 通路扩展。符合既有约定。
