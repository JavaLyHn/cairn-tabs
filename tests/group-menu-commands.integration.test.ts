// 任务菜单新增的两个命令(换色 / 在本任务内新建标签页)。
// 换色要连带推到原生分组,否则侧边栏与标签栏会显示两种颜色。
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

/** 建一个命名任务并把未分类的第一个标签移入(移入会顺带建原生分组)。 */
async function makeTaskWithTab(name: string): Promise<string> {
  await handleCommand({ type: 'CREATE_CONTEXT', name }, ctx);
  const { contexts } = await repo.getSnapshot();
  const cid = contexts.find((c) => c.id !== INBOX_ID && c.name === name)!.id;
  const [tabId] = (await repo.getContext(INBOX_ID))!.tabOrder;
  await handleCommand({ type: 'MOVE_TAB', tabRecordId: tabId!, toContextId: cid }, ctx);
  return cid;
}

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  db = new CairnTabsDB(`gm-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, ctx.onChange);
  registerGroupListeners(repo, ctx.onChange);
});

describe('SET_CONTEXT_COLOR', () => {
  it('写回任务颜色,并把新颜色推到原生分组', async () => {
    await fake.userOpenTab('https://a.com/1', { title: 'A1' });
    const cid = await makeTaskWithTab('proj');
    const groupId = (await repo.getContext(cid))!.nativeGroupId;
    expect(groupId).toBeDefined();

    await handleCommand({ type: 'SET_CONTEXT_COLOR', contextId: cid, color: 'purple' }, ctx);

    expect((await repo.getContext(cid))!.color).toBe('purple');
    expect((await fake.tabGroups.get(groupId!)).color).toBe('purple');
  });

  it('未建原生分组时只写库,不炸', async () => {
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'empty' }, ctx);
    const { contexts } = await repo.getSnapshot();
    const cid = contexts.find((c) => c.id !== INBOX_ID)!.id;
    expect((await repo.getContext(cid))!.nativeGroupId).toBeUndefined();

    await handleCommand({ type: 'SET_CONTEXT_COLOR', contextId: cid, color: 'cyan' }, ctx);
    expect((await repo.getContext(cid))!.color).toBe('cyan');
  });
});

describe('NEW_TAB_IN_CONTEXT', () => {
  it('新开的标签直接并进该任务的原生分组', async () => {
    await fake.userOpenTab('https://a.com/1', { title: 'A1' });
    const cid = await makeTaskWithTab('proj');
    const groupId = (await repo.getContext(cid))!.nativeGroupId!;
    const before = fake.tabsById.size;

    await handleCommand({ type: 'NEW_TAB_IN_CONTEXT', contextId: cid }, ctx);

    expect(fake.tabsById.size).toBe(before + 1);
    const created = [...fake.tabsById.values()].at(-1)!;
    expect(created.groupId).toBe(groupId);
  });
});
