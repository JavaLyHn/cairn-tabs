# AI 整理全部(全局重新聚类)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「整理全部」——把所有打开的标签(除 ★重点/手动拖过)交给 AI 激进重新聚类,跨组移动,强预览 + 5 秒一键撤销。

**Architecture:** 复用现有 `AIPlan`(`newGroups`+`assign`)与预览/应用管线。新增 `AI_ORGANIZE_ALL` 采集"可动标签",`buildOrganizePrompt` 加激进档;`APPLY_AI_PLAN` 加 `global` 分支(移动不打锁、删空组、注册撤销);`UndoManager` 承载 reorg 逆操作实现整体撤销。

**Tech Stack:** WXT (MV3) · React 19 · TypeScript(strict, noUncheckedIndexedAccess) · Dexie · Zustand · Vitest + fake-chrome + fake-indexeddb · pnpm。

## Global Constraints

- **F-13 隐私(硬约束)**:只出网 **标签标题 + eTLD+1 域名 + 任务名**;绝不发完整 URL / query / 页面内容。API key 只在 SW 读,不进 UI/日志/广播。
- 架构不变量:SW 是唯一写入方;UI 只发 Command、订阅快照;DB 只经 `repositories.ts`;自发标签/分组操作在同步锁内(复用 `assignTab`/`ensureTabInContextGroup`,勿另起裸 chrome 调用)。
- 提交信息用中文,分层提交;每条提交结尾:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。不主动推送(用户说"推"才推)。
- 每个任务结束跑 `pnpm compile`(tsc --noEmit)+ 相关 `pnpm test` 全绿。

---

### Task 1: 激进档 prompt

给 `buildOrganizePrompt` 加可选 `{ aggressive?: boolean }`:默认(未分类整理)保守文案不变;`aggressive:true` 时改成"尽量给每个标签找归属 + 可跨组移动"。

**Files:**
- Modify: `core/ai/organize.ts:37-58`(`buildOrganizePrompt`)
- Test: `tests/ai-organize.test.ts`

**Interfaces:**
- Produces: `buildOrganizePrompt(tabs: OrganizeTab[], tasks: OrganizeTask[], opts?: { aggressive?: boolean }): { system: string; user: string }`

- [ ] **Step 1: 写失败测试**(追加到 `tests/ai-organize.test.ts` 的 `describe('buildOrganizePrompt', …)` 内)

```ts
  it('激进档:提示"尽量归类 + 可跨组移动";默认档不含', () => {
    const args: [Parameters<typeof buildOrganizePrompt>[0], Parameters<typeof buildOrganizePrompt>[1]] = [
      [{ id: 't1', title: 'x', domain: 'a.com' }],
      [{ id: 'c1', name: '任务', domains: [], samples: [] }],
    ];
    const conservative = buildOrganizePrompt(...args);
    const aggressive = buildOrganizePrompt(...args, { aggressive: true });
    expect(conservative.system).toContain('保守');
    expect(aggressive.system).not.toContain('保守');
    expect(aggressive.system).toContain('尽量');
    expect(aggressive.system).toContain('跨组');
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test ai-organize`
Expected: FAIL(激进档文案不存在 / 签名不接受第三参)

- [ ] **Step 3: 实现**

把 `core/ai/organize.ts` 的 `buildOrganizePrompt` 改为(仅签名与 `system` 数组构造变化,`user` 不变):

```ts
export function buildOrganizePrompt(
  tabs: OrganizeTab[],
  tasks: OrganizeTask[],
  opts?: { aggressive?: boolean },
): { system: string; user: string } {
  const classifyRule = opts?.aggressive
    ? [
        '- 尽量给每个标签找到最合适的归属;只有实在与任何任务/主题都无关的,才不归类。',
        '- 这些标签可能来自不同的已有分组;可以把明显更合适别处的标签跨组移动、也可以重新平衡已有分组。',
      ]
    : ['- 保守:拿不准就不要归类(该标签不出现在输出里,自动留在未分类)。'];
  const system = [
    '你是帮程序员整理浏览器标签的助手。',
    '把「零散标签」按任务/主题归类:可新建命名分组,或并入某个「已有任务」。',
    '规则:',
    ...classifyRule,
    '- 明显属于某个已有任务时,优先并入该任务而不是新建同类分组。',
    '- 判断是否并入已有任务时,参考该任务的 domains(域名)与 samples(示例标题)是否与标签一致。',
    '- 新建分组名简短(不超过 16 字),语言与标签标题一致。',
    '- 只输出严格 JSON,不要任何解释、不要 Markdown 代码块。',
    'JSON 结构:',
    '{"newGroups":[{"name":"组名","tabIds":["标签id"]}],"assign":[{"taskId":"任务id","tabIds":["标签id"]}]}',
  ].join('\n');
  const user = JSON.stringify({
    looseTabs: tabs.map((t) => ({ id: t.id, title: t.title, domain: t.domain })),
    existingTasks: tasks.map((t) => ({ id: t.id, name: t.name, domains: t.domains, samples: t.samples })),
  });
  return { system, user };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test ai-organize`
Expected: PASS(含新用例 + 原有 buildOrganizePrompt 用例仍绿)

- [ ] **Step 5: 提交**

```bash
git add core/ai/organize.ts tests/ai-organize.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): buildOrganizePrompt 加激进档(尽量归类 + 跨组移动)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: helper 加 pin 选项 + createClusterFromTabs 返回 id

`assignTab`/`createClusterFromTabs` 加可选 `{ pin?: boolean }`(默认 `true`,保持现有行为);`createClusterFromTabs` 返回新建 contextId。这是 Task 5 的使能改动,**零行为变化**。

**Files:**
- Modify: `core/background/commands.ts:113-137`

**Interfaces:**
- Produces:
  - `assignTab(tabRecordId, toContextId, repo, now, opts?: { pin?: boolean }): Promise<void>` —— `pin:false` 跳过 `repo.pinTab`
  - `createClusterFromTabs(name, tabIds, repo, now, opts?: { pin?: boolean }): Promise<string>` —— 返回 contextId,透传 opts

- [ ] **Step 1: 实现(改两个 helper)**

把 `core/background/commands.ts` 的这两个函数替换为:

```ts
async function assignTab(
  tabRecordId: string,
  toContextId: string,
  repo: Repository,
  now: number,
  opts?: { pin?: boolean },
): Promise<void> {
  const rec = await repo.getTab(tabRecordId);
  if (!rec) return;
  await repo.moveTab(tabRecordId, toContextId, now);
  if (opts?.pin !== false) await repo.pinTab(tabRecordId);
  const after = await repo.getTab(tabRecordId);
  if (after?.chromeTabId != null) await ensureTabInContextGroup(repo, toContextId, after.chromeTabId);
}

