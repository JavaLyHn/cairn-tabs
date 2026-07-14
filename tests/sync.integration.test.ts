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
let dbn = 0;

async function snapshot() {
  return repo.getSnapshot();
}
async function manualContextId(): Promise<string> {
  const { contexts } = await snapshot();
  return contexts.find((c) => c.id !== INBOX_ID)!.id;
}
async function inboxTabIds(): Promise<string[]> {
  const c = await repo.getContext(INBOX_ID);
  return c!.tabOrder;
}

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, ctx.onChange);
  registerGroupListeners(repo, ctx.onChange);
});

describe('archive → restore 全链路(回归:不产生未分类幻影)', () => {
  it('收纳再恢复后,标签只在原簇、未分类不残留重复', async () => {
    // 用户开两个标签 → 落入未分类
    await fake.userOpenTab('https://github.com/a/b/issues/1', { title: 'Issue 1' });
    await fake.userOpenTab('https://stackoverflow.com/q/1', { title: 'SO 1' });
    expect((await inboxTabIds()).length).toBe(2);

    // 建簇 + 把两个标签拖进去
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'bug-42' }, ctx);
    const cid = await manualContextId();
    const inboxIds = await inboxTabIds();
    for (const rid of [...inboxIds]) {
      await handleCommand({ type: 'MOVE_TAB', tabRecordId: rid, toContextId: cid }, ctx);
    }
    expect((await inboxTabIds()).length).toBe(0);
    expect((await repo.getContext(cid))!.tabOrder.length).toBe(2);
    // 原生分组已建立
    expect((await repo.getContext(cid))!.nativeGroupId).toBeGreaterThanOrEqual(0);
    expect(fake.tabsById.size).toBe(2);

    // 收纳:关闭标签
    await handleCommand({ type: 'ARCHIVE_CONTEXT', contextId: cid }, ctx);
    expect((await repo.getContext(cid))!.status).toBe('archived');
    expect(fake.tabsById.size).toBe(0); // chrome 里标签都关了
    // 关键回归点:未分类不应因关闭事件回灌而出现幻影记录
    expect(await inboxTabIds()).toEqual([]);
    const afterArchive = await snapshot();
    expect(afterArchive.tabs.filter((t) => t.contextId === INBOX_ID)).toEqual([]);

    // 恢复
    await handleCommand({ type: 'RESTORE_CONTEXT', contextId: cid }, ctx);
    const c = await repo.getContext(cid);
    expect(c!.status).toBe('active');
    expect(c!.tabOrder.length).toBe(2);
    // 关键回归点:恢复后未分类仍为空,无重复
    expect(await inboxTabIds()).toEqual([]);
    // chrome 里恢复了两个标签,且被编回一个分组
    expect(fake.tabsById.size).toBe(2);
    const groupIds = new Set([...fake.tabsById.values()].map((t) => t.groupId));
    expect(groupIds.size).toBe(1);
    expect([...groupIds][0]).toBeGreaterThanOrEqual(0);

    // 关键回归点:恢复自建分组时产生的 group 事件不得被误收编成「新分组」
    const ctxs = (await snapshot()).contexts.filter((c) => c.id !== INBOX_ID);
    expect(ctxs).toHaveLength(1); // 只有原簇,无幻影 Context
    expect(ctxs[0]!.id).toBe(cid);
    expect(ctxs.some((c) => c.name === '新分组')).toBe(false);
  });
});

describe('CREATE_CONTEXT 草稿去重', () => {
  it('重复点新建不会生成多个「新任务」,返回同一 id', async () => {
    const e1 = await handleCommand({ type: 'CREATE_CONTEXT', name: '新任务' }, ctx);
    const e2 = await handleCommand({ type: 'CREATE_CONTEXT', name: '新任务' }, ctx);
    expect(e1?.type).toBe('CONTEXT_CREATED');
    expect(e2?.type).toBe('CONTEXT_CREATED');
    expect(e1).toEqual(e2); // 同一 contextId
    const manual = (await snapshot()).contexts.filter((c) => c.id !== INBOX_ID);
    expect(manual).toHaveLength(1);
  });

  it('改名后再点新建会生成新的草稿', async () => {
    const e1 = (await handleCommand({ type: 'CREATE_CONTEXT', name: '新任务' }, ctx)) as {
      contextId: string;
    };
    await handleCommand({ type: 'RENAME_CONTEXT', contextId: e1.contextId, name: 'bug-1' }, ctx);
    await handleCommand({ type: 'CREATE_CONTEXT', name: '新任务' }, ctx);
    const manual = (await snapshot()).contexts.filter((c) => c.id !== INBOX_ID);
    expect(manual).toHaveLength(2);
    expect(manual.filter((c) => c.name === '新任务')).toHaveLength(1);
  });
});

