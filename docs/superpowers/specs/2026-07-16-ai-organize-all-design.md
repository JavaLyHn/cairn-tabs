# AI 整理全部(全局重新聚类)— 设计

日期:2026-07-16
状态:待用户评审

## 背景与目标

现状:AI 整理只有 `AI_ORGANIZE_INBOX` —— 只把**未分类**里打开的标签,新建分组或并入已有任务;**从不动**已有命名任务里的标签。入口也只在未分类头部。

目标:新增「**整理全部**」——把**所有打开的标签**(含已有分组内的)交给 AI,一次性精准重新聚类,允许跨组移动,让尽量所有标签都落到合适的组。应用前强预览,应用后可一键撤销。

## 已确认的范围决策(brainstorming)

1. **作用范围**:全部标签重新聚类(含已有分组内的),允许跨组移动。
2. **归类尺度**:激进 —— 尽量给每个标签找到归属,几乎不留未分类。
3. **手动保护**:锁定 **★重点(starred)** 与 **手动拖过(pinned)** 的标签,它们不参与重排、留在原组。
4. **事后撤销**:要,一键把这次批量移动整体还原。
5. **旧入口**:保留未分类的「✦ AI 整理」(保守、只碰未分类),与新的「整理全部」共存。

## 选型

复用现有管线与数据模型 `AIPlan = { newGroups, assign }`。`assign` 本就能把任意标签移到任意任务(=跨组移动),`newGroups` 能新建组——足以表达全局重排。**不**引入「move/merge/rename」的复杂 plan 模型(YAGNI)。

新增面:一个命令 `AI_ORGANIZE_ALL`;`buildOrganizePrompt` 加激进档;`APPLY_AI_PLAN` 加 `global` 分支(不打锁 + 清空组 + 注册撤销);`UndoManager` 扩展承载 reorg 逆操作;头部一个入口按钮;预览弹窗显示"原组"。

## 组件与数据流

### 1. 入口(UI)

- `App.tsx` 头部动作行(「+ 新建」旁)新增文字按钮 **`✦ 整理全部`**,仅当 `ai.hasKey`(AI 已配置)且存在可动标签时渲染。点它 → `useAiActions.aiOrganizeAll()`。
- 未分类头部原「✦ AI 整理」保持不变。
- 分析中沿用底部「✦ AI 分析中…(取消)」pill;取消复用 `CANCEL_AI`。

### 2. 采集与 prompt(SW:`AI_ORGANIZE_ALL`)

新增 `shared/messaging.ts` Command:`{ type: 'AI_ORGANIZE_ALL' }`(加入 `COMMAND_TYPES`)。

Handler(`core/background/commands.ts`):
- 校验 `ctx.ai.configured()`,否则 `AI_ERROR reason:'no_key'`。
- `const { contexts, tabs } = await repo.getSnapshot()`。
- **可动集** `movable = tabs.filter(t => t.chromeTabId != null && !t.starred && !t.pinned)`。为空 → `AI_ERROR reason:'empty'`。
- **已有任务** `tasks = contexts.filter(c => c.id !== INBOX_ID && c.status === 'active')`,每个用其**当前全部标签**(含锚点)算 `summarizeTaskTabs` 信号(domains + samples)。
- `buildOrganizePrompt(movable.map(域名+标题), tasks, { aggressive: true })`。
- `raw = await ctx.ai.complete(system, user)`(复用 `aiRunner`,含超时/取消;`isAICancelled` → `reason:'cancelled'`,其余 → `'network'`)。
- `plan = parseOrganizeResponse(raw, new Set(movable ids), new Set(tasks ids))`;null → `AI_ERROR reason:'parse'`。
- 返回 `{ type:'AI_PLAN', plan, tabs: movable }`。

### 3. 激进档 prompt(`core/ai/organize.ts`)

`buildOrganizePrompt(tabs, tasks, opts?: { aggressive?: boolean })`:
- 默认(保守,现状文案)不变——`AI_ORGANIZE_INBOX` 继续用默认。
- `aggressive: true` 时替换两条规则:
  - 「**尽量**给每个标签找到最合适的归属;只有实在与任何任务/主题都无关的,才不归类。」(替代"保守:拿不准就不归")
  - 追加:「这些标签可能来自不同的已有分组;可以把明显更合适别处的标签**跨组移动**、也可以重新平衡已有分组。」