/** 新建一个命名簇,把给定标签移入(默认锁定)+ 同步原生分组标题。返回新建 contextId。 */
async function createClusterFromTabs(
  name: string,
  tabIds: string[],
  repo: Repository,
  now: number,
  opts?: { pin?: boolean },
): Promise<string> {
  const created = await repo.createContext(name, now);
  for (const tabId of tabIds) await assignTab(tabId, created.id, repo, now, opts);
  await syncGroupTitle(repo, created.id, name);
  return created.id;
}
```

其余调用点无需改(`PROMOTE_SAME_DOMAIN`、`APPLY_AI_PLAN` 现有分支均不传 opts → pin 默认 true;忽略返回值)。

- [ ] **Step 2: 跑类型检查 + 全量测试确认零回归**

Run: `pnpm compile && pnpm test`
Expected: tsc 无错;全部测试 PASS(纯使能改动,行为不变)

- [ ] **Step 3: 提交**

```bash
git add core/background/commands.ts
git commit -m "$(cat <<'EOF'
refactor(bg): assignTab/createClusterFromTabs 加 pin 选项 + 返回 id

为「整理全部」不打锁移动做准备;默认 pin:true,现有行为不变。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `AI_ORGANIZE_ALL` 命令

采集"可动标签"(打开中、非 ★、非 pinned),连同所有活跃命名任务的信号,走激进档 prompt,返回 `AI_PLAN`。

**Files:**
- Modify: `shared/messaging.ts`(Command union + COMMAND_TYPES)
- Modify: `core/background/commands.ts`(新增 `case 'AI_ORGANIZE_ALL'`,置于 `AI_ORGANIZE_INBOX` 之后)
- Test: `tests/ai-organize-all.integration.test.ts`(新建)

**Interfaces:**
- Consumes: `buildOrganizePrompt(..., { aggressive:true })`(Task 1);`summarizeTaskTabs`、`registrableDomain`、`hostnameOf`、`parseOrganizeResponse`、`isAICancelled`(现有);`ctx.ai.complete`(现有)。
- Produces: Command `{ type:'AI_ORGANIZE_ALL' }`;返回 `{ type:'AI_PLAN'; plan; tabs }`(`tabs` = 可动集)或 `AI_ERROR`。

- [ ] **Step 1: 写失败测试**(新建 `tests/ai-organize-all.integration.test.ts`)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { Repository } from '@/core/store/repositories';
import { CairnTabsDB } from '@/core/store/db';
import { SearchIndex } from '@/core/search';
import { UndoManager } from '@/core/background/undo';
import { registerTabListeners } from '@/core/background/tab-sync';
import { registerGroupListeners } from '@/core/background/group-sync';
import { handleCommand, type CommandContext } from '@/core/background/commands';
import { INBOX_ID } from '@/shared/types';