describe('MERGE_DUPLICATES(F-05)', () => {
  it('关闭冗余标签、每组保留最近活跃的,记录同步清除', async () => {
    await fake.userOpenTab('https://x.com/a', { title: 'A#1' });
    const keeperTabId = await fake.userOpenTab('https://x.com/a', { title: 'A#2' });
    await fake.userOpenTab('https://x.com/a', { title: 'A#3' });
    await fake.userOpenTab('https://x.com/unique', { title: 'U' });

    // 让第二个 a 成为最近活跃 → keeper
    const keeperRec = (await snapshot()).tabs.find((t) => t.chromeTabId === keeperTabId)!;
    await repo.updateTab(keeperRec.id, { lastActiveAt: Date.now() + 10_000 });

    await handleCommand({ type: 'MERGE_DUPLICATES' }, ctx);

    // chrome 里只剩 keeper + unique
    expect(fake.tabsById.size).toBe(2);
    expect(fake.tabsById.has(keeperTabId)).toBe(true);
    // DB 记录同步:keeper 保留,冗余记录已随 onRemoved 清除
    const after = await snapshot();
    expect(after.tabs.map((t) => t.id).sort()).toEqual(
      [keeperRec.id, after.tabs.find((t) => t.url === 'https://x.com/unique')!.id].sort(),
    );
  });
});

describe('标签被 Chrome 替换后关闭仍能同步移除(onReplaced)', () => {
  it('标签换 id(discard 等)后再关闭,侧边栏记录被移除', async () => {
    const oldId = await fake.userOpenTab('https://a.com/1', { title: 'A' });
    const [rid] = await inboxTabIds();
    expect(rid).toBeDefined();

    const newId = await fake.userReplaceTab(oldId); // Chrome 换了 id
    await fake.tabs.remove(newId); // 用户在标签栏关闭它

    expect(await repo.getTab(rid!)).toBeUndefined(); // 记录应被移除,而非残留
    expect(await inboxTabIds()).toEqual([]);
  });
});

describe('CLOSE_TAB 对失效标签的健壮性', () => {
  it('关闭一个 chrome 标签已消失的记录时,记录被清除(不静默残留)', async () => {
    await fake.userOpenTab('https://a.com/1', { title: 'A' });
    const [rid] = await inboxTabIds();
    const rec = (await snapshot()).tabs.find((t) => t.id === rid)!;
    // 让底层 chrome 标签「凭空消失」(模拟已失效但记录还在的情形)
    fake.tabsById.delete(rec.chromeTabId!);

    await handleCommand({ type: 'CLOSE_TAB', tabRecordId: rid! }, ctx);

    expect(await repo.getTab(rid!)).toBeUndefined();
    expect(await inboxTabIds()).toEqual([]);
  });
});

describe('自动聚簇(F-07)', () => {
  it('未分类里 opener 树 ≥3 → 自动升格为新命名簇并成组', async () => {
    const root = await fake.userOpenTab('https://github.com/a/b/issues/1', { title: 'Fix login' });
    await fake.userOpenTab('https://stackoverflow.com/q/1', { title: 'SO 1', openerTabId: root });
    // 第 3 个出现时触发升格
    await fake.userOpenTab('https://stackoverflow.com/q/2', { title: 'SO 2', openerTabId: root });

    const named = (await snapshot()).contexts.filter((c) => c.id !== INBOX_ID);
    expect(named).toHaveLength(1);
    expect(named[0]!.name).toBe('Fix login');
    expect(named[0]!.tabOrder).toHaveLength(3);
    expect(await inboxTabIds()).toEqual([]);
    // 三个标签被编入同一个原生分组
    const gids = new Set([...fake.tabsById.values()].map((t) => t.groupId));
    expect(gids.size).toBe(1);
    expect([...gids][0]).toBeGreaterThanOrEqual(0);
  });

  it('从命名簇内标签点开的新标签,经原生分组归入该簇', async () => {
    // 先手动建簇并放一个标签(建立原生分组)
    const t = await fake.userOpenTab('https://github.com/a/b', { title: 'repo' });
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'work' }, ctx);
    const cid = (await snapshot()).contexts.find((c) => c.name === 'work')!.id;
    const [rid] = await inboxTabIds();
    await handleCommand({ type: 'MOVE_TAB', tabRecordId: rid!, toContextId: cid }, ctx);

    const rec = (await snapshot()).tabs.find((x) => x.id === rid)!;
    const gid = fake.tabsById.get(rec.chromeTabId!)!.groupId; // 该簇的原生分组
    // Chrome 会把从组内标签点开的子标签放进同组:模拟为 create 到该 group
    const child = await fake.userOpenTab('https://docs.gh.com/x', { title: 'docs' });
    await fake.tabs.group({ tabIds: [child], groupId: gid });

    const childRec = (await snapshot()).tabs.find((x) => x.chromeTabId === child)!;
    expect(childRec.contextId).toBe(cid); // 自动归入 work 簇
  });
});

describe('原生 UI 把标签拖出分组(入站)', () => {
  it('拖出分组的标签回到未分类', async () => {
    await fake.userOpenTab('https://a.com/1', { title: 'A' });
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'task' }, ctx);
    const cid = await manualContextId();
    const [rid] = await inboxTabIds();
    await handleCommand({ type: 'MOVE_TAB', tabRecordId: rid!, toContextId: cid }, ctx);
    expect((await repo.getContext(cid))!.tabOrder.length).toBe(1);

    // 找到该标签的 chromeTabId,模拟原生拖出
    const rec = (await snapshot()).tabs.find((t) => t.id === rid)!;
    await fake.userUngroup(rec.chromeTabId!);

    expect((await repo.getTab(rid!))!.contextId).toBe(INBOX_ID);
    expect((await inboxTabIds())).toContain(rid);
  });
});
