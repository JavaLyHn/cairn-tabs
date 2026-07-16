# 抛光批次 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 四项独立优化:Bitbucket 标题清洗、staleRecords memo 修正、弹窗可访问性(useDialog)、App.tsx 拆钩子。

**Architecture:** #1 纯函数 + TabRow 接线;#2 一行时间取整;#4 新增共享 `useDialog` hook 接入四个弹窗;#3 把 App 的 state/动作/派生逻辑机械搬进自定义 hook(零行为变化)。

**Tech Stack:** React 19 + TypeScript strict、Tailwind、Vitest + @testing-library/react/jsdom。Spec:`docs/superpowers/specs/2026-07-15-polish-batch-design.md`。

## Global Constraints

- 语言:用户可见文案、注释、提交信息用中文。
- 提交信息结尾必须是:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 架构不变式:SW 唯一写方;UI 只发 Command;DB 只经 repositories。本批不新增命令、不改后端行为。
- TypeScript strict(noUncheckedIndexedAccess);不引入新依赖。
- 组件测试文件顶部加 `// @vitest-environment jsdom`;类/属性断言用字符串包含或 `getByRole`。
- 命令用 `pnpm`(`pnpm test`、`pnpm exec tsc --noEmit`、`pnpm build`)。
- **#3 特别约束**:App.tsx 无组件测试,拆钩子必须是**纯搬移、零行为变化**——每步只移动命名符号、返回原值,不改逻辑/顺序/依赖数组;以 `tsc --noEmit` + `pnpm build` 为门禁。

---

### Task 1: Bitbucket 标题清洗

**Files:**
- Modify: `shared/bitbucket.ts`(新增 `escapeRe` + `cleanBitbucketTitle`)
- Modify: `entrypoints/sidepanel/components/TabRow.tsx`(displayTitle 加 Bitbucket 分支)
- Test: `tests/bitbucket.test.ts`

**Interfaces:**
- Produces: `cleanBitbucketTitle(title: string, ref: BitbucketRef): string`

- [ ] **Step 1: 写失败测试**

在 `tests/bitbucket.test.ts` 末尾追加(顶部 import 增加 `cleanBitbucketTitle`):

```ts
describe('cleanBitbucketTitle', () => {
  const pr = parseBitbucket('https://bitbucket.org/antalphadev/ai-skills-library/pull-requests/1022')!;
  it('剥掉「— repo — Bitbucket」尾', () => {
    const raw = 'fix(hermes): set default so requests stop truncating — ai-skills-library — Bitbucket';
    expect(cleanBitbucketTitle(raw, pr)).toBe('fix(hermes): set default so requests stop truncating');
  });
  it('尾部不匹配 → 原样返回', () => {
    expect(cleanBitbucketTitle('普通标题没有尾', pr)).toBe('普通标题没有尾');
  });
  it('剥完为空 → 返回原标题', () => {
    const raw = '— ai-skills-library — Bitbucket';
    expect(cleanBitbucketTitle(raw, pr)).toBe(raw);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test bitbucket`
Expected: FAIL —— `cleanBitbucketTitle` 未导出。

- [ ] **Step 3: 实现**

在 `shared/bitbucket.ts` 末尾追加(镜像 github.ts 的 `escapeRe`):

```ts
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 Bitbucket 标签页标题剥掉固定尾部,只留真正标题。
 *   "fix: X — my-repo — Bitbucket" → "fix: X"
 * 尾部锚定「— repo — Bitbucket」(em/en dash 均可);匹配不上则原样返回(不猜、不误删)。
 */
export function cleanBitbucketTitle(title: string, ref: BitbucketRef): string {
  const t = (title || '').trim();
  const tail = new RegExp(`\\s*[—–]\\s*${escapeRe(ref.repo)}\\s*[—–]\\s*Bitbucket\\s*$`, 'i');
  const stripped = t.replace(tail, '').trim();
  return stripped || t;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test bitbucket`
