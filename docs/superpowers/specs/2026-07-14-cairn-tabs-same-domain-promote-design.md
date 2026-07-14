# 同域升格(F-07 收尾)设计文档

> F-07 自动聚簇的收尾。日期:2026-07-14。

## 目标

「未分类」里同一注册域(eTLD+1)的活标签攒够阈值时,给出一条**建议**,用户点「成簇」即把它们拎成一个新命名簇(+ 原生分组)。补上现有升格只认 opener 链的缺口。

## 背景

现有升格 `findPromotableCluster` 只处理 **opener 链连通**的树(≥3、15min 窗)。从书签/搜索分别打开的同站标签没有 opener 链,永远散在未分类。本功能补「同域」这条路。

## 决策(已与用户确认)

1. **阈值可调**:设置里步进器,默认 4,范围 2–8(存储层 clamp 2–20)。
2. **不跳过通用域**:任何域够数都算候选(`google.com` 也会给建议)。唯一去重:已存在同名簇则不重复建议。
3. **建议而非自动**:出一条「N 个 <域> · 成簇 / 忽略」的建议条,用户确认才落地(复用 localhost 端口建议那套交互)。opener 树升格保持自动不变。

## 行为细节

- 候选标签:`contextId === INBOX` 且 `chromeTabId != null`(活)且 `!pinned`(未锁定)。
- 分组键:`registrableDomain(hostnameOf(url))`。
- 阈值:同域候选数 ≥ `flags.sameDomainPromoteSize`。
- 去重:若已有 `status==='active'` 的命名簇其 `name` 恰等于该域名 → 跳过(避免重复建簇)。
- 会话忽略:用户点「忽略」→ 该域名进 `ignoredDomains`(会话级,不持久),不再提示。
- 门控:归属「自动聚簇」;`flags.autoCluster === false` 时不出建议、阈值步进器隐藏。
- 落地(成簇):新建以域名命名的簇 → 把这些标签移入并锁定(pin)→ 建/并入原生分组。与 opener 树升格、AI 建组同一套 `assignTab`。
- 不冲突:opener 树升格在 SW 端新标签事件里先跑;被它带走的标签已离开未分类,不再进同域统计。
- 负样本:从自动建的簇拖出标签沿用现有 `MOVE_TAB` 负样本逻辑,无需改动。

## 组件设计

### 类型 / 协议

- `shared/types.ts`:`Flags` 增加 `sameDomainPromoteSize: number`;`DEFAULT_FLAGS.sameDomainPromoteSize = 4`。
- `shared/messaging.ts`:
  - 命令 `{ type: 'SET_SAME_DOMAIN_PROMOTE_SIZE'; size: number }`
  - 命令 `{ type: 'PROMOTE_SAME_DOMAIN'; domain: string; tabIds: string[] }`
  - 两者加入 `COMMAND_TYPES`。

### 纯检测(`core/clustering/engine.ts`)

```ts
export interface DomainSuggestion { domain: string; tabIds: string[] }

/**
 * 未分类里同一注册域的活、未锁定标签达到 threshold 的建议。
 * existingNames:已有活跃命名簇的 name 集合,用于跳过同名域(防重复建簇)。
 * 按候选数降序;threshold < 2 视作 2。
 */
export function sameDomainSuggestions(
  inboxTabs: TabRecord[],
  existingNames: Set<string>,
  threshold: number,
): DomainSuggestion[]
```

纯函数:按 `registrableDomain` 聚合(跳过 `pinned` 与 `chromeTabId == null`),过滤 `count >= max(2, threshold)` 且 `!existingNames.has(domain)`,按 count 降序返回。

### 命令处理(`core/background/commands.ts`)

- 抽 helper(从 `APPLY_AI_PLAN` 的 newGroups 循环提取,两处共用):
  ```ts
  async function createClusterFromTabs(name, tabIds, repo, now): Promise<Context> {
    const created = await repo.createContext(name, now);
    for (const id of tabIds) await assignTab(id, created.id, repo, now);
    await syncGroupTitle(repo, created.id, name);
    return created;
  }
  ```
  `APPLY_AI_PLAN` 的 newGroups 循环改用它(DRY,行为不变)。
- `SET_SAME_DOMAIN_PROMOTE_SIZE`:`flags.patch({ sameDomainPromoteSize: clamp(size, 2, 20) })` + `onChange`。
- `PROMOTE_SAME_DOMAIN`:`createClusterFromTabs(cmd.domain, cmd.tabIds, ...)` + `onChange`。

### 建议 UI(`entrypoints/sidepanel/components/DomainPromoteSuggestions.tsx`,新)

照搬 `PortBindSuggestions` 结构:每条 `N 个 <域> · [成簇] [忽略]`。props:`suggestions: {domain, tabIds}[]`、`onPromote(domain, tabIds)`、`onIgnore(domain)`。

### App 接线(`entrypoints/sidepanel/App.tsx`)

- 会话状态 `ignoredDomains: Set<string>`(仿 `ignoredPorts`)。
- `domainSuggestions = useMemo(...)`:当 `flags.autoCluster` 时,取活未分类标签调 `sameDomainSuggestions(looseTabs, activeNamedNames, flags.sameDomainPromoteSize)`,再滤掉 `ignoredDomains`。
- 渲染 `<DomainPromoteSuggestions>`(紧邻 `PortBindSuggestions`)。
- `promoteDomain(domain, tabIds)` → `dispatch({type:'PROMOTE_SAME_DOMAIN', domain, tabIds})`。
- `ignoreDomain(domain)` → 加入 `ignoredDomains`。

### 设置(`entrypoints/sidepanel/components/SettingsPanel.tsx`)

`autoCluster` 开时,其下显示一行步进器:`同域成簇建议 · 阈值 N`,`[−] N [+]`(2–8),改动 → `onSetSameDomainSize(n)` → 命令。autoCluster 关时隐藏。

## 测试

- `sameDomainSuggestions`:阈值边界(=threshold 命中、<threshold 不命中)、`pinned`/非活标签排除、同名簇去重、多域并存、按 count 降序、threshold<2 兜底为 2。
- 命令集成:`PROMOTE_SAME_DOMAIN` 建簇 + 移入 + 成组 + 标签离开未分类;`SET_SAME_DOMAIN_PROMOTE_SIZE` 持久化 + clamp;`APPLY_AI_PLAN` 经重构后行为不变(现有测试守住)。

## 非目标(YAGNI)

- 不做"并入已有同域簇"(仅新建;同名簇则不建议)。
- 不做通用域黑名单/IDF 排除(用户明确不要)。
- 阈值不做 per-域 差异化;不做时间窗(同域是"就是同站"信号,与时间无关)。
- 不把 staleDays/discardAfterMinutes 一并改成可调(超范围,另议)。
