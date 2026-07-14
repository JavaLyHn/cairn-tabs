# 同域升格(F-07 收尾)实现计划

> 设计见 `docs/superpowers/specs/2026-07-14-cairn-tabs-same-domain-promote-design.md`。
> 强耦合、同一会话内联实现,按层提交。

**Goal:** 未分类里同域标签够阈值 → 建议条 →「成簇」新建命名簇。阈值可调。

## Global Constraints

- 候选 = 未分类 + 活(chromeTabId!=null)+ 未 pinned。
- 分组键 `registrableDomain(hostnameOf(url))`。阈值默认 4,存储 clamp 2–20,UI 步进 2–8。
- 不跳过通用域;唯一去重:已有同名活跃簇则不建议。
- 建议(非自动);门控于 `flags.autoCluster`;忽略是会话级。
- 成簇复用 `assignTab`;`APPLY_AI_PLAN` 与新命令共用 `createClusterFromTabs` helper。

## 执行顺序(每步 `pnpm test` + `pnpm compile`)

### 提交 1:类型 + 纯检测 + 命令(含测试)
- `shared/types.ts`:`Flags.sameDomainPromoteSize`;`DEFAULT_FLAGS`。
- `shared/messaging.ts`:`SET_SAME_DOMAIN_PROMOTE_SIZE`、`PROMOTE_SAME_DOMAIN` + `COMMAND_TYPES`。
- `core/clustering/engine.ts`:`DomainSuggestion` + `sameDomainSuggestions`。
- `core/background/commands.ts`:抽 `createClusterFromTabs`;`APPLY_AI_PLAN` 改用它;`SET_SAME_DOMAIN_PROMOTE_SIZE`、`PROMOTE_SAME_DOMAIN` 两 case。
- 测试:`tests/same-domain.test.ts`(纯函数);扩 `tests/ai-apply.integration.test.ts` 或新增命令集成测试(PROMOTE + SET size)。

### 提交 2:UI(建议条 + App + 设置步进器)
- 新 `entrypoints/sidepanel/components/DomainPromoteSuggestions.tsx`(照搬 PortBindSuggestions)。
- `entrypoints/sidepanel/App.tsx`:`ignoredDomains` 状态、`domainSuggestions` useMemo、渲染、`promoteDomain`/`ignoreDomain`;设置传 `onSetSameDomainSize`。
- `entrypoints/sidepanel/components/SettingsPanel.tsx`:autoCluster 下的阈值步进器行。

### 提交 3:README
- README 的 F-07 条目补「同域成簇建议(阈值可调)」。

## 验证
- `pnpm test`(新用例全过,现有 ai-apply 测试仍绿)
- `pnpm compile`、`pnpm build`
