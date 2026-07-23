# 命名任务的「✦ AI 整理」= 净化本组(踢出不属于的)

日期:2026-07-18
状态:已确认(用户选定:审视本任务标签,把明显不属于的踢回未分类;拿不准留原位;带预览+撤销)

## 目标

给每个命名任务加独立「✦ AI 整理」:AI 只看该任务的可动标签 + 任务名,判断哪些**明显不属于**
这个主题 → 踢回**未分类**;明显属于的留下;拿不准的留原位(不猜)。带预览(可逐个否决)+ 撤销。

约束:F-13 隐私(只发标题 + 主域名 + 任务名)。

## 数据流(尽量复用现有 AIPlan / 预览弹窗)

`AI_ORGANIZE_TASK{contextId}` → 组装 `AIPlan`(踢出→assign 到 INBOX_ID;拿不准→unclear)→
复用 `AIPlanDialog` 预览 → `AI_PRUNE_APPLY{fromContextId,tabIds}` 应用 → reorg 式撤销。

## 改动

### `core/ai/organize.ts`
- `buildPruneTaskPrompt(taskName, tabs)`:系统提示为「净化本组」语义 —— 只输出「不属于本主题的踢出」
  + 「拿不准」;明显属于的不必列出(留下)。严格 JSON:`{"evict":[{tabId,reason}],"unclear":[{tabId,reason}]}`。
- `parsePruneResponse(raw, validTabIds)` → `{evict, unclear}`(去重:一个标签至多一处;校验 tabId;理由 trim/≤40)。
  JSON 不可解析 → null;合法但空 → 返回空结构(命令据此给「无需变更」的 plan)。

### `shared/messaging.ts`
- Command 增 `{type:'AI_ORGANIZE_TASK';contextId}` 与 `{type:'AI_PRUNE_APPLY';fromContextId;tabIds}`,并入 `COMMAND_TYPES`。

### `core/background/commands.ts`
- `AI_ORGANIZE_TASK`:取该任务「可动」标签(`contextId===cmd.contextId && chromeTabId!=null && !starred && !pinned`);
  无 → `AI_ERROR{empty}`。跑 prune prompt → parse。组装 `AIPlan{newGroups:[], assign: evict?[{taskId:INBOX_ID,tabIds}]:[], unclear}`,
  返回 `{type:'AI_PLAN', plan, tabs:可动标签}`;parse null → `AI_ERROR{parse}`。
- `AI_PRUNE_APPLY`:逐个把仍在 `fromContextId` 的 tab `moveTab(→INBOX_ID)`(**不 pin**)、`ensureTabInContextGroup(INBOX_ID)`(会 ungroup);
  收集 moves(撤销移回原任务);`undo.registerReorg({moves,recreate:[],deleteContextIds:[]})`;返回 `{type:'UNDOABLE',action:'prune',...}`。
  **不删空任务、不碰其它组**(有别于 global APPLY_AI_PLAN)。无移动 → 返回 void。

### `entrypoints/sidepanel/hooks/useAiActions.ts`
- `aiPlan` scope 增 `'task'`,并带 `taskId`/`taskName`;`setUndo` 依赖类型加可选 `name`。
- 新增 `aiOrganizeTask(contextId, taskName)`:dispatch → AI_PLAN 时 `setAiPlan({plan,tabs,scope:'task',taskId,taskName})`;错误含 `empty.task`。
- `applyAiPlan(plan, opts)`:opts 增 `prune?/fromContextId?/taskName?`。prune 时抽出 assign 的 tabIds →
  dispatch `AI_PRUNE_APPLY`;UNDOABLE → `setUndo({action:'prune',...,name:taskName})`(单 toast、无 flash)。

### `entrypoints/sidepanel/components/ContextGroup.tsx`
- 新 prop `onAiPrune?`。命名任务操作行(「✦ AI 改名」旁)加「✦ AI 整理」按钮:
  条件 `!isInbox && aiEnabled && onAiPrune && tabs.some(可动)`;`aiBusy` 时禁用/显示分析中。复用 `context.ai.organize` 文案,title 用新 `context.ai.pruneTitle`。

### `entrypoints/sidepanel/App.tsx`
- `groupProps.onAiPrune = () => aiOrganizeTask(ctx.id, ctx.name)`。
- AIPlanDialog:`taskNames` 覆盖 `INBOX_ID → t('context.inboxName')`;`sourceNames` 对 `scope!=='inbox'` 都构建(源=标签当前任务名);
  `onApply`:scope==='task' → `applyAiPlan(plan,{prune:true,fromContextId:aiPlan.taskId,taskName:aiPlan.taskName})`,否则 `{global:scope==='all'}`。
- UndoToast 标签:`undo.action==='prune'` → `t('ai.flash.pruned',{name:undo.name})`。

### i18n 四语
- `ai.error.empty.task`、`ai.flash.pruned`(含 {name})、`context.ai.pruneTitle`。

## 测试
- `ai-organize.test.ts`:`buildPruneTaskPrompt`(系统含任务名 + 「不属于」语义 + JSON)、`parsePruneResponse`(evict/unclear/去重/非法/空)。
- 集成:`AI_PRUNE_APPLY` 把标签移到未分类(ungroup)、返回 UNDOABLE、UNDO 移回原任务。
- `context-group.test.tsx`:命名任务(有可动标签)显示「✦ AI 整理」并触发 `onAiPrune`;inbox 不显示该(prune)按钮。

## 验证
`tsc`/`oxlint`/`prettier`/`vitest`/`wxt build` 全绿。真机:命名任务 hover 点「✦ AI 整理」→ 预览「原 X → 未分类 / 拿不准」→ 应用后不相关标签进未分类、可撤销。
