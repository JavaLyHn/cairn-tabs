# 浏览器重启后恢复任务/标签(对账按稳定键重关联)— 设计

日期:2026-07-16
状态:已通过设计评审,待写实现计划

## 背景与根因

关闭所有浏览器后重开,Chrome 会话恢复会**重新分配所有 `chromeTabId` 与 `tabGroups` 的 `groupId`**(原生分组连同标题/颜色仍在标签栏)。但 Cairn Tabs 的对账**只按这两个 ID 匹配**:

- `reconcile`(`tab-sync.ts`):记录的旧 `chromeTabId` 在实时标签里找不到 → 当幻影 `removeTab` 删掉(其实只是 ID 变了)。
- `reconcileGroups`(`group-sync.ts`):任务的旧 `nativeGroupId` 不在实时分组里、且(记录被删后)`tabOrder` 已空 → `deleteContext` 删任务。

结果:持久化在 IndexedDB 的任务/标签被对账**误删**,面板显示空。而 **URL(标签)与分组标题(任务)在重启后稳定不变**,按稳定键重新关联即可恢复。数据本在,恢复可行。

## 目标(已确认:完整恢复)

浏览器重启后,打开的标签**按 URL 重绑回原记录**(保留 `contextId`、`starred`、`pinned`、`firstOpenedAt` 等全部元数据);任务**按分组标题重连回原分组**。用户几乎无感。

## 选型

**对账改为「先按稳定键重绑/重连,再清删」**,并对冷启动做非破坏性保护。改动集中在两个对账函数 + hydrate 接线,契合现有架构。(不引入 onStartup 计时器方案,因其不解决"按 ID 匹配"的根本问题;不采用"永不清幻影"方案,因会让休眠期漏收的幻影长期残留。)

## 组件与数据流

### 1. 标签对账按 URL 重绑(`core/background/tab-sync.ts` `reconcile`)

签名:`reconcile(repo, onChange, opts?: { purge?: boolean })`(`purge` 默认 `true`)。

流程(替换现有 step 1/2):
1. 建 `recordByChromeId`:所有 `chromeTabId != null` 且**在实时标签中存在**的记录(现有去重逻辑保留)。这些 id 记入 `claimed` 集合。
2. **重绑趟**:收集"死记录"= `chromeTabId != null` 且**不在实时标签中**的记录(注:`chromeTabId == null` 是已归档标签,**不动**)。对每条死记录,在**未被占用(不在 claimed)** 的实时可跟踪标签里找**同 `url`** 的一个 → `repo.updateTab(rec.id, { chromeTabId: liveTab.id, windowId: liveTab.windowId })`,并把该实时标签加入 claimed。记录的 `contextId`/`starred`/`pinned`/`firstOpenedAt` 等原样保留。
3. **清删趟**:重绑不上的死记录 → 仅当 `purge === true` 时 `repo.removeTab(rec.id)`;`purge === false` 时**保留**(留着死 `chromeTabId`,供之后的对账在标签就绪后重绑)。
4. **补建趟**:实时标签中**未被 claimed** 的可跟踪标签 → `repo.addTab(...)`(全新标签;`contextId` 走 `contextIdForGroup(tab.groupId)`,未知分组 → INBOX)。
5. **空集保护**:若 `liveTabs.length === 0` 且库中有 `chromeTabId != null` 的记录 → **跳过清删趟**(明显是会话恢复尚未就绪),即使 `purge===true`。

### 2. 分组对账按标题重连(`core/background/group-sync.ts` `reconcileGroups`)

签名:`reconcileGroups(repo, onChange, opts?: { prune?: boolean })`(`prune` 默认 `true`)。