- 其余(优先并入已有、参考 domains/samples、组名简短、严格 JSON)不变。

### 4. 应用(SW:`APPLY_AI_PLAN` 加 `global` 分支)

`shared/messaging.ts`:`{ type:'APPLY_AI_PLAN'; plan: AIPlan; global?: boolean }`。

先给两个 helper 加不打锁选项(默认 `pin:true`,保持现有行为):
- `assignTab(tabId, toContextId, repo, now, opts?: { pin?: boolean })` —— `pin:false` 时跳过 `repo.pinTab`(只 `moveTab` + `ensureTabInContextGroup`)。
- `createClusterFromTabs(name, tabIds, repo, now, opts?: { pin?: boolean }): Promise<string>` —— 传透 `pin`,并**返回**新建的 contextId(供撤销记录 createdIds)。

Handler:
```
const global = cmd.global === true;
// 捕获 before(仅 global):plan 涉及的每个 tab 的原 contextId
const before = new Map<string,string>();       // tabId -> 原 contextId
if (global) for (每个 plan.newGroups/assign 的 tabId) before.set(tabId, (await repo.getTab(tabId))?.contextId ?? INBOX_ID);
const beforeCtxIds = new Set(global ? 活跃命名 context id : []);

const createdIds: string[] = [];
for (const g of plan.newGroups) createdIds.push(await createClusterFromTabs(g.name, g.tabIds, repo, now, { pin: !global }));
for (const a of plan.assign) {
  const target = await repo.getContext(a.taskId);
  if (!target || target.status !== 'active') continue;
  for (const tabId of a.tabIds) await assignTab(tabId, a.taskId, repo, now, { pin: !global });
}
onChange();
if (!global) return;                            // 未分类整理:保持原行为(打锁、不 GC、无撤销)

// 清空组:重排后变空的「原有」命名活跃组 → 删除,记录以便撤销重建
const recreate: { id:string; name:string; color:ContextColor }[] = [];
for (const id of beforeCtxIds) {
  const c = await repo.getContext(id);
  if (c && c.status === 'active' && c.tabOrder.length === 0) { recreate.push({id, name:c.name, color:c.color}); await repo.deleteContext(id, now); }
}
// moves:真正发生移动的(原 != 现)→ 撤销时移回原 contextId
const moves = [];
for (const [tabId, orig] of before) { const cur = (await repo.getTab(tabId))?.contextId; if (cur && cur !== orig) moves.push({ tabId, toContextId: orig }); }

const { token, ttlMs } = undo.registerReorg({ moves, recreate, deleteContextIds: createdIds }, UNDO_TTL_MS);
return { type:'UNDOABLE', action:'reorg', token, ttlMs };
```

**为何不打锁**:`assignTab` 打的 `pinned` 表示"人工锁定,引擎不再动"。全局重排若给每个标签打锁,则跑一次后全被锁 → 第二次无可动标签。**不打锁**才能反复整理;而引擎只对"新开标签"聚类、不回头动已存在的标签,故不锁也安全。未分类整理仍打锁(原语义不变)。

### 5. 撤销(`UndoManager` + `UNDO`)

`core/background/undo.ts` 扩展承载 reorg 逆操作:
- 新增类型 `interface ReorgUndo { moves:{tabId:string;toContextId:string}[]; recreate:{id:string;name:string;color:ContextColor}[]; deleteContextIds:string[] }`。
- `UndoEntry` 增 `reorg?: ReorgUndo`(`contextId` 变可选)。
- 新增 `registerReorg(reorg, ttlMs): { token, ttlMs }`。
- `consume(token)` 返回值改为 `{ action:string; contextId?:string; reorg?:ReorgUndo } | undefined`(原 archive 分支据 `contextId` 判断)。

`UNDO` handler 改为:
```
const e = undo.consume(cmd.token);
if (!e) return;
if (e.reorg) { await undoReorg(e.reorg, ctx); onChange(); return; }
if (e.contextId) { await restoreContext(e.contextId, ctx); onChange(); }
```

