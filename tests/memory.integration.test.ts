import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { Repository } from '@/core/store/repositories';
import { CairnTabsDB } from '@/core/store/db';
import { SearchIndex } from '@/core/search';
import { UndoManager } from '@/core/background/undo';
import { registerTabListeners } from '@/core/background/tab-sync';
import { handleCommand, type CommandContext } from '@/core/background/commands';
import { runDiscardScan } from '@/core/background/discard-scan';
import { BYTES_PER_DISCARD } from '@/shared/discard';
import { INBOX_ID } from '@/shared/types';

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

let fake: FakeChrome;
let repo: Repository;
let ctx: CommandContext;
let dbn = 5000;

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`mem-itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, ctx.onChange);
});

/** 打开一个标签,并把它的 lastActiveAt 拨到过去 ageMs,模拟长时间未访问。 */
async function openAndAge(url: string, ageMs: number, title?: string) {
  const chromeId = await fake.userOpenTab(url, { title });
  const rec = await repo.getTabByChromeId(chromeId);
  await repo.updateTab(rec!.id, { lastActiveAt: Date.now() - ageMs });
  return { chromeId, recId: rec!.id };
}

describe('ARCHIVE_STALE (F-10)', () => {
  it('把陈旧标签整批收纳,新鲜标签保留', async () => {
    const stale = await openAndAge('https://github.com/a/b/issues/1', 8 * DAY, 'old');
    const fresh = await openAndAge('https://stackoverflow.com/q/1', 1 * DAY, 'fresh');
    expect(fake.tabsById.size).toBe(2);

    const ev = await handleCommand({ type: 'ARCHIVE_STALE' }, ctx);
    expect(ev?.type).toBe('UNDOABLE');

    // 陈旧的被关闭,新鲜的仍开着
    expect(fake.tabsById.has(stale.chromeId)).toBe(false);
    expect(fake.tabsById.has(fresh.chromeId)).toBe(true);

    // 陈旧记录进了一个归档的「陈旧」任务,chromeTabId 已清空
    const { contexts, tabs } = await repo.getSnapshot();
    const archived = contexts.find((c) => c.status === 'archived' && c.name.startsWith('陈旧'));
    expect(archived).toBeTruthy();
    const staleRec = tabs.find((t) => t.id === stale.recId)!;
    expect(staleRec.contextId).toBe(archived!.id);
    expect(staleRec.chromeTabId).toBeUndefined();
  });

  it('无陈旧标签时不产生任务', async () => {
    await openAndAge('https://a.com', 1 * DAY);
    const ev = await handleCommand({ type: 'ARCHIVE_STALE' }, ctx);
    expect(ev).toBeUndefined();
    const { contexts } = await repo.getSnapshot();
    expect(contexts.filter((c) => c.status === 'archived')).toHaveLength(0);
  });
});

describe('归档计入回收(F-11 内存)', () => {
  it('ARCHIVE_CONTEXT:关闭 N 个活标签 → onReclaim(N × BYTES_PER_DISCARD)', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    await fake.userOpenTab('https://b.com', { title: 'B' });
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'task' }, ctx);
    const cid = (await repo.getSnapshot()).contexts.find((c) => c.name === 'task')!.id;
    for (const tid of [...(await repo.getContext(INBOX_ID))!.tabOrder]) {
      await handleCommand({ type: 'MOVE_TAB', tabRecordId: tid, toContextId: cid }, ctx);
    }
    let reclaimed = 0;
    const rctx: CommandContext = { ...ctx, onReclaim: async (b) => void (reclaimed += b) };
    await handleCommand({ type: 'ARCHIVE_CONTEXT', contextId: cid }, rctx);
    expect(reclaimed).toBe(2 * BYTES_PER_DISCARD);
  });

  it('ARCHIVE_STALE:收纳 N 个陈旧标签 → onReclaim(N × BYTES_PER_DISCARD)', async () => {
    await openAndAge('https://old1.com', 8 * DAY);
    await openAndAge('https://old2.com', 8 * DAY);
    let reclaimed = 0;
    const rctx: CommandContext = { ...ctx, onReclaim: async (b) => void (reclaimed += b) };
    await handleCommand({ type: 'ARCHIVE_STALE' }, rctx);
    expect(reclaimed).toBe(2 * BYTES_PER_DISCARD);
  });

  it('无标签可归档时不调用 onReclaim', async () => {
    let called = false;
    const rctx: CommandContext = { ...ctx, onReclaim: async () => void (called = true) };
    await handleCommand({ type: 'ARCHIVE_STALE' }, rctx); // 无陈旧标签
    expect(called).toBe(false);
  });
});

describe('runDiscardScan (F-11)', () => {
  const opts = { discardAfterMinutes: 30, skipLocalhost: true };

  it('挂起空闲标签,回填 discarded 与回收量', async () => {
    const idle = await openAndAge('https://a.com/x', 40 * MIN);
    let reclaimed = 0;
    const n = await runDiscardScan(
      repo,
      opts,
      async (b) => void (reclaimed += b),
      () => {},
    );
    expect(n).toBe(1);
    expect(fake.tabsById.get(idle.chromeId)!.discarded).toBe(true);
    expect((await repo.getTab(idle.recId))!.discarded).toBe(true);
    expect(reclaimed).toBe(BYTES_PER_DISCARD);
  });

  it('活跃(未到阈值)与 localhost 不挂起', async () => {
    const local = await openAndAge('http://localhost:3000/', 60 * MIN);
    const recent = await openAndAge('https://b.com/', 5 * MIN);
    const n = await runDiscardScan(
      repo,
      opts,
      async () => {},
      () => {},
    );
    expect(n).toBe(0);
    expect(fake.tabsById.get(local.chromeId)!.discarded).toBe(false);
    expect(fake.tabsById.get(recent.chromeId)!.discarded).toBe(false);
  });

  it('已挂起的标签不重复挂起', async () => {
    await openAndAge('https://c.com/', 60 * MIN);
    expect(
      await runDiscardScan(
        repo,
        opts,
        async () => {},
        () => {},
      ),
    ).toBe(1);
    expect(
      await runDiscardScan(
        repo,
        opts,
        async () => {},
        () => {},
      ),
    ).toBe(0);
  });
});
