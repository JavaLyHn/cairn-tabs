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
