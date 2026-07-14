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
let dbn = 7000;

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`ai-itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, ctx.onChange, () => ({}), () => false); // 关自动聚簇,保证进未分类
  registerGroupListeners(repo, ctx.onChange);
});

async function looseTabIds(): Promise<string[]> {
  return (await repo.getContext(INBOX_ID))!.tabOrder;
}

describe('AI_ORGANIZE_INBOX (F-13)', () => {
  it('未配置 key → no_key', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const ev = await handleCommand({ type: 'AI_ORGANIZE_INBOX' }, ctx);
    expect(ev).toEqual({ type: 'AI_ERROR', reason: 'no_key' });
  });

  it('把 AI 提案原样返回(不写库)', async () => {
    const aiCtx: CommandContext = {
      ...ctx,
      ai: {
        status: () => ({ provider: 'anthropic', hasKey: true, model: 'm' }),
        configured: () => true,
        complete: async () => '', // 下面按需覆盖
        set: async () => {},
      },
    };
    await fake.userOpenTab('https://react.dev/x', { title: 'React' });
    await fake.userOpenTab('https://vitejs.dev/y', { title: 'Vite' });
    const ids = await looseTabIds();
    aiCtx.ai!.complete = async () =>
      JSON.stringify({ newGroups: [{ name: '前端', tabIds: ids }], assign: [] });

    const ev = await handleCommand({ type: 'AI_ORGANIZE_INBOX' }, aiCtx);
    expect(ev?.type).toBe('AI_PLAN');
    // 提案返回但 DB 未变:两标签仍在未分类
    expect((await looseTabIds()).length).toBe(2);
  });

  it('complete 抛错 → network', async () => {
    const aiCtx: CommandContext = {
      ...ctx,
      ai: {
        status: () => ({ provider: 'anthropic', hasKey: true, model: 'm' }),
        configured: () => true,
        complete: async () => {
          throw new Error('boom');
        },
        set: async () => {},
      },
    };
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const ev = await handleCommand({ type: 'AI_ORGANIZE_INBOX' }, aiCtx);
    expect(ev).toEqual({ type: 'AI_ERROR', reason: 'network' });
  });

  it('未分类为空 → empty', async () => {
    const aiCtx: CommandContext = {
      ...ctx,
      ai: {
        status: () => ({ provider: 'anthropic', hasKey: true, model: 'm' }),
        configured: () => true,
        complete: async () => '{"newGroups":[],"assign":[]}',
        set: async () => {},
      },
    };
    // 未开任何标签,未分类为空
    const ev = await handleCommand({ type: 'AI_ORGANIZE_INBOX' }, aiCtx);
    expect(ev).toEqual({ type: 'AI_ERROR', reason: 'empty' });
  });

  it('AI 返回无法解析 → parse,且不改数据', async () => {
    const aiCtx: CommandContext = {
      ...ctx,
      ai: {
        status: () => ({ provider: 'anthropic', hasKey: true, model: 'm' }),
        configured: () => true,
        complete: async () => 'not json at all',
        set: async () => {},
      },
    };
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const ev = await handleCommand({ type: 'AI_ORGANIZE_INBOX' }, aiCtx);
    expect(ev).toEqual({ type: 'AI_ERROR', reason: 'parse' });
    // 数据未变:标签仍在未分类
    expect((await looseTabIds()).length).toBe(1);
  });
});

describe('APPLY_AI_PLAN (F-13)', () => {
  it('建新任务并把标签移入,新鲜标签离开未分类', async () => {
    await fake.userOpenTab('https://react.dev/x', { title: 'React' });
    await fake.userOpenTab('https://vitejs.dev/y', { title: 'Vite' });
    const ids = await looseTabIds();

    await handleCommand(
      { type: 'APPLY_AI_PLAN', plan: { newGroups: [{ name: '前端', tabIds: ids }], assign: [] } },
      ctx,
    );

    expect(await looseTabIds()).toEqual([]);
    const { contexts } = await repo.getSnapshot();
    const created = contexts.find((c) => c.name === '前端');
    expect(created).toBeTruthy();
    expect(created!.tabOrder.length).toBe(2);
  });

  it('并入已有任务;忽略非法 tabId 与不存在任务', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [id] = await looseTabIds();
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'bug-1' }, ctx);
    const { contexts } = await repo.getSnapshot();
    const target = contexts.find((c) => c.name === 'bug-1')!;

    await handleCommand(
      {
        type: 'APPLY_AI_PLAN',
        plan: {
          newGroups: [],
          assign: [
            { taskId: target.id, tabIds: [id!, 'BADID'] },
            { taskId: 'NOPE', tabIds: [] },
          ],
        },
      },
      ctx,
    );

    expect((await repo.getContext(target.id))!.tabOrder).toContain(id);
    expect(await looseTabIds()).toEqual([]);
  });
});
