# 重点标注(Star)+ AI 改名 设计文档

> 两个独立小功能,日期:2026-07-15。先做 Star,再做 AI 改名。

## 功能一:重点标注(Star)

### 目标
给某个标签打星标为「重点」,让它显眼、易达、且不被系统自动收走。

### 数据 / 协议
- `TabRecord.starred?: boolean`(新字段,默认 undefined=未加星)。收纳/恢复保留(archiveContext 只清 chromeTabId/windowId)。
- 命令 `{ type: 'SET_TAB_STARRED'; tabRecordId: string; starred: boolean }` + `COMMAND_TYPES`。
- 仓储 `setTabStarred(id, starred)`:`db.tabs.update(id, { starred })`。

### 行为(三项,调和为「镜像」)
1. **组内浮顶**:渲染时每个任务内 starred 标签稳定排到最前(App `tabsOf` 末尾加 `starred` 优先的稳定排序)。
2. **顶部「★ 重点」区**:面板最顶一个 `StarredSection`,列出所有**活标签**(chromeTabId!=null)里 starred 的,横跨所有任务,做快速直达(镜像:标签仍留原任务,故会同时出现在原任务顶部与★区)。
3. **免陈旧 + 免挂起**:
   - `shared/stale.ts` `isStale`:`if (tab.starred) return false`(UI 的 staleRecords 与 SW 的 ARCHIVE_STALE 都走它,一处生效)。
   - `shared/discard.ts` `shouldDiscard`:`if (record.starred) return false`。

### UI
- `TabRow` 新增可选 `onToggleStar?`:提供时渲染星按钮——已加星常显**实心金 ★**(`text-amber-400`),未加星 hover 显示**空心 ☆**;点击 `stopPropagation` 后切换,不触发打开。
- `ContextGroup`:非 archived 变体给 TabRow 传 `onToggleStar`;archived 不传(归档标签加星无意义)。
- `StarredSection`(新):头部「★ 重点 · N」+ TabRow 列表(复用),含激活/关闭/取消星标。无 starred 时不渲染。
- `App`:`starredTabs = tabs.filter(t => t.starred && t.chromeTabId != null)`;在 activeContexts 之上渲染 `StarredSection`。`toggleStar(id, starred) → dispatch SET_TAB_STARRED`。

### 命令处理
- `SET_TAB_STARRED`:`await repo.setTabStarred(cmd.tabRecordId, cmd.starred); onChange();`

### 测试
- `stale`:starred 标签 `isStale`===false、不进 `staleTabs`。
- `discard`:starred 标签 `shouldDiscard`===false。
- 命令集成:`SET_TAB_STARRED` 落库;archive→restore 后 starred 保留。

---

## 功能二:AI 改名

### 目标
改名时可让 AI 依据任务里标签的标题+域名,建议一个简短任务名,填入改名框(建议优先,你确认)。

### 协议
- 命令 `{ type: 'AI_SUGGEST_NAME'; contextId: string }` + `COMMAND_TYPES`。
- 事件 `{ type: 'AI_NAME'; name: string }`(请求/响应式,像 SEARCH)。失败复用 `AI_ERROR`。

### 纯逻辑(`core/ai/organize.ts`)
- `buildNamePrompt(tabs: {title,domain}[]) → {system,user}`:要求「概括共同任务/主题,≤12 字,不要引号/解释,语言随标题,只输出名字本身」。
- `parseNameResponse(raw): string | null`:去代码围栏、去首尾引号、取首行、trim、截断 40;空则 null。
- 导出现有 `stripFences` 供复用。

### 命令处理(`core/background/commands.ts`)
`AI_SUGGEST_NAME`:未配置→`AI_ERROR{no_key}`;取该 context 的标签(无则 `AI_ERROR{empty}`);`buildNamePrompt(标题 + registrableDomain(hostnameOf(url)))`→`ctx.ai.complete`(try/catch→network)→`parseNameResponse`(null→parse)→`AI_NAME{name}`。隐私:仅标题+域名出网。

### UI
- `ContextGroup` 编辑态:输入框旁加「✦」按钮(仅 `aiEnabled && !isInbox`)。`onMouseDown` preventDefault(避免点按钮使 input 失焦触发 commit);点击 → `await onAiSuggestName()` → 有返回则设 `inputRef.current.value = name` 并 focus+select;按钮 await 期间禁用。改用 `ref` 拿 input(现为 defaultValue 非受控)。
- `ContextGroup` 新 prop `onAiSuggestName?: () => Promise<string | null>`。
- `App`:`aiSuggestName(contextId)`:dispatch `AI_SUGGEST_NAME`;`AI_NAME`→返回 name;`AI_ERROR`→showFlash 人话、返回 null。groupProps 加 `onAiSuggestName: () => aiSuggestName(ctx.id)`。

### 测试
- `buildNamePrompt`/`parseNameResponse`:围栏、引号、多行、空、截断。
- 命令集成:`AI_SUGGEST_NAME` 假 ai 返回 → `AI_NAME`;未配置→no_key;空任务→empty。

---

## 改动文件
`shared/{types,messaging,stale,discard}`、`core/store/repositories`、`core/background/commands`、`core/ai/organize`、`entrypoints/sidepanel/{App,components/TabRow,components/ContextGroup}` + 新 `components/StarredSection` + 测试 + README。

## 非目标(YAGNI)
- 不做星标排序的用户自定义;★区固定按 tabOrder。
- AI 改名不做多候选、不自动应用(仅建议填入)。
- 不做「移走式」★区(用户选了镜像;将来可切)。
