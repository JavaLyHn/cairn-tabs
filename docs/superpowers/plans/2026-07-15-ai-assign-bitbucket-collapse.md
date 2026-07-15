# AI 并入已有任务 + Bitbucket 徽章 + 一键折叠 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三个独立功能:(A) AI 整理时给 AI 附上已有任务的域名/示例以判断并入;(B) Bitbucket PR/Issue 徽章(对等 GitHub);(C) 一键展开/折叠活跃任务+未分类。

**Architecture:** A 只改 AI 整理的 prompt 输入(纯函数摘要 + handler 组装),UI 不变。B 新增 `shared/bitbucket.ts` 纯 URL 解析,TabRow 复用现有徽章。C 用 App 的一个布尔驱动各组的本地折叠(effect 同步),归档组不受控。

**Tech Stack:** React 19 + TypeScript strict、Tailwind、Vitest + @testing-library/react/jsdom。三份 spec 见 `docs/superpowers/specs/2026-07-15-{ai-assign-existing-tasks,bitbucket-badge,collapse-expand-all}-design.md`。

## Global Constraints

- 语言:用户可见文案、注释、提交信息用中文。
- 提交信息结尾必须是:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 架构不变式:SW 是唯一写方;UI 只发 Command;DB 只经 repositories。本计划不新增命令。
- 隐私(F-13):key 只在 SW;只「标签标题 + eTLD+1 域名 + 任务名」可出网,绝不发完整 URL / query / 页面内容。任务 A 新增出网内容仍在此集合内。
- 组件测试文件顶部加 `// @vitest-environment jsdom`;颜色/类断言用 `className` 字符串包含(仓库未配置 jest-dom)。
- 命令用 `pnpm`;不引入新依赖。

---

### Task 1: AI 整理附上已有任务的域名/示例(功能 A)

**Files:**
- Modify: `core/ai/organize.ts`(新增 `summarizeTaskTabs` + `TaskSignals`;扩展 `OrganizeTask`;`buildOrganizePrompt` 带上 domains/samples + 系统提示加一行)
- Modify: `core/background/commands.ts`(`AI_ORGANIZE_INBOX` 为每个已有任务算信号传入)
- Test: `tests/ai-organize.test.ts`(新增 summarizeTaskTabs 测试;更新既有 buildOrganizePrompt 调用)

**Interfaces:**
- Produces:
  - `interface TaskSignals { domains: string[]; samples: string[] }`
  - `function summarizeTaskTabs(tabs: { title: string; domain: string }[]): TaskSignals`
  - `interface OrganizeTask { id: string; name: string; domains: string[]; samples: string[] }`(新增两字段)

- [ ] **Step 1: 写失败测试 + 更新既有调用**

在 `tests/ai-organize.test.ts` 顶部 import 增加 `summarizeTaskTabs`:
```ts
import { buildOrganizePrompt, parseOrganizeResponse, summarizeTaskTabs } from '@/core/ai/organize';
```
把既有 `buildOrganizePrompt` 用例(约第 9-12 行)里的任务参数改为带新字段:
```ts
    const { system, user } = buildOrganizePrompt(
      [{ id: 't1', title: 'React hooks', domain: 'react.dev' }],
      [{ id: 'c1', name: 'auth-service', domains: [], samples: [] }],
    );
```
在 `describe('buildOrganizePrompt', ...)` 之后新增:
```ts
describe('summarizeTaskTabs', () => {
  it('域名按频次取 top5、去重;标题取前 3', () => {
    const s = summarizeTaskTabs([
      { title: 'A', domain: 'x.com' },
      { title: 'B', domain: 'x.com' },
      { title: 'C', domain: 'y.com' },
      { title: 'D', domain: 'z1.com' },
      { title: 'E', domain: 'z2.com' },
      { title: 'F', domain: 'z3.com' },
      { title: 'G', domain: 'z4.com' },
    ]);
    expect(s.domains[0]).toBe('x.com'); // 频次最高在前
    expect(s.domains).toHaveLength(5); // 至多 5
    expect(s.samples).toEqual(['A', 'B', 'C']); // 前 3 标题
  });
  it('空输入 → 空', () => {
    expect(summarizeTaskTabs([])).toEqual({ domains: [], samples: [] });
  });
});
```
并在 `describe('buildOrganizePrompt', ...)` 里加一条:
```ts
  it('已有任务带上 domains 与 samples 供 AI 判断归属', () => {
    const { user } = buildOrganizePrompt(
      [{ id: 't1', title: 'x', domain: 'a.com' }],
      [{ id: 'c1', name: '任务', domains: ['react.dev'], samples: ['React 文档'] }],
    );
    expect(user).toContain('react.dev');
    expect(user).toContain('React 文档');
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test ai-organize`
Expected: FAIL —— `summarizeTaskTabs` 未导出;`OrganizeTask` 尚无 domains/samples(类型/断言不满足)。