`undoReorg(reorg, ctx)`(新 helper,commands.ts):
```
const idMap = new Map<string,string>();                 // 旧被删组 id -> 重建后新 id
for (const c of reorg.recreate) { const fresh = await repo.createContext(c.name, now, { color:c.color }); idMap.set(c.id, fresh.id); await syncGroupTitle(repo, fresh.id, c.name); }
for (const m of reorg.moves) {                           // 移回原组(不打锁)
  const target = idMap.get(m.toContextId) ?? m.toContextId;
  await repo.moveTab(m.tabId, target, now);
  const t = await repo.getTab(m.tabId);
  if (t?.chromeTabId != null) await ensureTabInContextGroup(repo, target, t.chromeTabId);
}
for (const id of reorg.deleteContextIds) await deleteContextAndUngroup(id, repo, now);  // 此时应已空
```
`deleteContextAndUngroup` = 抽出 `DELETE_CONTEXT` 里"删 context + 把活标签从原生分组解出(持锁)"的逻辑复用;created 组撤销时已空,等价于 `repo.deleteContext`。

> 说明:被删组以**新 id**重建(name/color 不变),对用户视觉与行为等价——没有任何持久实体引用旧 context id(标签的 contextId 由撤销逻辑重写)。

### 6. 预览弹窗(`AIPlanDialog` 小增强)

- App 侧把当前建议标注 scope:`aiPlan: { plan, tabs, scope:'inbox'|'all' }`。
- `AIPlanDialog` 新增可选 `sourceNames?: Record<string,string>`(tabId → 原组名)。渲染每个标签时,若该标签有 sourceName 且 ≠ 目标,行尾淡显「原 ⟨组名⟩」,让用户看清"从哪搬到哪"。inbox 档不传 → 无变化。
- 其余(整条/逐个剔除、整体取消)不变。

### 7. UI 动作(`useAiActions`)

- 新增 `aiOrganizeAll(): Promise<void>`:与 `aiOrganize` 同构,发 `AI_ORGANIZE_ALL`,成功 `setAiPlan({ plan, tabs, scope:'all' })`;错误文案复用同一 map。
- `applyAiPlan(plan, opts?: { global?: boolean })`:`global` 时 `dispatch({type:'APPLY_AI_PLAN', plan, global:true})` 并据返回的 `UNDOABLE` 调 `setUndo`(底部出现「已整理 · 撤销」)。App 依 `aiPlan.scope` 传 `global`。

## 隐私(F-13,不变,硬约束)

- 只出网 **标签标题 + eTLD+1 域名 + 任务名**(含已有任务的 domains/samples)。**绝不**发完整 URL / query / 页面内容。可动集与已有任务信号都只取 title+registrableDomain。API key 只在 SW 读,不进 UI/日志/广播。
- 必须有集成测试断言 `AI_ORGANIZE_ALL` 出网体只含域名/标题/名,不含原始路径/query。

## 测试

- **organize.test.ts**:`buildOrganizePrompt(..., { aggressive:true })` 的 system 含"尽量…归属/跨组移动",默认档不含。
- **commands / 集成**:
  - `AI_ORGANIZE_ALL` 可动集正确排除 starred / pinned / 已归档(chromeTabId==null),包含 inbox 与各组的普通标签;空可动集 → `empty`。
  - `APPLY_AI_PLAN {global:true}`:跨组移动生效;移动后 `pinned` 仍为 false(可反复跑);重排后变空的原有组被删除;返回 `UNDOABLE action:'reorg'`。
  - **撤销**:consume reorg token → 标签全部移回原 contextId;被删组重建(name/color 保留);plan 新建组被删除。
  - **F-13 出网**:断言请求体只含域名+标题+任务名。
- **AIPlanDialog.test**:传 `sourceNames`,跨组标签显示「原 X」;不传则不显示。

## 不做(YAGNI / 明确排除)

- 不引入 move/merge/rename 富 plan 模型。
- 不做已有分组的自动合并/拆分/改名(只移动标签 + 建新组 + 删空组)。
- 不动已归档任务里的标签。
- 撤销窗口沿用 5s(`UNDO_TTL_MS`),不做多级撤销。