Expected: PASS。

- [ ] **Step 5: TabRow 接线**

在 `entrypoints/sidepanel/components/TabRow.tsx`:import 行(现 `import { parseBitbucket, bitbucketBadgeLabel, bitbucketRepoSlug } from '@/shared/bitbucket';`)增加 `cleanBitbucketTitle`。把 `displayTitle`(约 104 行)改为:

```ts
  const displayTitle =
    project ??
    (gh ? cleanGitHubTitle(tab.title, gh) : bb ? cleanBitbucketTitle(tab.title, bb) : tab.title);
```

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 均通过。

- [ ] **Step 7: 提交**

```bash
git add shared/bitbucket.ts entrypoints/sidepanel/components/TabRow.tsx tests/bitbucket.test.ts
git commit -m "$(cat <<'EOF'
feat(bitbucket): 标题清洗剥掉「— repo — Bitbucket」尾

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: staleRecords memo 按分钟取整

**Files:**
- Modify: `entrypoints/sidepanel/App.tsx`(1 行)

**Interfaces:** 无。

- [ ] **Step 1: 改 now 取整**

在 `entrypoints/sidepanel/App.tsx`,把:

```ts
  const now = Date.now();
```

改为:

```ts
  // 陈旧按「天」判定,时间取到分钟即可 —— 让下面 staleRecords 的 useMemo 真正生效(每分钟至多重算一次)
  const now = Math.floor(Date.now() / 60_000) * 60_000;
```

(该 `now` 同时用于 `staleRecords` memo 与传给 `StaleGroup` 的 `now` prop;分钟精度对「x 天前/x 小时前」年龄标签足够。)

- [ ] **Step 2: 类型检查 + 构建 + 全量测试**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: 均通过(纯性能等价,无新测试)。

- [ ] **Step 3: 提交**

```bash
git add entrypoints/sidepanel/App.tsx
git commit -m "$(cat <<'EOF'
perf(sidepanel): staleRecords 时间按分钟取整,useMemo 真正生效

原 now=Date.now() 每次渲染都变,进了 memo 依赖 → 每次渲染都重算陈旧列表。
陈旧按天判定,取到分钟足够;now 每分钟才变一次,memo 得以缓存。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 共享 useDialog + 四个弹窗可访问性

**Files:**
- Create: `entrypoints/sidepanel/hooks/useDialog.ts`
- Test: `tests/use-dialog.test.tsx`
- Modify: `AIPlanDialog.tsx` / `ExportDialog.tsx` / `SettingsPanel.tsx` / `SearchOverlay.tsx`

**Interfaces:**
- Produces: `useDialog(ref: React.RefObject<HTMLElement | null>, onClose: () => void, opts?: { esc?: boolean }): void`

- [ ] **Step 1: 写失败测试**

新建 `tests/use-dialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useRef } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useDialog } from '@/entrypoints/sidepanel/hooks/useDialog';

afterEach(cleanup);

function Dialog({ onClose, esc }: { onClose: () => void; esc?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose, { esc });
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="测试弹窗">
      <button>里面的按钮</button>
    </div>
  );
}

describe('useDialog', () => {
  it('按 Esc → onClose', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('esc:false → 按 Esc 不关闭', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} esc={false} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
  it('容器有 dialog role 与 aria-modal', () => {
    render(<Dialog onClose={() => {}} />);
    const d = screen.getByRole('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('测试弹窗');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test use-dialog`
Expected: FAIL —— `@/entrypoints/sidepanel/hooks/useDialog` 不存在。

- [ ] **Step 3: 实现 useDialog**

新建 `entrypoints/sidepanel/hooks/useDialog.ts`:

```ts
import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/**
 * 弹窗可访问性:Esc 关闭(可关)、打开聚焦、Tab 焦点陷阱、关闭恢复焦点。
 * 用法:容器加 role="dialog" aria-modal aria-label 并挂 ref,调用 useDialog(ref, onClose)。
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts: { esc?: boolean } = {},
): void {
  const esc = opts.esc !== false;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // 打开:聚焦容器内首个可聚焦元素,否则聚焦容器本身
    const first = el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus?.();

    const onKey = (e: KeyboardEvent) => {
      if (esc && e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (n) => n.offsetParent !== null || n === document.activeElement,
        );
        if (items.length === 0) return;
        const firstEl = items[0]!;
        const lastEl = items[items.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.(); // 关闭:焦点还回去
    };
  }, [ref, onClose, esc]);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test use-dialog`
Expected: PASS(3 用例)。

- [ ] **Step 5: 接入 AIPlanDialog**

`entrypoints/sidepanel/components/AIPlanDialog.tsx`:import 增加 `import { useRef } from 'react';`(若已 import react 其他项则合并)与 `import { useDialog } from '../hooks/useDialog';`。组件体内加 `const panelRef = useRef<HTMLDivElement>(null); useDialog(panelRef, onClose);`。把内层 panel `<div>`(约 82 行、`className="mt-6 w-[92%] ..."`、带 `onClick={(e) => e.stopPropagation()}`)加上:`ref={panelRef} role="dialog" aria-modal="true" aria-label="AI 整理建议" tabIndex={-1}`。

- [ ] **Step 6: 接入 ExportDialog**

`entrypoints/sidepanel/components/ExportDialog.tsx`:同样 import `useRef` + `useDialog`;体内 `const panelRef = useRef<HTMLDivElement>(null); useDialog(panelRef, onClose);`;内层 panel `<div>`(约 87 行)加 `ref={panelRef} role="dialog" aria-modal="true" aria-label="导出任务" tabIndex={-1}`。

- [ ] **Step 7: 接入 SettingsPanel(替换 ad-hoc Esc)**

`entrypoints/sidepanel/components/SettingsPanel.tsx`:删除现有的 Esc `useEffect`(约 155-166 行那段 `window.addEventListener('keydown', onKey)` 用于 Escape 的块);import `useRef`(与现有 `useState/useEffect` 合并)+ `import { useDialog } from '../hooks/useDialog';`。体内加 `const panelRef = useRef<HTMLDivElement>(null); useDialog(panelRef, onClose);`。最外层 `<div className="settings-sheet absolute inset-0 z-30 ...">` 加 `ref={panelRef} role="dialog" aria-modal="true" aria-label="设置" tabIndex={-1}`。

- [ ] **Step 8: 接入 SearchOverlay(esc:false,保留输入框 Esc 语义)**

`entrypoints/sidepanel/components/SearchOverlay.tsx`:import `useDialog`。体内加(用已有的容器 ref 或新建)`const panelRef = useRef<HTMLDivElement>(null); useDialog(panelRef, onClose, { esc: false });`。给最外层容器 `<div>`(overlay 根)加 `ref={panelRef} role="dialog" aria-modal="true" aria-label="搜索" tabIndex={-1}`。**保留**现有 `onKeyDown` 里的 Escape 分支不动(输入框级「先清空/关闭」语义)。注意:`inputRef` 已存在且挂载即聚焦;`useDialog` 的初始聚焦会选到输入框(首个可聚焦),不冲突。

- [ ] **Step 9: 补一个弹窗组件测试(Esc 关闭)**

在 `tests/` 新增或就近追加(如 `tests/export-dialog.test.tsx`,若无则建):渲染 `ExportDialog`(传最小 props),按 Escape → onClose 调用;`getByRole('dialog')` 存在且 `aria-label` 为「导出任务」。若构造 props 成本高,则以 `use-dialog.test.tsx` 的覆盖为准、此步可省(实现者判断,但至少保证 use-dialog 测试覆盖 Esc/role)。

- [ ] **Step 10: 类型检查 + 全量测试 + 构建**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: 均通过。

- [ ] **Step 11: 提交**