- [ ] **Step 3: 实现 organize.ts**

在 `core/ai/organize.ts` 的 `OrganizeTask` 接口改为:
```ts
export interface OrganizeTask {
  id: string;
  name: string;
  domains: string[];
  samples: string[];
}
```
在 `OrganizeTask` 之后新增:
```ts
export interface TaskSignals {
  domains: string[];
  samples: string[];
}

/** 汇总一个任务里标签的内容信号:域名(按频次 top 5、去重)+ 示例标题(前 3)。供 AI 判断归属。 */
export function summarizeTaskTabs(tabs: { title: string; domain: string }[]): TaskSignals {
  const freq = new Map<string, number>();
  for (const t of tabs) {
    const d = t.domain.trim();
    if (d) freq.set(d, (freq.get(d) ?? 0) + 1);
  }
  const domains = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d]) => d);
  const samples = tabs.map((t) => t.title.trim()).filter((s) => s !== '').slice(0, 3);
  return { domains, samples };
}
```
在 `buildOrganizePrompt` 里,`existingTasks` 的映射改为带上新字段:
```ts
    existingTasks: tasks.map((t) => ({ id: t.id, name: t.name, domains: t.domains, samples: t.samples })),
```
并在 system 提示数组里,「明显属于某个已有任务时,优先并入该任务而不是新建同类分组。」这一行之后,新增一行:
```ts
    '- 判断是否并入已有任务时,参考该任务的 domains(域名)与 samples(示例标题)是否与标签一致。',
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test ai-organize`
Expected: PASS。

- [ ] **Step 5: handler 计算信号并传入**

在 `core/background/commands.ts` 顶部,把从 `@/core/ai/organize` 的 import 增加 `summarizeTaskTabs`(与 `buildOrganizePrompt` 等并列)。

`AI_ORGANIZE_INBOX` 里把 `buildOrganizePrompt(...)` 的第二个参数替换为带信号的版本:
```ts
      const { system, user } = buildOrganizePrompt(
        loose.map((t) => ({ id: t.id, title: t.title, domain: registrableDomain(hostnameOf(t.url)) })),
        tasks.map((c) => {
          const own = tabs.filter((t) => t.contextId === c.id);
          const sig = summarizeTaskTabs(
            own.map((t) => ({ title: t.title, domain: registrableDomain(hostnameOf(t.url)) })),
          );
          return { id: c.id, name: c.name, domains: sig.domains, samples: sig.samples };
        }),
      );
```
(`registrableDomain`、`hostnameOf` 已在该文件 import,用于 AI_SUGGEST_NAME。)

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 均通过。

- [ ] **Step 7: 提交**

```bash
git add core/ai/organize.ts core/background/commands.ts tests/ai-organize.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): 给 AI 整理附上已有任务的域名/示例,便于判断并入

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Bitbucket PR/Issue 纯 URL 解析(功能 B-1)

**Files:**
- Create: `shared/bitbucket.ts`
- Test: `tests/bitbucket.test.ts`

**Interfaces:**
- Produces:
  - `interface BitbucketRef { kind: 'pr' | 'issue'; workspace: string; repo: string; number: number }`
  - `function parseBitbucket(url: string): BitbucketRef | null`
  - `function bitbucketRepoSlug(ref: BitbucketRef): string` → `"workspace/repo"`
  - `function bitbucketBadgeLabel(ref: BitbucketRef): string` → `"PR #n"` / `"#n"`

- [ ] **Step 1: 写失败测试**

新建 `tests/bitbucket.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseBitbucket, bitbucketRepoSlug, bitbucketBadgeLabel } from '@/shared/bitbucket';