let fake: FakeChrome;
let repo: Repository;
let ctx: CommandContext;
let dbn = 8000;

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`ai-all-itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, ctx.onChange, () => ({}), () => false); // 关自动聚簇
  registerGroupListeners(repo, ctx.onChange);
});

function aiCtx(complete: (system: string, user: string) => Promise<string>): CommandContext {
  return {
    ...ctx,
    ai: {
      status: () => ({ provider: 'anthropic', hasKey: true, model: 'm' }),
      configured: () => true,
      complete,
      set: async () => {},
      test: async () => ({ ok: true, detail: 'ok' }),
      cancel: () => {},
    },
  };
}

describe('AI_ORGANIZE_ALL 采集', () => {
  it('可动集排除 ★重点、手动拖过(pinned)、已归档;含 inbox 与各组普通标签', async () => {
    // inbox 两个普通标签
    await fake.userOpenTab('https://react.dev/a', { title: 'React A' });
    await fake.userOpenTab('https://vitejs.dev/b', { title: 'Vite B' });
    // 一个已有任务,含:一个普通标签(可动)+ 一个手动拖过(pinned)+ 一个 ★
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'auth' }, ctx);
    const task = (await repo.getSnapshot()).contexts.find((c) => c.name === 'auth')!;
    await fake.userOpenTab('https://github.com/x/y/pull/1', { title: 'PR normal' });
    await fake.userOpenTab('https://github.com/x/y/pull/2', { title: 'PR pinned' });
    await fake.userOpenTab('https://github.com/x/y/pull/3', { title: 'PR starred' });
    const inbox = (await repo.getContext(INBOX_ID))!.tabOrder;
    const [normalId, pinnedId, starredId] = inbox.slice(2); // 后三个是刚开的 PR
    // 普通:MOVE_TAB(会 pin)→ 为了得到"组内非 pinned"的可动标签,改用 repo.moveTab 不打锁
    await repo.moveTab(normalId!, task.id, Date.now());
    await repo.moveTab(pinnedId!, task.id, Date.now());
    await repo.pinTab(pinnedId!); // 手动拖过
    await repo.moveTab(starredId!, task.id, Date.now());
    await repo.setTabStarred(starredId!, true); // ★

    let captured = '';
    const ev = await handleCommand({ type: 'AI_ORGANIZE_ALL' }, aiCtx(async (_s, user) => {
      captured = user;
      return '{"newGroups":[],"assign":[]}';
    }));

    // parse 空 plan → parse 错误(无 newGroups/assign)→ AI_ERROR parse;但 user 已捕获
    expect(ev?.type).toBe('AI_ERROR');
    const looseTitles = (JSON.parse(captured).looseTabs as { title: string }[]).map((t) => t.title);
    expect(looseTitles).toContain('React A');
    expect(looseTitles).toContain('Vite B');
    expect(looseTitles).toContain('PR normal');
    expect(looseTitles).not.toContain('PR pinned');
    expect(looseTitles).not.toContain('PR starred');
  });

  it('无可动标签 → empty', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [id] = (await repo.getContext(INBOX_ID))!.tabOrder;
    await repo.setTabStarred(id!, true); // 唯一标签被 ★ → 无可动
    const ev = await handleCommand({ type: 'AI_ORGANIZE_ALL' }, aiCtx(async () => '{}'));
    expect(ev).toEqual({ type: 'AI_ERROR', reason: 'empty' });
  });

  it('未配置 key → no_key', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const ev = await handleCommand({ type: 'AI_ORGANIZE_ALL' }, ctx);
    expect(ev).toEqual({ type: 'AI_ERROR', reason: 'no_key' });
  });

  it('F-13:出网 user 只含 eTLD+1 域名,不含原始路径/query', async () => {
    // 直接写库:一个带路径+query 的已归属标签,且打开中(可动)
    await fake.userOpenTab('https://react.dev/learn/thinking-in-react?tab=1', { title: 'Thinking' });
    let captured = '';
    await handleCommand({ type: 'AI_ORGANIZE_ALL' }, aiCtx(async (_s, user) => {
      captured = user;
      return '{"newGroups":[],"assign":[]}';
    }));
    expect(captured).toContain('react.dev');
    expect(captured).not.toContain('thinking-in-react');
    expect(captured).not.toContain('tab=1');
  });

  it('返回 AI_PLAN,plan.tabs 为可动集', async () => {
    await fake.userOpenTab('https://react.dev/a', { title: 'React' });
    const [id] = (await repo.getContext(INBOX_ID))!.tabOrder;
    const ev = await handleCommand(
      { type: 'AI_ORGANIZE_ALL' },
      aiCtx(async () => JSON.stringify({ newGroups: [{ name: '前端', tabIds: [id] }], assign: [] })),
    );
    expect(ev?.type).toBe('AI_PLAN');
    expect((ev as { tabs: { id: string }[] }).tabs.map((t) => t.id)).toContain(id);
  });
});
```

> 注:`aiCtx` 的类型体操只是为拿到 `complete` 的签名;实现时若嫌绕,可直接把 `complete` 参数标成 `(system: string, user: string) => Promise<string>`。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test ai-organize-all`
Expected: FAIL(`AI_ORGANIZE_ALL` 未在 Command 类型/handler 中)

- [ ] **Step 3: 加 Command 类型**

`shared/messaging.ts`:在 `| { type: 'AI_ORGANIZE_INBOX' }` 下一行加:
```ts
  | { type: 'AI_ORGANIZE_ALL' }
```
并在 `COMMAND_TYPES` 的 `'AI_ORGANIZE_INBOX',` 下一行加:
```ts
  'AI_ORGANIZE_ALL',
```

- [ ] **Step 4: 实现 handler**

`core/background/commands.ts`:在 `case 'AI_ORGANIZE_INBOX': { … }` 之后插入:

```ts
    case 'AI_ORGANIZE_ALL': {
      if (!ctx.ai || !ctx.ai.configured()) return { type: 'AI_ERROR', reason: 'no_key' };
      const { contexts, tabs } = await repo.getSnapshot();
      // 可动集:打开中、非 ★重点、非手动拖过(pinned)
      const movable = tabs.filter((t) => t.chromeTabId != null && !t.starred && !t.pinned);
      if (movable.length === 0) return { type: 'AI_ERROR', reason: 'empty' };
      const tasks = contexts.filter((c) => c.id !== INBOX_ID && c.status === 'active');
      const { system, user } = buildOrganizePrompt(
        movable.map((t) => ({ id: t.id, title: t.title, domain: registrableDomain(hostnameOf(t.url)) })),
        tasks.map((c) => {
          const own = tabs.filter((t) => t.contextId === c.id);
          const sig = summarizeTaskTabs(
            own.map((t) => ({ title: t.title, domain: registrableDomain(hostnameOf(t.url)) })),
          );
          return { id: c.id, name: c.name, domains: sig.domains, samples: sig.samples };
        }),
        { aggressive: true },
      );
      let raw: string;
      try {
        raw = await ctx.ai.complete(system, user);
      } catch (e) {
        if (isAICancelled(e)) return { type: 'AI_ERROR', reason: 'cancelled' };
        return { type: 'AI_ERROR', reason: 'network' };
      }
      const plan = parseOrganizeResponse(
        raw,
        new Set(movable.map((t) => t.id)),
        new Set(tasks.map((c) => c.id)),
      );
      if (!plan) return { type: 'AI_ERROR', reason: 'parse' };
      return { type: 'AI_PLAN', plan, tabs: movable };
    }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm test ai-organize-all && pnpm compile`
Expected: PASS;tsc 无错

- [ ] **Step 6: 提交**

```bash
git add shared/messaging.ts core/background/commands.ts tests/ai-organize-all.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): AI_ORGANIZE_ALL 采集全部可动标签(排除 ★/手动拖过)激进整理

只出网 标题+eTLD+1 域名+任务名(F-13)。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 撤销承载 reorg + `undoReorg`

`UndoManager` 增 reorg 逆操作;`UNDO` handler 分支处理;`undoReorg` 把批量移动整体还原(重建被删组、移回标签、删掉新建的空组)。

**Files:**
- Modify: `core/background/undo.ts`
- Modify: `core/background/commands.ts`(`case 'UNDO'` + 新 helper `undoReorg`)
- Test: `tests/undo.test.ts`(新建,UndoManager 单测)+ `tests/ai-organize-all.integration.test.ts`(追加 undoReorg 集成)