```bash
git add entrypoints/sidepanel/hooks/useDialog.ts tests/use-dialog.test.tsx entrypoints/sidepanel/components/AIPlanDialog.tsx entrypoints/sidepanel/components/ExportDialog.tsx entrypoints/sidepanel/components/SettingsPanel.tsx entrypoints/sidepanel/components/SearchOverlay.tsx tests/export-dialog.test.tsx 2>/dev/null || git add entrypoints/sidepanel/hooks/useDialog.ts tests/use-dialog.test.tsx entrypoints/sidepanel/components/AIPlanDialog.tsx entrypoints/sidepanel/components/ExportDialog.tsx entrypoints/sidepanel/components/SettingsPanel.tsx entrypoints/sidepanel/components/SearchOverlay.tsx
git commit -m "$(cat <<'EOF'
feat(a11y): 弹窗共享 useDialog(role/aria-modal/焦点陷阱/Esc/恢复焦点)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: App 抽 useFlash

**Files:**
- Create: `entrypoints/sidepanel/hooks/useFlash.ts`
- Modify: `entrypoints/sidepanel/App.tsx`

**Interfaces:**
- Produces: `useFlash(): { flash: string | null; showFlash: (msg: string) => void }`

- [ ] **Step 1: 建 useFlash(把 App 的 flash 逻辑原样搬入)**

新建 `entrypoints/sidepanel/hooks/useFlash.ts`,把 App 里 `flash`/`flashTimer`/`showFlash` 三者原样移入:

```ts
import { useRef, useState } from 'react';

/** 底部一过性提示 toast(1.8s 自动消失)。 */
export function useFlash(): { flash: string | null; showFlash: (msg: string) => void } {
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1800);
  };
  return { flash, showFlash };
}
```

- [ ] **Step 2: App 改用 useFlash**

在 `App.tsx`:删除 `flash`/`flashTimer`/`showFlash` 的本地定义;加 `const { flash, showFlash } = useFlash();`(import `import { useFlash } from './hooks/useFlash';`)。其余引用 `flash`/`showFlash` 处不变。

- [ ] **Step 3: 类型检查 + 构建 + 全量测试**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: 均通过(纯搬移)。

- [ ] **Step 4: 提交**

```bash
git add entrypoints/sidepanel/hooks/useFlash.ts entrypoints/sidepanel/App.tsx
git commit -m "$(cat <<'EOF'
refactor(sidepanel): 抽 useFlash

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: App 抽 useAiActions

**Files:**
- Create: `entrypoints/sidepanel/hooks/useAiActions.ts`
- Modify: `entrypoints/sidepanel/App.tsx`

**Interfaces:**
- Consumes: `showFlash`(Task 4);`ai`(来自 store)。
- Produces: `useAiActions({ showFlash }): { aiBusy, aiPlan, setAiPlan, aiOrganize, applyAiPlan, aiSuggestName, saveAi, testAi }`

- [ ] **Step 1: 建 useAiActions(原样搬入 App 的 AI 逻辑)**

新建 `entrypoints/sidepanel/hooks/useAiActions.ts`,把 App 里这些**原样**移入并返回:`aiPlan`(useState)、`aiBusy`(useState)、`aiOrganize`、`applyAiPlan`、`aiSuggestName`、`saveAi`、`testAi`。签名:

```ts
export function useAiActions(deps: { showFlash: (msg: string) => void }): {
  aiBusy: boolean;
  aiPlan: { plan: AIPlan; tabs: TabRecord[] } | null;
  setAiPlan: (v: { plan: AIPlan; tabs: TabRecord[] } | null) => void;
  aiOrganize: () => Promise<void>;
  applyAiPlan: (plan: AIPlan) => void;
  aiSuggestName: (contextId: string) => Promise<string | null>;
  saveAi: (provider: AIProviderId, key: string | undefined, model: string, baseUrl?: string) => Promise<void>;
  testAi: () => Promise<{ ok: boolean; detail: string }>;
}
```

