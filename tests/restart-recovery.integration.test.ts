import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { Repository } from '@/core/store/repositories';
import { CairnTabsDB } from '@/core/store/db';
import { registerTabListeners } from '@/core/background/tab-sync';
import { registerGroupListeners, reconcileGroups } from '@/core/background/group-sync';
import { reconcile } from '@/core/background/tab-sync';
import { INBOX_ID } from '@/shared/types';
import { SearchIndex } from '@/core/search';
import { UndoManager } from '@/core/background/undo';
import { handleCommand, type CommandContext } from '@/core/background/commands';

let fake: FakeChrome;
let repo: Repository;
let dbn = 9000;

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`restart-itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  registerTabListeners(
    repo,
    () => {},
    () => ({}),
    () => false,
  ); // 关自动聚簇
  registerGroupListeners(repo, () => {});
});

/** 模拟会话恢复:所有 tab / group 换新 id,url/title/color/分组归属不变。 */
function simulateSessionRestore() {
  const T = 100000,
    G = 100000;
  const oldTabs = [...fake.tabsById.values()];
  const oldGroups = [...fake.groupsById.values()];
  fake.tabsById.clear();
  fake.groupsById.clear();
  for (const g of oldGroups) fake.groupsById.set(g.id + G, { ...g, id: g.id + G });
  for (const t of oldTabs) {
    const groupId = t.groupId >= 0 ? t.groupId + G : t.groupId;
    fake.tabsById.set(t.id + T, { ...t, id: t.id + T, groupId });
  }
}

describe('reconcile 按 URL 重绑', () => {
  it('重启后死 chromeTabId 记录按 URL 重绑,保留 contextId/starred/pinned,不误删', async () => {
    await fake.userOpenTab('https://a.com/x', { title: 'A' });
    const [rid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    await repo.setTabStarred(rid!, true);
    await repo.pinTab(rid!);
    const before = (await repo.getTab(rid!))!;
    const oldChromeId = before.chromeTabId!;

    simulateSessionRestore(); // chromeTabId 变了

    await reconcile(repo, () => {}, { purge: true });

    const after = (await repo.getTab(rid!))!;
    expect(after).toBeTruthy(); // 记录未被删
    expect(after.chromeTabId).toBe(oldChromeId + 100000); // 回填新 id
    expect(after.starred).toBe(true);
    expect(after.pinned).toBe(true);
    expect(after.url).toBe('https://a.com/x');
    // 未产生重复记录
    expect((await repo.getSnapshot()).tabs.filter((t) => t.url === 'https://a.com/x')).toHaveLength(
      1,
    );
  });

  it('purge:false 保留重绑不上的死记录;purge:true 删除', async () => {
    await fake.userOpenTab('https://gone.com', { title: 'Gone' });
    await fake.userOpenTab('https://live.com', { title: 'Live' });
    const goneRec = (await repo.getSnapshot()).tabs.find((t) => t.url === 'https://gone.com')!;
    // 关掉 gone(直接从 fake 移除,不触发事件),live 仍在
    fake.tabsById.delete(goneRec.chromeTabId!);

    await reconcile(repo, () => {}, { purge: false });
    expect(await repo.getTab(goneRec.id)).toBeTruthy(); // 保留

    await reconcile(repo, () => {}, { purge: true });
    expect(await repo.getTab(goneRec.id)).toBeUndefined(); // 删除
    expect((await repo.getContext(INBOX_ID))!.tabOrder.length).toBe(1); // gone 删除后只剩 live
  });

  it('purge:false(冷启动 hydrate 用):实时标签为空也不删记录', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [rid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    fake.tabsById.clear(); // 会话恢复未就绪:无实时标签
    await reconcile(repo, () => {}, { purge: false });
    expect(await repo.getTab(rid!)).toBeTruthy(); // purge:false → 保留
  });
});

describe('reconcileGroups 按标题重连', () => {
  it('重启后死 nativeGroupId 的任务按标题重连到同名新分组,不删任务', async () => {
    // 造一个带原生分组的任务:context.nativeGroupId=900,fake 里有个同标题分组 900
    const ctx = await repo.createContext('任务甲', Date.now(), { nativeGroupId: 900 });
    fake.groupsById.set(900, {
      id: 900,
      title: '任务甲',
      color: 'blue',
      windowId: 1,
      collapsed: false,
      shared: false,
    });
    // 该任务里放一个打开的标签(使其非空)
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [rid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    await repo.moveTab(rid!, ctx.id, Date.now());

    simulateSessionRestore(); // group 900 → 100900(标题不变),tab id 也变

    // 先重绑标签(否则 step 2 找不到记录),再重连分组
    await reconcile(repo, () => {}, { purge: false });
    await reconcileGroups(repo, () => {}, { prune: true });

    const after = (await repo.getContext(ctx.id))!;
    expect(after).toBeTruthy(); // 任务未删
    expect(after.nativeGroupId).toBe(100900); // 重连到新分组 id
  });

  it('prune:false:死 nativeGroupId 且无同名分组 → 任务原样保留(不删不解绑)', async () => {
    const ctx = await repo.createContext('孤儿任务', Date.now(), { nativeGroupId: 900 });
    // fake 里没有任何分组
    await reconcileGroups(repo, () => {}, { prune: false });
    const after = (await repo.getContext(ctx.id))!;
    expect(after).toBeTruthy();
    expect(after.nativeGroupId).toBe(900); // 保留死 id,供之后重连
  });

  it('prune:true:死 nativeGroupId、空、无同名分组 → 删任务(原行为)', async () => {
    const ctx = await repo.createContext('将删任务', Date.now(), { nativeGroupId: 900 });
    await reconcileGroups(repo, () => {}, { prune: true });
    expect(await repo.getContext(ctx.id)).toBeUndefined();
  });
});

describe('端到端:模拟重启后完整恢复', () => {
  it('任务、标签、★、锁定 全部恢复到原任务(冷启动非破坏 + 聚焦对账)', async () => {
    const ctx: CommandContext = {
      repo,
      search: new SearchIndex(),
      undo: new UndoManager(),
      onChange: () => {},
    };
    // 建任务甲,放两个标签进去(MOVE_TAB 会建原生分组、打锁),再 star 一个;另留一个在未分类
    await handleCommand({ type: 'CREATE_CONTEXT', name: '任务甲' }, ctx);
    const cid = (await repo.getSnapshot()).contexts.find((c) => c.name === '任务甲')!.id;
    await fake.userOpenTab('https://a.com/1', { title: 'A1' });
    await fake.userOpenTab('https://a.com/2', { title: 'A2' });
    await fake.userOpenTab('https://inbox.com/x', { title: 'IN' });
    const inboxIds = (await repo.getContext(INBOX_ID))!.tabOrder;
    const [id1, id2] = inboxIds; // 前两个是 a.com/1、a.com/2
    await handleCommand({ type: 'MOVE_TAB', tabRecordId: id1!, toContextId: cid }, ctx);
    await handleCommand({ type: 'MOVE_TAB', tabRecordId: id2!, toContextId: cid }, ctx);
    await repo.setTabStarred(id1!, true);
    const groupIdBefore = (await repo.getContext(cid))!.nativeGroupId;
    expect(groupIdBefore).toBeGreaterThanOrEqual(0);

    simulateSessionRestore(); // 所有 tab / group id 换新,url/title/color/归属不变

    // 冷启动 hydrate 的对账序列(非破坏),再模拟面板聚焦对账(清删)
    await reconcile(repo, () => {}, { purge: false });
    await reconcileGroups(repo, () => {}, { prune: false });
    await reconcile(repo, () => {});
    await reconcileGroups(repo, () => {});

    // 任务甲仍在(同 context id),重连到新分组
    const after = (await repo.getContext(cid))!;
    expect(after).toBeTruthy();
    expect(after.nativeGroupId).toBe(groupIdBefore! + 100000);
    // 两个标签仍属任务甲、pinned 保留、其一 starred 保留
    const t1 = (await repo.getTab(id1!))!;
    const t2 = (await repo.getTab(id2!))!;
    expect(t1.contextId).toBe(cid);
    expect(t2.contextId).toBe(cid);
    expect(t1.pinned).toBe(true);
    expect(t1.starred).toBe(true);
    // 未分类标签仍在未分类
    const tin = (await repo.getSnapshot()).tabs.find((t) => t.url === 'https://inbox.com/x')!;
    expect(tin.contextId).toBe(INBOX_ID);
    // 无重复:总标签数仍为 3
    expect((await repo.getSnapshot()).tabs.length).toBe(3);
  });
});