describe('parseBitbucket', () => {
  it('解析 PR', () => {
    expect(parseBitbucket('https://bitbucket.org/acme/app/pull-requests/42')).toEqual({
      kind: 'pr', workspace: 'acme', repo: 'app', number: 42,
    });
  });
  it('解析 Issue', () => {
    expect(parseBitbucket('https://bitbucket.org/acme/app/issues/7')).toEqual({
      kind: 'issue', workspace: 'acme', repo: 'app', number: 7,
    });
  });
  it('容忍子路径 / query / hash', () => {
    expect(parseBitbucket('https://bitbucket.org/acme/app/pull-requests/42/diff?x=1#c')?.number).toBe(42);
    expect(parseBitbucket('https://bitbucket.org/acme/app/issues/7/some-slug')?.kind).toBe('issue');
  });
  it('www.bitbucket.org 也识别', () => {
    expect(parseBitbucket('https://www.bitbucket.org/a/b/pull-requests/1')?.workspace).toBe('a');
  });
  it('非 bitbucket.org → null', () => {
    expect(parseBitbucket('https://github.com/a/b/pull/1')).toBeNull();
  });
  it('bitbucket.org 但非 PR/issue 路径 → null', () => {
    expect(parseBitbucket('https://bitbucket.org/acme/app/src/main')).toBeNull();
    expect(parseBitbucket('https://bitbucket.org/acme/app/pull-requests')).toBeNull(); // 无编号
  });
  it('非法 URL → null', () => {
    expect(parseBitbucket('not a url')).toBeNull();
  });
});

describe('bitbucketRepoSlug / bitbucketBadgeLabel', () => {
  const pr = parseBitbucket('https://bitbucket.org/acme/app/pull-requests/42')!;
  const issue = parseBitbucket('https://bitbucket.org/acme/app/issues/7')!;
  it('slug', () => expect(bitbucketRepoSlug(pr)).toBe('acme/app'));
  it('PR label', () => expect(bitbucketBadgeLabel(pr)).toBe('PR #42'));
  it('Issue label', () => expect(bitbucketBadgeLabel(issue)).toBe('#7'));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test bitbucket`
Expected: FAIL —— `@/shared/bitbucket` 不存在。

- [ ] **Step 3: 实现 shared/bitbucket.ts**

新建 `shared/bitbucket.ts`:
```ts
// Bitbucket Cloud PR/Issue 元数据 —— 纯 URL 解析(对等 GitHub F-09)。UI 与 SW 共用。
// 不调 API、不加权限、不发请求;只从 URL 稳定拿到「类型 + 编号 + workspace/repo」。

export interface BitbucketRef {
  kind: 'pr' | 'issue';
  workspace: string;
  repo: string;
  number: number;
}

/** 从 URL 解析 Bitbucket Cloud PR/Issue 引用;非此类链接返回 null。 */
export function parseBitbucket(url: string): BitbucketRef | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== 'bitbucket.org' && u.hostname !== 'www.bitbucket.org') return null;
  // /{workspace}/{repo}/(pull-requests|issues)/{number}[/...] —— 容忍子路径、query、hash
  const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull-requests|issues)\/(\d+)(?:\/|$)/);
  if (!m) return null;
  const [, workspace, repo, seg, num] = m; // 正则匹配 → 各捕获组必定存在
  return {
    kind: seg === 'pull-requests' ? 'pr' : 'issue',
    workspace: workspace!,
    repo: repo!,
    number: Number(num),
  };
}

/** "workspace/repo",悬停时替代 hostname 显示。 */
export function bitbucketRepoSlug(ref: BitbucketRef): string {
  return `${ref.workspace}/${ref.repo}`;
}

/** 徽章文案:PR 带 "PR" 前缀,Issue 只有 "#编号"(与 GitHub 一致)。 */
export function bitbucketBadgeLabel(ref: BitbucketRef): string {
  return ref.kind === 'pr' ? `PR #${ref.number}` : `#${ref.number}`;
}
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `pnpm test bitbucket && pnpm exec tsc --noEmit`
Expected: PASS;tsc 无错误。

- [ ] **Step 5: 提交**

