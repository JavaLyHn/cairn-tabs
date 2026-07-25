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
let dbn = 9000;

async function inboxTabIds(): Promise<string[]> {
  const c = await repo.getContext(INBOX_ID);
  return c!.tabOrder;
}

/** 开一个标签、建命名任务并移入、整体归档。返回 cid。 */
async function makeArchivedTask(name: string, url: string): Promise<string> {
  await fake.userOpenTab(url, { title: name });
  await handleCommand({ type: 'CREATE_CONTEXT', name }, ctx);
  const cid = (await repo.getSnapshot()).contexts.find((c) => c.name === name)!.id;
  const [tabId] = await inboxTabIds();
  await handleCommand({ type: 'MOVE_TAB', tabRecordId: tabId!, toContextId: cid }, ctx);
  await handleCommand({ type: 'ARCHIVE_CONTEXT', contextId: cid }, ctx);
  return cid;
}

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`restoreall-itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, ctx.onChange);
  registerGroupListeners(repo, ctx.onChange);
});

describe('RESTORE_ALL_ARCHIVED(一键恢复全部归档)', () => {
  it('所有归档任务都回 active、标签重开', async () => {
    const c1 = await makeArchivedTask('t1', 'https://a.com/1');
    const c2 = await makeArchivedTask('t2', 'https://b.com/2');
    expect(fake.tabsById.size).toBe(0); // 都归档 → 浏览器无标签
    expect((await repo.getContext(c1))!.status).toBe('archived');
    expect((await repo.getContext(c2))!.status).toBe('archived');

    await handleCommand({ type: 'RESTORE_ALL_ARCHIVED' }, ctx);

    expect((await repo.getContext(c1))!.status).toBe('active');
    expect((await repo.getContext(c2))!.status).toBe('active');
    expect(fake.tabsById.size).toBe(2); // 两个标签都重开
  });

  it('没有归档任务 → 无副作用', async () => {
    await fake.userOpenTab('https://open.com/x', { title: 'open' });
    const before = fake.tabsById.size;
    await handleCommand({ type: 'RESTORE_ALL_ARCHIVED' }, ctx);
    expect(fake.tabsById.size).toBe(before);
  });
});
