# 抛光批次:Bitbucket 标题清洗 + memo 修正 + App 拆钩子 + 弹窗可访问性 — 设计

日期:2026-07-15
状态:已通过设计评审,待实现

四项互相独立的优化,合并为一份 spec、各自独立任务。

## #1 Bitbucket 标题清洗

现状:`TabRow` 命中 Bitbucket 时显示**原始标题**(GitHub 有 `cleanGitHubTitle` 剥长尾)。已确认 Bitbucket Cloud PR 标签页标题格式:

```
fix(hermes): …stop truncating — ai-skills-library — Bitbucket
```

即 `{标题} — {repo} — Bitbucket`(分隔符 em-dash;尾部不含编号、不含 workspace)。

**改动:**
- `shared/bitbucket.ts` 新增 `cleanBitbucketTitle(title: string, ref: BitbucketRef): string`:
  剥掉结尾 `\s*[—–]\s*{repo}\s*[—–]\s*Bitbucket\s*$`(`{repo}` 用 `ref.repo` 正则转义;`[—–]` 容忍 em/en dash;大小写不敏感)。剥离后为空则返回原标题。匹配不上**原样返回**(绝不误删),与 `cleanGitHubTitle` 一致。
- `entrypoints/sidepanel/components/TabRow.tsx`:`displayTitle` 增加 Bitbucket 分支:
  ```ts
  const displayTitle = project
    ?? (gh ? cleanGitHubTitle(tab.title, gh)
       : bb ? cleanBitbucketTitle(tab.title, bb)
       : tab.title);
  ```
  import 增加 `cleanBitbucketTitle`。

**测试**(`tests/bitbucket.test.ts`):真实 PR 标题剥成 `fix(hermes): …stop truncating`;尾部不匹配(如普通标题)原样返回;仅剩尾部时返回原标题。

## #2 staleRecords memo 空转

现状:`App.tsx` `const now = Date.now()`(约 185 行)每次渲染都变,又进 `staleRecords` 的 `useMemo` 依赖 → memo 每次渲染都重算(等于没 memo)。

**改动:** 把该行改为按分钟取整:
```ts
// 陈旧按「天」判定,时间取到分钟即可 —— 让下面的 memo 真正生效(每分钟至多重算一次)
const now = Math.floor(Date.now() / 60_000) * 60_000;
```
`now` 值每分钟才变一次 → memo 依赖稳定 → 真正缓存。`now` 也传给 `StaleGroup`(年龄标签按天/时,分钟精度足够)。纯性能等价,无新测试;以 tsc + build 验。

## #3 App.tsx 拆钩子

现状:`App.tsx` 618 行(命令派发 + 派生 memo + 效果 + JSX 全堆一处),且因过大没有组件测试。

**目标:** 抽出内聚的自定义 hook 到 `entrypoints/sidepanel/hooks/`,App 只留装配 + JSX(目标 ~250 行)。**纯搬移、零行为变化。**

**hook 边界(每个是机械搬移,接口明确):**
- `useFlash(): { flash: string | null; showFlash: (msg: string) => void }` —— flash toast 的 state + 计时器(现 `flash`/`flashTimer`/`showFlash`)。
- `useAiActions({ showFlash }): { ai, aiBusy, aiPlan, setAiPlan, aiOrganize, applyAiPlan, aiSuggestName, saveAi, testAi }` —— AI 相关 state 与动作(现 `aiBusy`/`aiPlan`/`aiOrganize`/`applyAiPlan`/`aiSuggestName`/`saveAi`/`testAi`;`ai` 仍来自 store)。
- `useDraftNaming({ createDispatch }): { editingId, setEditingId, draftId, createContext, commitName, cancelEdit }` —— 改名/草稿 UX(现 `editingId`/`draftId`/`createContext`/`commitName`/`cancelEdit`)。
- `useDerived(contexts, tabs, flags, portMappings, now, ignoredPorts, ignoredDomains): {...}` —— 派生 memo(`tabsById`/`staleRecords`/`staleIds`/`dupMarks`/`redundant`/`portMap`/`portSuggestions`/`domainSuggestions`/`starredTabs`/`activeContexts`/`archivedContexts`/`inbox`/`tabsOf`/各计数)。

**约束:** 每个 hook 是把现有逻辑原样搬入 + 返回原值,App 用返回值替换本地定义。**不改任何行为/顺序/依赖数组内容**(#2 的 memo 修正在本任务前已合入)。

**风险与验证:** App 无组件测试 → 只能靠 `tsc --noEmit` + `pnpm build` + **手动过一遍面板**。因此本项**分多个小任务**(一个 hook 一个任务),每步独立可回滚。

## #4 弹窗可访问性 + 图标补齐

现状:`AIPlanDialog` / `ExportDialog` 无 Esc、无 role/aria-modal、无焦点管理;`SearchOverlay` / `SettingsPanel` 已有 Esc,但缺 role/aria-modal/焦点陷阱。

**改动:**
- 新增共享 hook `entrypoints/sidepanel/hooks/useDialog.ts`:`useDialog(ref: RefObject<HTMLElement>, onClose: () => void, opts?: { esc?: boolean }): void`
  - 挂载时记住 `document.activeElement`,把焦点移到容器(或容器内首个可聚焦元素)。
  - 监听 `keydown`:`opts.esc !== false` 时 `Escape` → `onClose()`;`Tab` → 在容器内可聚焦元素间循环(焦点陷阱)。
  - 卸载时把焦点还给之前记住的元素。
- 四个弹窗的 panel 容器:加 `role="dialog"`、`aria-modal="true"`、`aria-label`(如「AI 整理建议」「导出任务」「搜索」「设置」),挂 `ref` 并调用 `useDialog`:
  - `AIPlanDialog` / `ExportDialog` / `SettingsPanel`:`useDialog(ref, onClose)`(默认 `esc: true`),并移除各自 ad-hoc 的 Esc 逻辑(改由 useDialog 统一处理)。
  - `SearchOverlay`:`useDialog(ref, onClose, { esc: false })` —— **保留**其输入框 `onKeyDown` 里「有输入先清空、否则关闭」的既有 Esc 语义,useDialog 只提供焦点陷阱/恢复与 role/aria-modal。这样 Esc 语义不冲突。
- 补齐任何遗漏的纯图标按钮 `aria-label`(粗查已很少;实现时扫一遍 `title=` 且无可见文字的 button)。

**测试**(RTL + jsdom):
- `tests/use-dialog.test.tsx`(或就近组件测试):渲染一个用 `useDialog` 的容器,按 Escape → `onClose` 被调用;容器有 `role="dialog"` 与 `aria-modal`。
- 至少一个弹窗组件测试:渲染 → 按 Escape → onClose 调用;panel 有 role/aria-label。

## 提交/任务计划(概览,详见 plan)

1. `feat(bitbucket): 标题清洗剥掉 — repo — Bitbucket 尾`(#1)
2. `perf(sidepanel): staleRecords 时间按分钟取整,memo 真正生效`(#2)
3. `refactor(sidepanel): 抽 useDialog + 弹窗 a11y(role/aria-modal/焦点陷阱/Esc)`(#4)
4. `refactor(sidepanel): App 抽 useFlash/useAiActions/useDraftNaming/useDerived`(#3,可拆多步)

(顺序:#1、#2、#4 先做(独立、低风险);#3 放最后,单独小步,便于隔离风险。)