```bash
git add shared/bitbucket.ts tests/bitbucket.test.ts
git commit -m "$(cat <<'EOF'
feat(bitbucket): 纯 URL 解析 Bitbucket Cloud PR/Issue

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 标签行显示 Bitbucket 徽章(功能 B-2)

**Files:**
- Modify: `entrypoints/sidepanel/components/TabRow.tsx`
- Test: `tests/tab-row.test.tsx`

**Interfaces:**
- Consumes: `parseBitbucket`、`bitbucketBadgeLabel`、`bitbucketRepoSlug`(Task 2)。

- [ ] **Step 1: 写失败测试**

在 `tests/tab-row.test.tsx` 的 `describe('TabRow', ...)` 内追加:
```ts
  it('Bitbucket PR → 徽章', () => {
    render(
      <TabRow
        tab={tab({ url: 'https://bitbucket.org/acme/app/pull-requests/42', title: 'Fix bug' })}
        portMap={{}}
        onActivate={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText('PR #42')).toBeTruthy();
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tab-row`
Expected: FAIL —— 当前无 Bitbucket 识别,徽章不出现。

- [ ] **Step 3: 实现 TabRow 集成**

在 `entrypoints/sidepanel/components/TabRow.tsx`:

(a) 第 5 行 GitHub import 之后,新增 Bitbucket import:
```ts
import { parseBitbucket, bitbucketBadgeLabel, bitbucketRepoSlug } from '@/shared/bitbucket';
```

(b) 在 `const gh = project == null ? parseGitHub(tab.url) : null;` 这行之后新增归一化(GitHub 优先,其次 Bitbucket):
```ts
  const bb = project == null && !gh ? parseBitbucket(tab.url) : null;
  const codeRef = gh
    ? { kind: gh.kind, label: badgeLabel(gh), slug: repoSlug(gh) }
    : bb
      ? { kind: bb.kind, label: bitbucketBadgeLabel(bb), slug: bitbucketRepoSlug(bb) }
      : null;
```
(`displayTitle` 那行不变:GitHub 仍用 `cleanGitHubTitle`,Bitbucket 用原标题。)

(c) 把 GitHub 徽章块(`{gh && ( ... )}`)整块替换为用 `codeRef`:
```tsx
      {codeRef && (
        <span
          className="shrink-0 inline-flex items-center gap-1 font-mono text-[11px]
                     px-1 py-0.5 rounded bg-accent/15 text-accent"
          title={`${codeRef.kind === 'pr' ? 'Pull Request' : 'Issue'} ${codeRef.label} · ${codeRef.slug}`}
        >
          {codeRef.kind === 'pr' ? <PrIcon /> : <IssueIcon />}
          {codeRef.label}
        </span>
      )}
```

(d) 把 hostname 兜底那行 `{gh ? repoSlug(gh) : hostname(tab.url)}` 改为:
```tsx
        {codeRef ? codeRef.slug : hostname(tab.url)}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test tab-row`
Expected: PASS(含既有 GitHub 徽章测试仍过)。

- [ ] **Step 5: 类型检查 + 全量测试**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 均通过。

- [ ] **Step 6: 提交**

```bash
git add entrypoints/sidepanel/components/TabRow.tsx tests/tab-row.test.tsx
git commit -m "$(cat <<'EOF'
feat(sidepanel): 标签行显示 Bitbucket PR/Issue 徽章

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 一键展开 / 折叠全部(功能 C)

**Files:**
- Modify: `entrypoints/sidepanel/components/ContextGroup.tsx`(Props 加 `collapseAll`;effect 同步)
- Modify: `entrypoints/sidepanel/App.tsx`(`allCollapsed` 状态 + 头部按钮 + 给活跃/未分类传 `collapseAll`)
- Test: `tests/context-group.test.tsx`

**Interfaces:**
- Produces: `ContextGroup` 新增可选 `collapseAll?: boolean`(传了则折叠态随之同步;不传不受影响)。

- [ ] **Step 1: 写失败测试**

在 `tests/context-group.test.tsx` 的 `describe('ContextGroup AI 改名取消', ...)` 之后(文件内)新增一个 describe:
```ts
describe('ContextGroup 一键折叠', () => {
  const t = {
    id: 'x1', contextId: 'c1', url: 'https://a.com', title: 'A标签',
    chromeTabId: 1, firstOpenedAt: 0, lastActiveAt: 0,
  };
  it('collapseAll 控制:false 显示标签、true 隐藏', () => {
    const props = baseProps({ editing: false, tabs: [t] });
    const { rerender } = render(<ContextGroup {...props} collapseAll={false} />);
    expect(screen.getByText('A标签')).toBeTruthy();
    rerender(<ContextGroup {...props} collapseAll={true} />);
    expect(screen.queryByText('A标签')).toBeNull();
  });
});
```
(`baseProps` 已在本文件定义于 Task「AI 改名取消」;`editing: false` 让其渲染标签列表而非改名输入。)

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test context-group`
Expected: FAIL —— `ContextGroup` 尚不认 `collapseAll`,`collapseAll={true}` 不会折叠 → 标签仍在。

- [ ] **Step 3: 实现 ContextGroup**

在 `entrypoints/sidepanel/components/ContextGroup.tsx`:

(a) 第 1 行 import 增加 `useEffect`:
```ts
import { useEffect, useRef, useState } from 'react';
```

(b) `Props` 接口里新增(放在 `onAiCancel?: () => void;` 之后即可):
```ts
  collapseAll?: boolean; // 传了则折叠态随一键开关同步(归档组不传 → 不受影响)
```

(c) 解构参数里新增 `collapseAll,`(与其它并列)。

(d) 在 `const [collapsed, setCollapsed] = useState(variant === 'archived');` 之后新增:
```ts
  // 一键展开/折叠:App 传 collapseAll 时随之同步;归档组不传 → guard 使其不受影响
  useEffect(() => {
    if (collapseAll !== undefined) setCollapsed(collapseAll);
  }, [collapseAll]);
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test context-group`
Expected: PASS。

- [ ] **Step 5: App 状态 + 头部按钮 + 传参**

在 `entrypoints/sidepanel/App.tsx`:

(a) 在其它 `useState` 附近(如 `const [settingsOpen, setSettingsOpen] = useState(false);` 之后)新增:
```ts
  const [allCollapsed, setAllCollapsed] = useState(false); // 一键折叠开关(false=展开)
```

(b) 头部「+ 新建」按钮与「设置」齿轮按钮之间,新增一键折叠按钮:
```tsx
        <button
          onClick={() => setAllCollapsed((v) => !v)}
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md opacity-60 hover:opacity-100
                     hover:bg-black/5 dark:hover:bg-white/10"
          title={allCollapsed ? '全部展开' : '全部折叠'}
          aria-label={allCollapsed ? '全部展开' : '全部折叠'}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {allCollapsed ? (
              <>
                <path d="M7 13l5 5 5-5" />
                <path d="M7 6l5 5 5-5" />
              </>
            ) : (
              <>
                <path d="M7 11l5-5 5 5" />
                <path d="M7 18l5-5 5 5" />
              </>
            )}
          </svg>
        </button>
```

(c) 给活跃任务与未分类的 `ContextGroup` 传 `collapseAll`(归档的**不传**):
```tsx
        {activeContexts.map((c) => (
          <ContextGroup key={c.id} variant="active" collapseAll={allCollapsed} {...groupProps(c)} />
        ))}

        {!isEmpty && inbox && (
          <ContextGroup key={inbox.id} variant="inbox" collapseAll={allCollapsed} {...groupProps(inbox)} />
        )}
```
归档渲染处(`variant="archived"`)保持不变,**不加** `collapseAll`。

- [ ] **Step 6: 类型检查 + 全量测试 + 构建**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: 均通过;构建产出 `.output/chrome-mv3`。

- [ ] **Step 7: 提交**

```bash
git add entrypoints/sidepanel/components/ContextGroup.tsx entrypoints/sidepanel/App.tsx tests/context-group.test.tsx
git commit -m "$(cat <<'EOF'
feat(sidepanel): 一键展开/折叠全部(活跃任务 + 未分类)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 最终验证

- [ ] `pnpm test` 全绿(原 211 + 新增约 10 个用例)。
- [ ] `pnpm exec tsc --noEmit` 无错误。
- [ ] `pnpm build` 成功。
- [ ] 手动 A:未分类里放几个属于某已有任务领域的标签 → AI 整理 → 计划弹窗出现「并入已有任务 → 该任务」。
- [ ] 手动 B:打开一个 `bitbucket.org/.../pull-requests/N` 标签 → 行内显示「PR #N」徽章、hover 显示 workspace/repo。
- [ ] 手动 C:点头部一键按钮 → 活跃任务+未分类全部折叠;再点 → 全部展开;归档不受影响。
