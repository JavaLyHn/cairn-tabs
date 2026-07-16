import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { Repository } from '@/core/store/repositories';
import { CairnTabsDB } from '@/core/store/db';
import { SearchIndex } from '@/core/search';
import { UndoManager } from '@/core/background/undo';
import { registerTabListeners } from '@/core/background/tab-sync';
import { registerGroupListeners } from '@/core/background/group-sync';
import { handleCommand, type CommandContext } from '@/core/background/commands';
import { archiveUnrestoredContexts } from '@/core/background/session-recovery';
import { INBOX_ID } from '@/shared/types';

let fake: FakeChrome;
let repo: Repository;
let ctx: CommandContext;
let dbn = 11000;

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`sessrec-itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, () => {}, () => ({}), () => false); // 关自动聚簇
  registerGroupListeners(repo, () => {});
});

/** 建一个命名任务(带原生分组),放两个标签(其一 starred)。返回 { cid, id1, id2 }。 */
async function makeTask() {
  await handleCommand({ type: 'CREATE_CONTEXT', name: '任务甲' }, ctx);
  const cid = (await repo.getSnapshot()).contexts.find((c) => c.name === '任务甲')!.id;
  await fake.userOpenTab('https://a.com/1', { title: 'A1' });
  await fake.userOpenTab('https://a.com/2', { title: 'A2' });
  const [id1, id2] = (await repo.getContext(INBOX_ID))!.tabOrder;
  await handleCommand({ type: 'MOVE_TAB', tabRecordId: id1!, toContextId: cid }, ctx);
  await handleCommand({ type: 'MOVE_TAB', tabRecordId: id2!, toContextId: cid }, ctx);
  await repo.setTabStarred(id1!, true);
  return { cid, id1: id1!, id2: id2! };
}

describe('archiveUnrestoredContexts', () => {
  it('标签与分组都没恢复 → 归档命名任务,保留 URL/starred,清 chromeTabId', async () => {
    const { cid, id1 } = await makeTask();
    fake.tabsById.clear();
    fake.groupsById.clear(); // 模拟:Chrome 没恢复标签也没恢复分组

    const archived = await archiveUnrestoredContexts(repo, Date.now());

    expect(archived).toContain(cid);
    const c = (await repo.getContext(cid))!;
    expect(c.status).toBe('archived');
    const t1 = (await repo.getTab(id1))!;
    expect(t1.url).toBe('https://a.com/1'); // URL 保留
    expect(t1.starred).toBe(true);          // 元数据保留
    expect(t1.chromeTabId).toBeUndefined(); // 归档清 chromeTabId
  });

  it('有存活标签 → 不归档(即使分组没了)', async () => {
    const { cid } = await makeTask();
    fake.groupsById.clear(); // 分组没恢复,但标签还在(fake.tabsById 未清)

    const archived = await archiveUnrestoredContexts(repo, Date.now());
    expect(archived).not.toContain(cid);
    expect((await repo.getContext(cid))!.status).toBe('active');
  });

  it('原生分组还在 → 不归档(标签还没加载完)', async () => {
    const { cid } = await makeTask();
    const gid = (await repo.getContext(cid))!.nativeGroupId!;
    fake.tabsById.clear(); // 标签没恢复
    // 分组仍在(保持 gid 存活)——只要 fake.groupsById 里还有该 gid 即可;makeTask 已建它
    expect(fake.groupsById.has(gid)).toBe(true);

    const archived = await archiveUnrestoredContexts(repo, Date.now());
    expect(archived).not.toContain(cid);
    expect((await repo.getContext(cid))!.status).toBe('active');
  });

  it('未分类不归档', async () => {
    await fake.userOpenTab('https://loose.com', { title: 'L' });
    fake.tabsById.clear();
    const archived = await archiveUnrestoredContexts(repo, Date.now());
    expect(archived).toEqual([]);
    expect((await repo.getContext(INBOX_ID))!.status).toBe('active');
  });

  it('空任务不归档(交给常规清理)', async () => {
    await handleCommand({ type: 'CREATE_CONTEXT', name: '空任务' }, ctx);
    const cid = (await repo.getSnapshot()).contexts.find((c) => c.name === '空任务')!.id;
    const archived = await archiveUnrestoredContexts(repo, Date.now());
    expect(archived).not.toContain(cid);
    expect((await repo.getContext(cid))!.status).toBe('active');
  });

  it('归档后可经 RESTORE_CONTEXT 恢复', async () => {
    const { cid } = await makeTask();
    fake.tabsById.clear();
    fake.groupsById.clear();
    await archiveUnrestoredContexts(repo, Date.now());
    expect((await repo.getContext(cid))!.status).toBe('archived');

    await handleCommand({ type: 'RESTORE_CONTEXT', contextId: cid }, ctx);
    expect((await repo.getContext(cid))!.status).toBe('active');
  });
});
