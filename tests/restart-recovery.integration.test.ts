import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { Repository } from '@/core/store/repositories';
import { CairnTabsDB } from '@/core/store/db';
import { registerTabListeners } from '@/core/background/tab-sync';
import { registerGroupListeners } from '@/core/background/group-sync';
import { reconcile } from '@/core/background/tab-sync';
import { INBOX_ID } from '@/shared/types';

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
  registerTabListeners(repo, () => {}, () => ({}), () => false); // 关自动聚簇
  registerGroupListeners(repo, () => {});
});

/** 模拟会话恢复:所有 tab / group 换新 id,url/title/color/分组归属不变。 */
function simulateSessionRestore() {
  const T = 100000, G = 100000;
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
    expect(after).toBeTruthy();                       // 记录未被删
    expect(after.chromeTabId).toBe(oldChromeId + 100000); // 回填新 id
    expect(after.starred).toBe(true);
    expect(after.pinned).toBe(true);
    expect(after.url).toBe('https://a.com/x');
    // 未产生重复记录
    expect((await repo.getSnapshot()).tabs.filter((t) => t.url === 'https://a.com/x')).toHaveLength(1);
  });

  it('purge:false 保留重绑不上的死记录;purge:true 删除', async () => {
    await fake.userOpenTab('https://gone.com', { title: 'Gone' });
    await fake.userOpenTab('https://live.com', { title: 'Live' });
    const inbox = (await repo.getContext(INBOX_ID))!.tabOrder;
    const goneRec = (await repo.getSnapshot()).tabs.find((t) => t.url === 'https://gone.com')!;
    // 关掉 gone(直接从 fake 移除,不触发事件),live 仍在
    fake.tabsById.delete(goneRec.chromeTabId!);

    await reconcile(repo, () => {}, { purge: false });
    expect(await repo.getTab(goneRec.id)).toBeTruthy(); // 保留

    await reconcile(repo, () => {}, { purge: true });
    expect(await repo.getTab(goneRec.id)).toBeUndefined(); // 删除
    expect(inbox.length).toBe(2);
  });

  it('空集保护:实时标签为空但库有记录 → 即便 purge:true 也不删', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [rid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    fake.tabsById.clear(); // 恢复未就绪:一个实时标签都没有

    await reconcile(repo, () => {}, { purge: true });
    expect(await repo.getTab(rid!)).toBeTruthy(); // 未删
  });
});
