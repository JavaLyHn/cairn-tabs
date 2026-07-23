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

async function inboxTabIds(): Promise<string[]> {
  const c = await repo.getContext(INBOX_ID);
  return c!.tabOrder;
}

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`prune-itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, ctx.onChange);
  registerGroupListeners(repo, ctx.onChange);
});

describe('AI_PRUNE_APPLY(命名任务净化:踢出到未分类)', () => {
  it('把选中标签移回未分类、其余留原任务、返回可撤销;撤销移回原任务', async () => {
    // 建任务 proj,把 A、B 两个标签移入
    await fake.userOpenTab('https://a.com/1', { title: 'A' });
    await fake.userOpenTab('https://b.com/2', { title: 'B' });
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'proj' }, ctx);
    const cid = (await repo.getSnapshot()).contexts.find((c) => c.name === 'proj')!.id;
    const [aId, bId] = await inboxTabIds();
    await handleCommand({ type: 'MOVE_TAB', tabRecordId: aId!, toContextId: cid }, ctx);
    await handleCommand({ type: 'MOVE_TAB', tabRecordId: bId!, toContextId: cid }, ctx);
    expect((await repo.getContext(cid))!.tabOrder.sort()).toEqual([aId, bId].sort());

    // 净化:把 A 踢回未分类
    const ev = await handleCommand(
      { type: 'AI_PRUNE_APPLY', fromContextId: cid, tabIds: [aId!] },
      ctx,
    );
    expect(ev).toMatchObject({ type: 'UNDOABLE', action: 'prune' });
    expect((await repo.getTab(aId!))!.contextId).toBe(INBOX_ID); // A 回未分类
    expect((await repo.getTab(bId!))!.contextId).toBe(cid); // B 仍在任务
    expect((await repo.getContext(cid))!.status).toBe('active'); // 任务未被删

    // 撤销:A 移回原任务
    if (ev?.type !== 'UNDOABLE') throw new Error('expected UNDOABLE');
    await handleCommand({ type: 'UNDO', token: ev.token }, ctx);
    expect((await repo.getTab(aId!))!.contextId).toBe(cid);
  });

  it('没有可移动的(都不在原任务)→ 不返回可撤销', async () => {
    await fake.userOpenTab('https://a.com/1', { title: 'A' });
    const [aId] = await inboxTabIds();
    // A 本就在未分类,fromContextId 传一个不含它的任务 → 无移动
    const ev = await handleCommand(
      { type: 'AI_PRUNE_APPLY', fromContextId: 'nonexistent', tabIds: [aId!] },
      ctx,
    );
    expect(ev).toBeUndefined();
    expect((await repo.getTab(aId!))!.contextId).toBe(INBOX_ID);
  });
});