流程(替换现有 step 1;step 2「按分组归属对齐标签」保留不变):
- 建 `liveGroupIds` 与 `liveGroupsByTitle: Map<string, number[]>`(来自 `chrome.tabGroups.query({})`)。把已被现存 context 正确引用(`nativeGroupId ∈ liveGroupIds`)的分组记入 `claimedGroups`。
- 对每个 `nativeGroupId != null && !liveGroupIds.has(nativeGroupId)` 的 context:
  1. **重连**:在 `liveGroupsByTitle.get(context.name)` 里找一个**未被占用(不在 claimedGroups)** 的 groupId → `repo.setNativeGroupId(context.id, groupId)`,加入 claimedGroups。任务保留。
  2. 无同名分组可连:
     - `prune === true`:走原行为 —— 活跃命名且 `tabOrder.length === 0` 且非 INBOX → `deleteContext`;否则 `setNativeGroupId(undefined)`。
     - `prune === false`:**原样保留**(保留死 `nativeGroupId`,供之后对账重连;不删不解绑)。
- step 2 照旧:遍历实时标签,按其 `groupId` 找 context(现已重连)对齐 `contextId`;未知分组仍 `adoptGroup`。

### 3. hydrate 与聚焦对账的接线(`core/background/index.ts`)

- `hydrate()`:改为 `reconcile(repository, scheduleBroadcast, { purge: false })` + `reconcileGroups(repository, scheduleBroadcast, { prune: false })` —— 冷启动只重绑/重连,不清删。
- `reconcileNow()`(面板聚焦 / 合并前 / 点到幻影触发):保持 `reconcile(...)` + `reconcileGroups(...)` 默认(`purge:true` / `prune:true`)—— 此时恢复已完成,可安全清真正没了的。

### 数据流(重启后)
1. Chrome 恢复标签 + 原生分组(全新 ID)。
2. SW 启动 → `hydrate` → `reconcile{purge:false}` + `reconcileGroups{prune:false}`:能重绑/重连的就地恢复;不清删(即使恢复未就绪也不会误删)。
3. 用户打开面板 → `REQUEST_SNAPSHOT` → `reconcileNow`(`purge/prune:true`):此时恢复已完成,按 URL/标题把剩余的全部重绑重连,并清掉真正没了的。
4. 结果:原任务、原标签、★重点/手动锁定 全部回到原位。

## 边界与决策

- **同 URL 多标签 / 同名多分组**:1:1 贪婪匹配,每条死记录只认一个未占用的同 URL 实时标签;同名分组同理。同页/同名互换无害。
- **归档标签**(`chromeTabId == null`):对账不碰,保持归档态。
- **正常运行期**:重绑趟每次对账都会跑,但只作用于"死 `chromeTabId`"的记录、且只匹配未占用的同 URL 实时标签 —— 关掉的标签若无同 URL 实时标签仍会被正确清除,不影响幻影清理。
- **已被本次 bug 删除的数据**无法找回;但只要原生分组还在,重连/收养会按标题把任务结构恢复回来。

## 测试

- **reconcile 重绑**(`tests/sync.integration.test.ts` 或就近):死 `chromeTabId` + 同 URL 实时标签 → 记录 `chromeTabId` 回填、`contextId`/`starred`/`pinned` 保留、未被删。
- **purge 开关**:`purge:false` 时死记录(无同 URL)保留;`purge:true` 时删除。
- **空集保护**:`liveTabs` 为空 + 有记录 → 即便 `purge:true` 也不删。
- **reconcileGroups 重连**:死 `nativeGroupId` + 同标题实时分组 → `nativeGroupId` 回填、任务未删;`prune:false` 时无同名分组也不删/不解绑。
- **模拟重启集成测试**(核心):FakeChrome 里把所有 `chromeTabId` 与 `groupId` 换新、URL/标题不变 → 跑 `hydrate` 等价流程(`reconcile{purge:false}`+`reconcileGroups{prune:false}` 再 `reconcile{}`+`reconcileGroups{}`)→ 断言任务与标签恢复到原任务、★/锁定不丢、无重复记录。

## 不做(YAGNI)

- 不引入 `onStartup` 计时器 / 延迟重跑机制(非破坏性 hydrate + 聚焦对账已足够)。
- 不改归档/恢复、命令处理、聚簇引擎。
- 不做跨设备同步(与本 bug 无关)。
