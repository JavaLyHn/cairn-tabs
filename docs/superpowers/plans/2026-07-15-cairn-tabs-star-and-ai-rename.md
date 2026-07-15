# 重点标注(Star)+ AI 改名 实现计划

> 设计见 `docs/superpowers/specs/2026-07-15-cairn-tabs-star-and-ai-rename-design.md`。内联实现,按层提交。

## Global Constraints
- Star:`TabRecord.starred`;免陈旧/免挂起集中在 `isStale`/`shouldDiscard` 两个纯函数;★区是镜像(原组保留)。
- AI 改名:建议优先(填入改名框,不自动应用);只发标题+eTLD+1 域名;门控 `ai.hasKey`。
- key 只在 SW;AIStatus 不含 key(沿用 F-13)。

## 执行顺序(每步 `pnpm test` + `pnpm compile`)

### 提交 1:Star 数据 + 免陈旧/免挂起 + 命令(含测试)
- `shared/types.ts`:`TabRecord.starred?`。
- `shared/messaging.ts`:`SET_TAB_STARRED` + `COMMAND_TYPES`。
- `shared/stale.ts`:`isStale` starred 短路。
- `shared/discard.ts`:`shouldDiscard` starred 短路。
- `core/store/repositories.ts`:`setTabStarred`。
- `core/background/commands.ts`:`SET_TAB_STARRED` case。
- 测试:`stale`/`discard` 加 starred 用例;命令集成 `SET_TAB_STARRED` + archive/restore 保留。

### 提交 2:Star UI
- `TabRow.tsx`:`onToggleStar?` + 星按钮(实心金/空心 hover)。
- `ContextGroup.tsx`:`onToggleStar?(id)`,非 archived 传给 TabRow。
- `components/StarredSection.tsx`(新)。
- `App.tsx`:`toggleStar`、`starredTabs`、渲染 `StarredSection`、`tabsOf` starred 稳定浮顶、groupProps 加 `onToggleStar`。

### 提交 3:AI 改名(纯逻辑 + 命令,含测试)
- `core/ai/organize.ts`:`buildNamePrompt`、`parseNameResponse`、导出 `stripFences`。
- `shared/messaging.ts`:`AI_SUGGEST_NAME` 命令 + `AI_NAME` 事件 + `COMMAND_TYPES`。
- `core/background/commands.ts`:`AI_SUGGEST_NAME` case。
- 测试:`buildNamePrompt`/`parseNameResponse`;命令集成 no_key/empty/AI_NAME。

### 提交 4:AI 改名 UI
- `ContextGroup.tsx`:编辑态「✦」按钮 + input ref 预填。
- `App.tsx`:`aiSuggestName`、groupProps 加 `onAiSuggestName`。

### 提交 5:README + docs

## 验证
`pnpm test`、`pnpm compile`、`pnpm build` 全绿。
