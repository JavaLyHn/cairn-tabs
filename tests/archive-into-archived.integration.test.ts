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
let db: CairnTabsDB;
let ctx: CommandContext;
let dbn = 0;

async function inboxTabIds(): Promise<string[]> {
  const c = await repo.getContext(INBOX_ID);
  return c!.tabOrder;
}

/** 建一个命名任务、把当前未分类的第一个标签移入、再整体归档。返回 { cid, tabId }。 */
async function makeArchivedTask(name: string): Promise<{ cid: string; tabId: string }> {
  await handleCommand({ type: 'CREATE_CONTEXT', name }, ctx);
  const { contexts } = await repo.getSnapshot();
  const cid = contexts.find(
    (c) => c.id !== INBOX_ID && c.status === 'active' && c.name === name,
  )!.id;
  const [tabId] = await inboxTabIds();
  await handleCommand({ type: 'MOVE_TAB', tabRecordId: tabId!, toContextId: cid }, ctx);
  await handleCommand({ type: 'ARCHIVE_CONTEXT', contextId: cid }, ctx);
  return { cid, tabId: tabId! };
}

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  db = new CairnTabsDB(`arch-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, ctx.onChange);
  registerGroupListeners(repo, ctx.onChange);
});

describe('把开着的标签直接归档进已归档任务', () => {
  it('拖入 → 标签归档进去、浏览器标签关闭、任务仍归档、返回可撤销', async () => {
    // 建一个已归档任务(内含标签 A)
    await fake.userOpenTab('https://a.com/1', { title: 'A1' });
    const { cid } = await makeArchivedTask('proj');
    expect((await repo.getContext(cid))!.status).toBe('archived');

    // 再开一个标签 B(落未分类,开着的)
    await fake.userOpenTab('https://b.com/2', { title: 'B2' });
    const [bId] = await inboxTabIds();
    expect((await repo.getTab(bId!))!.chromeTabId).toBeDefined();
    const liveBefore = fake.tabsById.size; // 只有 B 开着(A 已归档关闭)

    // 拖进已归档任务
    const ev = await handleCommand({ type: 'MOVE_TAB', tabRecordId: bId!, toContextId: cid }, ctx);

    const bAfter = await repo.getTab(bId!);
    expect(bAfter!.contextId).toBe(cid); // 进了归档任务
    expect(bAfter!.chromeTabId).toBeUndefined(); // 归档态:无浏览器标签
    expect(fake.tabsById.size).toBe(liveBefore - 1); // B 的浏览器标签被关掉
    expect((await repo.getContext(cid))!.status).toBe('archived'); // 任务仍归档,未被恢复
    expect((await repo.getContext(cid))!.tabOrder).toContain(bId);
    expect(await inboxTabIds()).not.toContain(bId);
    expect(ev).toMatchObject({ type: 'UNDOABLE', action: 'archive-tab' });
  });

  it('撤销 → 标签重开并移回原任务(未分类),归档任务保持归档', async () => {
    await fake.userOpenTab('https://a.com/1', { title: 'A1' });
    const { cid } = await makeArchivedTask('proj');
    await fake.userOpenTab('https://b.com/2', { title: 'B2' });
    const [bId] = await inboxTabIds();

    const ev = await handleCommand({ type: 'MOVE_TAB', tabRecordId: bId!, toContextId: cid }, ctx);
    if (ev?.type !== 'UNDOABLE') throw new Error('expected UNDOABLE');

    await handleCommand({ type: 'UNDO', token: ev.token }, ctx);

    const bAfter = await repo.getTab(bId!);
    expect(bAfter!.contextId).toBe(INBOX_ID); // 移回原任务(B 本在未分类)
    expect(bAfter!.chromeTabId).toBeDefined(); // 浏览器标签重开
    expect(fake.tabsById.size).toBe(1); // 浏览器里又有 B
    expect((await repo.getContext(cid))!.status).toBe('archived'); // 归档任务仍归档
    expect((await repo.getContext(cid))!.tabOrder).not.toContain(bId);
  });

  it('归档任务之间挪动已归档标签:纯移动,不关标签、不返回可撤销', async () => {
    await fake.userOpenTab('https://a.com/1', { title: 'A1' });
    const t1 = await makeArchivedTask('proj-1');
    await fake.userOpenTab('https://c.com/3', { title: 'C3' });
    const t2 = await makeArchivedTask('proj-2');

    const sizeBefore = fake.tabsById.size; // 两个任务都归档 → 0 个开着的标签
    const ev = await handleCommand(
      { type: 'MOVE_TAB', tabRecordId: t1.tabId, toContextId: t2.cid },
      ctx,
    );

    expect(ev).toBeUndefined(); // 无标签可关 → 不产生撤销
    expect((await repo.getTab(t1.tabId))!.contextId).toBe(t2.cid);
    expect(fake.tabsById.size).toBe(sizeBefore); // 没动浏览器标签
  });
});