move 内容保持逐字不变(含 `dispatch`、`permissionOriginFor`、`chrome.permissions.request`、各 `showFlash(...)` 调用、错误映射表)。所需 import(`dispatch`、`AIPlan`/`AIProviderId`/`TabRecord` 类型、`permissionOriginFor`)一并搬入本文件。`applyAiPlan` 内的 `showFlash('已应用 AI 整理')` 用 `deps.showFlash`。

- [ ] **Step 2: App 改用 useAiActions**

在 `App.tsx`:删除上述本地定义;加
```ts
const { aiBusy, aiPlan, setAiPlan, aiOrganize, applyAiPlan, aiSuggestName, saveAi, testAi } =
  useAiActions({ showFlash });
```
(import hook)。若 App 里已不再直接用 `permissionOriginFor` / `AIProviderId`,移除其孤立 import(以 tsc 报错为准清理)。其余引用不变。

- [ ] **Step 3: 类型检查 + 构建 + 全量测试**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: 均通过。

- [ ] **Step 4: 提交**

```bash
git add entrypoints/sidepanel/hooks/useAiActions.ts entrypoints/sidepanel/App.tsx
git commit -m "$(cat <<'EOF'
refactor(sidepanel): 抽 useAiActions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: App 抽 useDraftNaming

**Files:**
- Create: `entrypoints/sidepanel/hooks/useDraftNaming.ts`
- Modify: `entrypoints/sidepanel/App.tsx`

**Interfaces:**
- Produces: `useDraftNaming(): { editingId, setEditingId, draftId, createContext, commitName, cancelEdit }`
  - `editingId: string | null`;`setEditingId: (id: string | null) => void`;`draftId: string | null`;
  - `createContext: () => Promise<void>`;`commitName: (c: Context, value: string) => void`;`cancelEdit: (c: Context) => void`

- [ ] **Step 1: 建 useDraftNaming(原样搬入)**

新建 `entrypoints/sidepanel/hooks/useDraftNaming.ts`,把 App 里 `editingId`/`draftId`(两个 useState)、`createContext`、`commitName`、`cancelEdit` **原样**移入并返回。这些内部用到的 `rename`/`del`(即 `dispatch({type:'RENAME_CONTEXT'...})` / `dispatch({type:'DELETE_CONTEXT'...})`)与 `dispatch({type:'CREATE_CONTEXT'...})`:在 hook 内直接用 `dispatch`(从 `../store` import),保持逐字逻辑不变。`Context` 类型从 `@/shared/types` import。

- [ ] **Step 2: App 改用 useDraftNaming**

`App.tsx`:删除上述本地定义;加 `const { editingId, setEditingId, draftId, createContext, commitName, cancelEdit } = useDraftNaming();`(import hook)。App 里若仍单独用 `rename`/`del` 于别处,保留其本地定义(commitName/cancelEdit 已自带);以 tsc 报错清理孤立符号。

- [ ] **Step 3: 类型检查 + 构建 + 全量测试**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: 均通过。

- [ ] **Step 4: 提交**

```bash
git add entrypoints/sidepanel/hooks/useDraftNaming.ts entrypoints/sidepanel/App.tsx
git commit -m "$(cat <<'EOF'
refactor(sidepanel): 抽 useDraftNaming(改名/草稿)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: App 抽 useDerived(派生 memo,最大/最后)

**Files:**
- Create: `entrypoints/sidepanel/hooks/useDerived.ts`
- Modify: `entrypoints/sidepanel/App.tsx`

**Interfaces:**
- Consumes: `contexts, tabs, flags, portMappings`(store)、`now`(number)、`ignoredPorts: Set<number>`、`ignoredDomains: Set<string>`(App state)。
- Produces: `useDerived(args)` 返回对象,含:`tabsById`、`staleRecords`、`staleIds`、`tabsOf`、`inbox`、`activeContexts`、`archivedContexts`、`starredTabs`、`openTabCount`、`archivedTabCount`、`isEmpty`、`dupMarks`、`redundant`、`portMap`、`portSuggestions`、`domainSuggestions`。