**Interfaces:**
- Produces:
  - `interface ReorgUndo { moves: { tabId: string; toContextId: string }[]; recreate: { id: string; name: string; color: ContextColor }[]; deleteContextIds: string[] }`(从 `undo.ts` export)
  - `UndoManager.registerReorg(reorg: ReorgUndo, ttlMs: number): { token: string; ttlMs: number }`
  - `UndoManager.consume(token): { action: string; contextId?: string; reorg?: ReorgUndo } | undefined`(**返回值类型变更**)
- Consumes(undoReorg):`repo.createContext(name, now, { color })`、`repo.moveTab`、`repo.getTab`、`repo.deleteContext`、`ensureTabInContextGroup`、`syncGroupTitle`(均现有)。

- [ ] **Step 1: 写失败测试 A**(新建 `tests/undo.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { UndoManager } from '@/core/background/undo';

describe('UndoManager', () => {
  it('archive:register 后 consume 返回 action + contextId', () => {
    const u = new UndoManager();
    const { token } = u.register('archive', 'ctx-1', 5000);
    expect(u.consume(token)).toEqual({ action: 'archive', contextId: 'ctx-1', reorg: undefined });
  });

  it('reorg:registerReorg 后 consume 返回 action:reorg + payload', () => {
    const u = new UndoManager();
    const reorg = { moves: [{ tabId: 't1', toContextId: 'c0' }], recreate: [], deleteContextIds: ['c9'] };
    const { token } = u.registerReorg(reorg, 5000);
    expect(u.consume(token)).toEqual({ action: 'reorg', contextId: undefined, reorg });
  });

  it('consume 后 token 作废;未知 token → undefined', () => {
    const u = new UndoManager();
    const { token } = u.register('archive', 'x', 5000);
    u.consume(token);
    expect(u.consume(token)).toBeUndefined();
    expect(u.consume('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test undo`
Expected: FAIL(`registerReorg` 不存在;`consume` 返回 string 而非对象)

- [ ] **Step 3: 实现 UndoManager**

把 `core/background/undo.ts` 整体替换为:

```ts
// 收纳的 5 秒可撤销缓冲(见设计文档 §7.3)。
// archive 的撤销 === 恢复该 context;reorg 的撤销 === 把整批移动还原。

import { nanoid } from 'nanoid';
import type { ContextColor } from '@/shared/types';

/** 「整理全部」的逆操作:移回标签 + 重建被删空组 + 删掉本次新建的空组。 */
export interface ReorgUndo {
  moves: { tabId: string; toContextId: string }[]; // 把 tab 移回 toContextId(原分组)
  recreate: { id: string; name: string; color: ContextColor }[]; // 原分组若被删,按 name/color 重建(新 id)
  deleteContextIds: string[]; // 撤销时删掉 plan 新建的组(其标签已移回,应为空)
}

interface UndoEntry {
  token: string;
  action: string;
  contextId?: string;
  reorg?: ReorgUndo;
  timer: ReturnType<typeof setTimeout>;
}

export interface UndoConsumed {
  action: string;
  contextId?: string;
  reorg?: ReorgUndo;
}

export class UndoManager {
  private entries = new Map<string, UndoEntry>();

  register(action: string, contextId: string, ttlMs: number): { token: string; ttlMs: number } {
    const token = nanoid();
    const timer = setTimeout(() => this.entries.delete(token), ttlMs);
    this.entries.set(token, { token, action, contextId, timer });
    return { token, ttlMs };
  }

  registerReorg(reorg: ReorgUndo, ttlMs: number): { token: string; ttlMs: number } {
    const token = nanoid();
    const timer = setTimeout(() => this.entries.delete(token), ttlMs);
    this.entries.set(token, { token, action: 'reorg', reorg, timer });
    return { token, ttlMs };
  }

  /** 取出并作废 token,返回其关联的动作与载荷(过期返回 undefined)。 */
  consume(token: string): UndoConsumed | undefined {
    const entry = this.entries.get(token);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    this.entries.delete(token);
    return { action: entry.action, contextId: entry.contextId, reorg: entry.reorg };
  }
}
```

- [ ] **Step 4: 跑测试 A 确认通过**

Run: `pnpm test undo`
Expected: PASS

- [ ] **Step 5: 写失败测试 B**(追加到 `tests/ai-organize-all.integration.test.ts`,复用其顶部 setup)

```ts
describe('undoReorg(UNDO 处理 reorg)', () => {
  it('重建被删组 + 移回标签 + 删掉新建空组', async () => {
    // 目标组 B(标签要移回它);新建组 C(撤销时删)
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'B组' }, ctx);
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'C组' }, ctx);
    const snap = await repo.getSnapshot();
    const B = snap.contexts.find((c) => c.name === 'B组')!;
    const C = snap.contexts.find((c) => c.name === 'C组')!;
    // 一个打开的标签,当前放在 C(模拟"被整理进新建组")
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [tid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    await repo.moveTab(tid!, C.id, Date.now());

    // 手工注册一个 reorg:把 tid 移回 B;重建一个被删组 'gone';撤销时删 C
    const { token } = ctx.undo.registerReorg(
      { moves: [{ tabId: tid!, toContextId: B.id }], recreate: [{ id: 'gone', name: '旧组', color: 'blue' }], deleteContextIds: [C.id] },
      5000,
    );
    await handleCommand({ type: 'UNDO', token }, ctx);

    const after = await repo.getSnapshot();
    expect((await repo.getTab(tid!))!.contextId).toBe(B.id); // 移回 B
    expect(after.contexts.find((c) => c.name === '旧组')).toBeTruthy(); // 重建
    expect(after.contexts.find((c) => c.id === C.id)).toBeUndefined(); // C 被删
  });

  it('原分组被删时:标签移回重建后的组(新 id)', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [tid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    // 原分组 old 已不存在,recreate 之;move 目标指向 old.id → 应落到重建后的新组
    const { token } = ctx.undo.registerReorg(
      { moves: [{ tabId: tid!, toContextId: 'old' }], recreate: [{ id: 'old', name: '重建组', color: 'red' }], deleteContextIds: [] },
      5000,
    );
    await handleCommand({ type: 'UNDO', token }, ctx);
    const rebuilt = (await repo.getSnapshot()).contexts.find((c) => c.name === '重建组')!;
    expect((await repo.getTab(tid!))!.contextId).toBe(rebuilt.id);
  });
});
```

- [ ] **Step 6: 跑测试 B 确认失败**

Run: `pnpm test ai-organize-all`
Expected: FAIL(UNDO 仍走旧的 restoreContext 分支,不处理 reorg)

- [ ] **Step 7: 实现 undoReorg + 改 UNDO 分支**

`core/background/commands.ts`:先在文件顶部 import 增补 `ReorgUndo`:把
```ts
import type { UndoManager } from './undo';
```
改为
```ts
import type { UndoManager, ReorgUndo } from './undo';
```

在 `createClusterFromTabs` 之后(约第 138 行前)新增 helper:

```ts
/** 撤销「整理全部」:重建被删空组 → 把标签移回原组 → 删掉本次新建的空组。 */
async function undoReorg(reorg: ReorgUndo, repo: Repository, now: number): Promise<void> {
  const idMap = new Map<string, string>(); // 旧被删组 id → 重建后新 id
  for (const c of reorg.recreate) {
    const fresh = await repo.createContext(c.name, now, { color: c.color });
    idMap.set(c.id, fresh.id);
    await syncGroupTitle(repo, fresh.id, c.name);
  }
  for (const m of reorg.moves) {
    const target = idMap.get(m.toContextId) ?? m.toContextId;
    const exists = await repo.getContext(target);
    if (!exists) continue; // 目标既不存在也未重建 → 跳过(极端兜底)
    await repo.moveTab(m.tabId, target, now); // 不打锁,忠实还原
    const t = await repo.getTab(m.tabId);
    if (t?.chromeTabId != null) await ensureTabInContextGroup(repo, target, t.chromeTabId);
  }
  for (const id of reorg.deleteContextIds) {
    await repo.deleteContext(id, now); // 标签已移回,应为空;deleteContext 会把残余标签兜回未分类
  }
}
```

把 `case 'UNDO'` 整块替换为:

```ts
    case 'UNDO': {
      const e = undo.consume(cmd.token);
      if (!e) return;
      if (e.reorg) {
        await undoReorg(e.reorg, repo, now);
        onChange();
        return;
      }
      if (e.contextId) {
        await restoreContext(e.contextId, ctx);
        onChange();
      }
      return;
    }
```

- [ ] **Step 8: 跑测试 B + 全量 + 类型检查**

Run: `pnpm test ai-organize-all undo && pnpm compile`
Expected: PASS;tsc 无错(确认 `undo.consume` 返回类型变更未破坏别处)

- [ ] **Step 9: 提交**

```bash
git add core/background/undo.ts core/background/commands.ts tests/undo.test.ts tests/ai-organize-all.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(bg): UndoManager 承载 reorg 逆操作 + undoReorg 整体还原

撤销「整理全部」:重建被删空组、移回标签、删新建空组。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `APPLY_AI_PLAN` 全局分支

`APPLY_AI_PLAN` 加 `global?: boolean`:global 时移动不打锁、删空组、注册 reorg 撤销、返回 `UNDOABLE`。非 global 保持原行为。

**Files:**
- Modify: `shared/messaging.ts`(`APPLY_AI_PLAN` 加 `global?`)
- Modify: `core/background/commands.ts`(`case 'APPLY_AI_PLAN'`)
- Test: `tests/ai-organize-all.integration.test.ts`(追加)

**Interfaces:**
- Consumes: `assignTab(...,{pin:false})`、`createClusterFromTabs(...,{pin:false})→id`(Task 2);`undo.registerReorg`(Task 4)。
- Produces: Command `{ type:'APPLY_AI_PLAN'; plan; global?: boolean }`;global 时返回 `{ type:'UNDOABLE', action:'reorg', token, ttlMs }`。

- [ ] **Step 1: 写失败测试**(追加到 `tests/ai-organize-all.integration.test.ts`)

```ts
describe('APPLY_AI_PLAN {global:true}', () => {
  it('跨组移动:标签从 A 移到 B;移动后 pinned 仍为 false(可反复跑)', async () => {
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'A' }, ctx);
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'B' }, ctx);
    const snap = await repo.getSnapshot();
    const A = snap.contexts.find((c) => c.name === 'A')!;
    const B = snap.contexts.find((c) => c.name === 'B')!;
    await fake.userOpenTab('https://a.com', { title: 'A tab' });
    const [tid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    await repo.moveTab(tid!, A.id, Date.now()); // 现在在 A(未打锁)

    const ev = await handleCommand(
      { type: 'APPLY_AI_PLAN', global: true, plan: { newGroups: [], assign: [{ taskId: B.id, tabIds: [tid!] }] } },
      ctx,
    );

    expect((await repo.getTab(tid!))!.contextId).toBe(B.id);
    expect((await repo.getTab(tid!))!.pinned).toBeFalsy(); // 不打锁
    expect(ev).toMatchObject({ type: 'UNDOABLE', action: 'reorg' });
  });

  it('重排后变空的原有组被删除', async () => {
    await handleCommand({ type: 'CREATE_CONTEXT', name: '将空组' }, ctx);
    const empty = (await repo.getSnapshot()).contexts.find((c) => c.name === '将空组')!;
    await fake.userOpenTab('https://a.com', { title: 'only' });
    const [tid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    await repo.moveTab(tid!, empty.id, Date.now()); // 该组只有这一个标签

    // 计划:把这唯一标签移进新建组 → 原组变空
    await handleCommand(
      { type: 'APPLY_AI_PLAN', global: true, plan: { newGroups: [{ name: '新家', tabIds: [tid!] }], assign: [] } },
      ctx,
    );
    expect((await repo.getSnapshot()).contexts.find((c) => c.id === empty.id)).toBeUndefined();
  });

  it('撤销:整批移动还原到原组', async () => {
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'src' }, ctx);
    const src = (await repo.getSnapshot()).contexts.find((c) => c.name === 'src')!;
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [tid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    await repo.moveTab(tid!, src.id, Date.now());

    const ev = await handleCommand(
      { type: 'APPLY_AI_PLAN', global: true, plan: { newGroups: [{ name: '别处', tabIds: [tid!] }], assign: [] } },
      ctx,
    );
    // src 变空被删,标签在"别处"
    expect((await repo.getTab(tid!))!.contextId).not.toBe(src.id);
    const token = (ev as { token: string }).token;
    await handleCommand({ type: 'UNDO', token }, ctx);
    // 撤销后:标签回到一个名为 src 的组(重建,新 id),"别处"被删
    const after = await repo.getSnapshot();
    const restored = after.contexts.find((c) => c.name === 'src')!;
    expect((await repo.getTab(tid!))!.contextId).toBe(restored.id);
    expect(after.contexts.find((c) => c.name === '别处')).toBeUndefined();
  });

  it('非 global 保持原行为:不返回 UNDOABLE、移动打锁', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [tid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    const ev = await handleCommand(
      { type: 'APPLY_AI_PLAN', plan: { newGroups: [{ name: 'g', tabIds: [tid!] }], assign: [] } },
      ctx,
    );
    expect(ev).toBeUndefined();
    expect((await repo.getTab(tid!))!.pinned).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test ai-organize-all`
Expected: FAIL(`global` 未处理:无 UNDOABLE、移动仍打锁、空组不删)

- [ ] **Step 3: 加 Command 字段**

`shared/messaging.ts`:把
```ts
  | { type: 'APPLY_AI_PLAN'; plan: AIPlan }
```
改为
```ts
  | { type: 'APPLY_AI_PLAN'; plan: AIPlan; global?: boolean }
```

- [ ] **Step 4: 实现 handler**

把 `core/background/commands.ts` 的 `case 'APPLY_AI_PLAN'` 整块替换为:

```ts
    case 'APPLY_AI_PLAN': {
      const global = cmd.global === true;
      // global:先记下 plan 涉及标签的原 contextId,以及当前活跃命名组集合(用于删空组 + 撤销)
      const before = new Map<string, string>();
      const beforeCtxIds: string[] = [];
      if (global) {
        const planTabIds = new Set<string>([
          ...cmd.plan.newGroups.flatMap((g) => g.tabIds),
          ...cmd.plan.assign.flatMap((a) => a.tabIds),
        ]);
        for (const id of planTabIds) {
          const t = await repo.getTab(id);
          if (t) before.set(id, t.contextId);
        }
        const { contexts } = await repo.getSnapshot();
        for (const c of contexts) if (c.id !== INBOX_ID && c.status === 'active') beforeCtxIds.push(c.id);
      }

      const createdIds: string[] = [];
      for (const g of cmd.plan.newGroups) {
        createdIds.push(await createClusterFromTabs(g.name, g.tabIds, repo, now, { pin: !global }));
      }
      for (const a of cmd.plan.assign) {
        const target = await repo.getContext(a.taskId);
        if (!target || target.status !== 'active') continue;
        for (const tabId of a.tabIds) await assignTab(tabId, a.taskId, repo, now, { pin: !global });
      }
      onChange();
      if (!global) return;

      // 删空组:重排后变空的"原有"命名活跃组,记录以便撤销重建
      const recreate: ReorgUndo['recreate'] = [];
      for (const id of beforeCtxIds) {
        const c = await repo.getContext(id);
        if (c && c.status === 'active' && c.tabOrder.length === 0) {
          recreate.push({ id, name: c.name, color: c.color });
          await repo.deleteContext(id, now);
        }
      }
      // moves:真正发生移动的(原 != 现),撤销时移回原 contextId
      const moves: ReorgUndo['moves'] = [];
      for (const [tabId, orig] of before) {
        const cur = (await repo.getTab(tabId))?.contextId;
        if (cur && cur !== orig) moves.push({ tabId, toContextId: orig });
      }
      onChange();
      const { token, ttlMs } = undo.registerReorg({ moves, recreate, deleteContextIds: createdIds }, UNDO_TTL_MS);
      return { type: 'UNDOABLE', action: 'reorg', token, ttlMs };
    }
```

- [ ] **Step 5: 跑测试 + 全量 + 类型检查**

Run: `pnpm test ai-organize-all && pnpm compile && pnpm test`
Expected: 全 PASS;tsc 无错(确认原有 `APPLY_AI_PLAN` 测试仍绿)

- [ ] **Step 6: 提交**

```bash
git add shared/messaging.ts core/background/commands.ts tests/ai-organize-all.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(bg): APPLY_AI_PLAN 全局分支 —— 不打锁移动 + 删空组 + 注册撤销

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: UI 接线(入口按钮 + 动作 + 撤销)

头部加「✦ 整理全部」按钮;`useAiActions` 加 `aiOrganizeAll` 与 global 应用路径;`App` 记 `aiPlan.scope`,应用时按 scope 传 `global` 并接 UNDOABLE。

**Files:**
- Modify: `entrypoints/sidepanel/hooks/useAiActions.ts`
- Modify: `entrypoints/sidepanel/App.tsx`

**Interfaces:**
- Consumes: Command `AI_ORGANIZE_ALL`(Task 3)、`APPLY_AI_PLAN {global}` 返回 `UNDOABLE`(Task 5)、`usePanelStore.setUndo`(现有)。
- Produces:
  - `useAiActions` 返回增 `aiOrganizeAll: () => Promise<void>`;`aiPlan` 形状加 `scope: 'inbox' | 'all'`;`applyAiPlan(plan, opts?: { global?: boolean }) => void`。

- [ ] **Step 1: 改 `useAiActions.ts`**

把 `aiPlan` 状态与相关签名的 `{ plan; tabs }` 改为 `{ plan; tabs; scope }`,新增 `aiOrganizeAll`,并让 `applyAiPlan` 接受 `global`。完整替换 `useAiActions` 的返回类型声明与实现的相关片段:

- 顶部类型:
```ts
export function useAiActions(deps: { showFlash: (msg: string) => void; setUndo: (u: { action: string; token: string; ttlMs: number }) => void }): {
  aiBusy: boolean;
  aiPlan: { plan: AIPlan; tabs: TabRecord[]; scope: 'inbox' | 'all' } | null;
  setAiPlan: (v: { plan: AIPlan; tabs: TabRecord[]; scope: 'inbox' | 'all' } | null) => void;
  aiOrganize: () => Promise<void>;
  aiOrganizeAll: () => Promise<void>;
  applyAiPlan: (plan: AIPlan, opts?: { global?: boolean }) => void;
  aiSuggestName: (contextId: string) => Promise<string | null>;
  saveAi: (provider: AIProviderId, key: string | undefined, model: string, baseUrl?: string) => Promise<void>;
  testAi: () => Promise<{ ok: boolean; detail: string }>;
} {
```
- state:
```ts
  const [aiPlan, setAiPlan] = useState<{ plan: AIPlan; tabs: TabRecord[]; scope: 'inbox' | 'all' } | null>(null);
```
- `aiOrganize` 成功分支改为带 scope:
```ts
    if (ev?.type === 'AI_PLAN') setAiPlan({ plan: ev.plan, tabs: ev.tabs, scope: 'inbox' });
```
- 新增 `aiOrganizeAll`(紧跟 `aiOrganize` 之后):
```ts
  const aiOrganizeAll = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    const ev = await dispatch({ type: 'AI_ORGANIZE_ALL' });
    setAiBusy(false);
    if (ev?.type === 'AI_PLAN') setAiPlan({ plan: ev.plan, tabs: ev.tabs, scope: 'all' });
    else if (ev?.type === 'AI_ERROR') {
      const msg: Record<string, string> = {
        no_key: '请先在设置里填 AI API key',
        permission: '未授权访问 API 域名',
        network: 'AI 调用失败,请稍后重试',
        parse: 'AI 没能给出可用的分组建议,已保持原样',
        empty: '没有可整理的标签(★重点和手动分好的不动)',
        cancelled: '已取消 AI 整理',
      };
      deps.showFlash(msg[ev.reason] ?? 'AI 调用失败');
    }
  };
```
- `applyAiPlan` 改为接受 `global` 并接 UNDOABLE:
```ts
  const applyAiPlan = async (plan: AIPlan, opts?: { global?: boolean }) => {
    const ev = await dispatch({ type: 'APPLY_AI_PLAN', plan, global: opts?.global });
    setAiPlan(null);
    if (opts?.global && ev?.type === 'UNDOABLE') {
      deps.setUndo({ action: ev.action, token: ev.token, ttlMs: ev.ttlMs });
      deps.showFlash('已整理全部');
    } else {
      deps.showFlash('已应用 AI 整理');
    }
  };
```
- 返回对象加 `aiOrganizeAll`:
```ts
  return { aiBusy, aiPlan, setAiPlan, aiOrganize, aiOrganizeAll, applyAiPlan, aiSuggestName, saveAi, testAi };
```

- [ ] **Step 2: 改 `App.tsx` —— 传 setUndo、解构 aiOrganizeAll、应用按 scope**

- 第 66-67 行解构改为:
```ts
  const { aiBusy, aiPlan, setAiPlan, aiOrganize, aiOrganizeAll, applyAiPlan, aiSuggestName, saveAi, testAi } =
    useAiActions({ showFlash, setUndo });
```
- `AIPlanDialog` 的 `onApply` 改为按 scope 传 global(第 412-420 行区块):
```tsx
      {aiPlan && (
        <AIPlanDialog
          plan={aiPlan.plan}
          tabs={aiPlan.tabs}
          taskNames={Object.fromEntries(contexts.map((c) => [c.id, c.name]))}
          onApply={(plan) => applyAiPlan(plan, { global: aiPlan.scope === 'all' })}
          onClose={() => setAiPlan(null)}
        />
      )}
```

- [ ] **Step 3: 加头部「整理全部」按钮**

`App.tsx` 头部动作行:在「+ 新建」按钮(第 245-252 行)之后、折叠按钮之前,插入:

```tsx
        {ai.hasKey && (
          <button
            onClick={aiOrganizeAll}
            disabled={aiBusy}
            className="shrink-0 px-2 py-1.5 rounded-md text-[12px] text-accent hover:bg-accent/10
                       disabled:opacity-50"
            title="用 AI 把所有标签重新精准分组(★重点和手动分好的不动)"
          >
            {aiBusy ? '✦ 整理中…' : '✦ 整理全部'}
          </button>
        )}
```

- [ ] **Step 4: 类型检查 + 构建 + 全量测试**

Run: `pnpm compile && pnpm test && pnpm build`
Expected: tsc 无错;测试全绿;构建成功

- [ ] **Step 5: 手动验证清单(在用户 Chrome 里)**

开多标签(含已分好的组)→ 点头部「✦ 整理全部」→ 预览出现 → 应用 → 标签重排、★/手动组不动 → 底部出现「已整理全部」flash + 撤销 toast → 点撤销 → 复原。

- [ ] **Step 6: 提交**

```bash
git add entrypoints/sidepanel/hooks/useAiActions.ts entrypoints/sidepanel/App.tsx
git commit -m "$(cat <<'EOF'
feat(sidepanel): 头部「整理全部」入口 + 全局应用接撤销

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 预览显示"从哪搬到哪"

`AIPlanDialog` 支持可选 `sourceNames`(tabId→原组名):跨组移动的标签行尾淡显「原 ⟨组名⟩」。App 在 scope='all' 时传入。

**Files:**
- Modify: `entrypoints/sidepanel/components/AIPlanDialog.tsx`
- Modify: `entrypoints/sidepanel/App.tsx`(传 `sourceNames`)
- Test: `tests/ai-plan-dialog.test.tsx`(新建)

**Interfaces:**
- Produces: `AIPlanDialog` 新增可选 prop `sourceNames?: Record<string, string>`;`TabItem` 新增可选 `source?: string`。

- [ ] **Step 1: 写失败测试**(新建 `tests/ai-plan-dialog.test.tsx`)

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AIPlanDialog } from '@/entrypoints/sidepanel/components/AIPlanDialog';
import type { TabRecord } from '@/shared/types';

afterEach(cleanup);

const NOW = 1_700_000_000_000;
function tab(id: string, title: string): TabRecord {
  return { id, contextId: 'x', url: `https://e.com/${id}`, title, chromeTabId: 1, firstOpenedAt: NOW, lastActiveAt: NOW };
}
const noop = () => {};

describe('AIPlanDialog 来源组显示', () => {
  it('传 sourceNames 时,跨组移动的标签显示「原 X」', () => {
    render(
      <AIPlanDialog
        plan={{ newGroups: [{ name: '新组', tabIds: ['t1'] }], assign: [] }}
        tabs={[tab('t1', '标签一')]}
        taskNames={{}}
        sourceNames={{ t1: '旧任务' }}
        onApply={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText(/原 旧任务/)).toBeTruthy();
  });

  it('不传 sourceNames 时不显示来源', () => {
    render(
      <AIPlanDialog
        plan={{ newGroups: [{ name: '新组', tabIds: ['t1'] }], assign: [] }}
        tabs={[tab('t1', '标签一')]}
        taskNames={{}}
        onApply={noop}
        onClose={noop}
      />,
    );
    expect(screen.queryByText(/原 /)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test ai-plan-dialog`
Expected: FAIL(`sourceNames` prop 不存在 / 不渲染来源)

- [ ] **Step 3: 实现**

`entrypoints/sidepanel/components/AIPlanDialog.tsx`:

- `Props` 加:
```ts
  sourceNames?: Record<string, string>; // tabId → 原组名(仅"整理全部"时传,显示"从哪搬来")
```
- `TabItem` 加 `source` 参数并渲染:
```tsx
function TabItem({ tab, source, onRemove }: { tab: TabRecord; source?: string; onRemove: () => void }) {
  return (
    <div className="group/r flex items-center gap-2 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
      {tab.faviconUrl ? (
        <img src={tab.faviconUrl} alt="" className="w-4 h-4 shrink-0" />
      ) : (
        <div className="w-4 h-4 shrink-0 rounded-sm bg-black/10 dark:bg-white/10" />
      )}
      <span className="flex-1 truncate text-[12.5px]">{tab.title}</span>
      {source && <span className="shrink-0 text-[10.5px] opacity-40">原 {source}</span>}
      <button
        onClick={onRemove}
        className="hidden group-hover/r:block text-[11px] opacity-50 hover:opacity-100"
        title="不归类这个标签"
      >
        移除
      </button>
    </div>
  );
}
```
- 组件签名解构加 `sourceNames`:
```ts
export function AIPlanDialog({ plan, tabs, taskNames, sourceNames, onApply, onClose }: Props) {
```
- 两处 `<TabItem …/>` 渲染各加 `source`(new group 区第 122-126 行、assign 区第 152-156 行):
```tsx
                    return <TabItem key={id} tab={t} source={sourceNames?.[id]} onRemove={() => dropFromGroup(i, id)} />;
```
```tsx
                    return <TabItem key={id} tab={t} source={sourceNames?.[id]} onRemove={() => dropFromAssign(i, id)} />;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test ai-plan-dialog`
Expected: PASS

- [ ] **Step 5: App 传 sourceNames(仅 scope='all')**

`App.tsx` 的 `AIPlanDialog` 区块改为:

```tsx
      {aiPlan && (
        <AIPlanDialog
          plan={aiPlan.plan}
          tabs={aiPlan.tabs}
          taskNames={Object.fromEntries(contexts.map((c) => [c.id, c.name]))}
          sourceNames={
            aiPlan.scope === 'all'
              ? Object.fromEntries(
                  aiPlan.tabs.map((t) => [
                    t.id,
                    contexts.find((c) => c.id === t.contextId)?.name ?? '未分类',
                  ]),
                )
              : undefined
          }
          onApply={(plan) => applyAiPlan(plan, { global: aiPlan.scope === 'all' })}
          onClose={() => setAiPlan(null)}
        />
      )}
```

- [ ] **Step 6: 类型检查 + 全量 + 构建**

Run: `pnpm compile && pnpm test && pnpm build`
Expected: 全绿;构建成功

- [ ] **Step 7: 提交**

```bash
git add entrypoints/sidepanel/components/AIPlanDialog.tsx entrypoints/sidepanel/App.tsx tests/ai-plan-dialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(sidepanel): 整理全部预览显示标签「原 ⟨组名⟩」来源

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 自检(spec 覆盖)

- 范围=全部可动标签重新聚类 → Task 3(movable=打开中∧非★∧非pinned,含各组)。
- 激进归类 → Task 1(aggressive 档)+ Task 3 传 `{aggressive:true}`。
- 锁 ★重点/手动拖过 → Task 3 movable 过滤;Task 5 不打锁保证可反复跑。
- 一键撤销 → Task 4(UndoManager+undoReorg)+ Task 5(registerReorg/返回 UNDOABLE)+ Task 6(setUndo 接 toast)。
- 两个入口共存 → Task 6 头部新增,未分类原按钮不改。
- 预览"从哪搬到哪" → Task 7。
- 删空组 → Task 5。
- F-13 → Task 3 只发域名+标题+名 + 出网断言测试。
- 类型一致性:`aiPlan {plan,tabs,scope}`(Task 6)、`applyAiPlan(plan,{global})`(Task 6)、`AIPlanDialog.sourceNames`(Task 7)、`UndoConsumed`/`ReorgUndo`(Task 4)、helper `{pin?}`+返回 id(Task 2)全程一致。