> 风险最高的一步(宽接口 + `tabsOf` 闭包 `staleIds`、`portSuggestions/domainSuggestions` 闭包 `ignoredPorts/ignoredDomains`)。**逐字搬移**,依赖数组一字不改。App 无组件测试,靠 tsc/build + 手动。

- [ ] **Step 1: 建 useDerived(原样搬入所有派生逻辑)**

新建 `entrypoints/sidepanel/hooks/useDerived.ts`。签名:
```ts
export function useDerived(args: {
  contexts: Context[];
  tabs: TabRecord[];
  flags: Flags;
  portMappings: PortMapping[];
  now: number;
  ignoredPorts: Set<number>;
  ignoredDomains: Set<string>;
}): {
  tabsById: Map<string, TabRecord>;
  staleRecords: TabRecord[];
  staleIds: Set<string>;
  tabsOf: (ctx: Context) => TabRecord[];
  inbox: Context | undefined;
  activeContexts: Context[];
  archivedContexts: Context[];
  starredTabs: TabRecord[];
  openTabCount: number;
  archivedTabCount: number;
  isEmpty: boolean;
  dupMarks: ReturnType<typeof duplicateMarks>;
  redundant: number;
  portMap: Record<number, string>;
  portSuggestions: { port: number; name: string }[];
  domainSuggestions: ReturnType<typeof sameDomainSuggestions>;
}
```
把 App 里对应的 `useMemo`/派生 const/`tabsOf` 函数**逐字**移入(依赖数组、排序、filter 全部不变),用 `args.xxx` 替换原本直接引用的 `contexts/tabs/flags/portMappings/now/ignoredPorts/ignoredDomains`。所需 import(`useMemo`、`INBOX_ID`、`duplicateMarks`/`redundantCount`、`buildPortMap`/`localhostPort`/`suggestProjectName`、`sameDomainSuggestions`、`staleTabs`、类型)搬入本文件。返回全部值。

- [ ] **Step 2: App 改用 useDerived**

`App.tsx`:删除上述所有本地派生定义;加
```ts
const {
  tabsById, staleRecords, staleIds, tabsOf, inbox, activeContexts, archivedContexts,
  starredTabs, openTabCount, archivedTabCount, isEmpty, dupMarks, redundant,
  portMap, portSuggestions, domainSuggestions,
} = useDerived({ contexts, tabs, flags, portMappings, now, ignoredPorts, ignoredDomains });
```
(import hook)。清理因搬移而孤立的 import(以 tsc 报错为准)。其余 JSX/引用不变。

- [ ] **Step 3: 类型检查 + 构建 + 全量测试**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: 均通过(纯搬移)。

- [ ] **Step 4: 提交**

```bash
git add entrypoints/sidepanel/hooks/useDerived.ts entrypoints/sidepanel/App.tsx
git commit -m "$(cat <<'EOF'
refactor(sidepanel): 抽 useDerived(派生 memo)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 最终验证

- [ ] `pnpm test` 全绿(原 223 + 新增约 6 个用例)。
- [ ] `pnpm exec tsc --noEmit` 无错误。
- [ ] `pnpm build` 成功。
- [ ] `wc -l entrypoints/sidepanel/App.tsx` 明显下降(目标 ~350 行内)。
- [ ] 手动 #1:打开 Bitbucket PR 标签 → 标题只剩真正标题(尾部 `— repo — Bitbucket` 被剥)。
- [ ] 手动 #4:每个弹窗(AI 计划 / 导出 / 搜索 / 设置)按 Esc 能关;Tab 在弹窗内循环;关后焦点回到触发处。
- [ ] 手动 #3:面板整体行为无变化(新建/改名/AI 整理/flash 提示照常)。
