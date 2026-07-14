import { describe, it, expect, beforeEach } from 'vitest';
import { Repository } from '@/core/store/repositories';
import { CairnTabsDB } from '@/core/store/db';
import { INBOX_ID, type TabRecord } from '@/shared/types';

let repo: Repository;
let dbCounter = 0;
const NOW = 1_700_000_000_000;

function makeTabInput(url: string, title: string, chromeTabId: number) {
  return {
    chromeTabId,
    windowId: 1,
    url,
    title,
    firstOpenedAt: NOW,
    lastActiveAt: NOW,
  } satisfies Omit<TabRecord, 'id' | 'contextId'>;
}

beforeEach(async () => {
  const db = new CairnTabsDB(`test-${dbCounter++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(NOW);
});

describe('ensureInbox', () => {
  it('创建内置未分类簇,且幂等', async () => {
    await repo.ensureInbox(NOW); // 再调一次
    const { contexts } = await repo.getSnapshot();
    const inboxes = contexts.filter((c) => c.id === INBOX_ID);
    expect(inboxes).toHaveLength(1);
    expect(inboxes[0]!.name).toBe('未分类');
  });
});

describe('addTab', () => {
  it('新标签默认落入未分类并追加到 tabOrder', async () => {
    const t = await repo.addTab(makeTabInput('https://a.com', 'A', 101), NOW);
    const inbox = await repo.getContext(INBOX_ID);
    expect(t.contextId).toBe(INBOX_ID);
    expect(inbox!.tabOrder).toEqual([t.id]);
  });

  it('按 chromeTabId 可查回记录', async () => {
    const t = await repo.addTab(makeTabInput('https://a.com', 'A', 101), NOW);
    const found = await repo.getTabByChromeId(101);
    expect(found?.id).toBe(t.id);
  });
});

describe('moveTab', () => {
  it('拖拽到目标簇,维护两侧 tabOrder', async () => {
    const t = await repo.addTab(makeTabInput('https://a.com', 'A', 101), NOW);
    const ctx = await repo.createContext('bug-123', NOW);
    await repo.moveTab(t.id, ctx.id, NOW);

    const inbox = await repo.getContext(INBOX_ID);
    const target = await repo.getContext(ctx.id);
    const moved = await repo.getTab(t.id);

    expect(inbox!.tabOrder).toEqual([]);
    expect(target!.tabOrder).toEqual([t.id]);
    expect(moved!.contextId).toBe(ctx.id);
  });
});

describe('archive / restore 往返', () => {
  it('收纳清空 chromeTabId 并返回被关闭的 id;恢复回填并复活', async () => {
    const ctx = await repo.createContext('task', NOW);
    const t1 = await repo.addTab(makeTabInput('https://a.com', 'A', 101), NOW);
    const t2 = await repo.addTab(makeTabInput('https://b.com', 'B', 102), NOW);
    await repo.moveTab(t1.id, ctx.id, NOW);
    await repo.moveTab(t2.id, ctx.id, NOW);

    const closed = await repo.archiveContext(ctx.id, NOW + 1);
    expect(new Set(closed)).toEqual(new Set([101, 102]));

    const archived = await repo.getContext(ctx.id);
    expect(archived!.status).toBe('archived');
    expect(archived!.archivedAt).toBe(NOW + 1);
    expect(archived!.tabOrder).toEqual([t1.id, t2.id]); // 顺序保留
    const at1 = await repo.getTab(t1.id);
    expect(at1!.chromeTabId).toBeUndefined();

    // 恢复:回填新 chromeTabId + 置为 active
    await repo.setContextActive(ctx.id);
    await repo.bindChromeTab(t1.id, 201, 1, NOW + 2);
    const active = await repo.getContext(ctx.id);
    const rt1 = await repo.getTab(t1.id);
    expect(active!.status).toBe('active');
    expect(active!.archivedAt).toBeUndefined();
    expect(rt1!.chromeTabId).toBe(201);
  });

  it('删除归档簇会清除其记录,不回灌未分类', async () => {
    const ctx = await repo.createContext('task', NOW);
    const t = await repo.addTab(makeTabInput('https://a.com', 'A', 101), NOW);
    await repo.moveTab(t.id, ctx.id, NOW);
    await repo.archiveContext(ctx.id, NOW + 1);

    await repo.deleteContext(ctx.id, NOW + 2);

    expect(await repo.getContext(ctx.id)).toBeUndefined();
    expect(await repo.getTab(t.id)).toBeUndefined(); // 记录被清除
    const inbox = await repo.getContext(INBOX_ID);
    expect(inbox!.tabOrder).not.toContain(t.id); // 未回灌未分类
  });

  it('删除活跃簇会把标签迁回未分类', async () => {
    const ctx = await repo.createContext('task', NOW);
    const t = await repo.addTab(makeTabInput('https://a.com', 'A', 101), NOW);
    await repo.moveTab(t.id, ctx.id, NOW);

    await repo.deleteContext(ctx.id, NOW + 1);

    expect((await repo.getTab(t.id))!.contextId).toBe(INBOX_ID);
    expect((await repo.getContext(INBOX_ID))!.tabOrder).toContain(t.id);
  });

  it('内置未分类不可整簇收纳', async () => {
    await repo.addTab(makeTabInput('https://a.com', 'A', 101), NOW);
    const closed = await repo.archiveContext(INBOX_ID, NOW);
    expect(closed).toEqual([]);
    const inbox = await repo.getContext(INBOX_ID);
    expect(inbox!.status).toBe('active');
  });
});

describe('deleteContext', () => {
  it('删除手动簇,标签退回未分类', async () => {
    const ctx = await repo.createContext('temp', NOW);
    const t = await repo.addTab(makeTabInput('https://a.com', 'A', 101), NOW);
    await repo.moveTab(t.id, ctx.id, NOW);

    await repo.deleteContext(ctx.id, NOW);

    expect(await repo.getContext(ctx.id)).toBeUndefined();
    const moved = await repo.getTab(t.id);
    const inbox = await repo.getContext(INBOX_ID);
    expect(moved!.contextId).toBe(INBOX_ID);
    expect(inbox!.tabOrder).toContain(t.id);
  });
});

describe('原生分组映射', () => {
  it('createContext 分配不重复的调色板颜色', async () => {
    const a = await repo.createContext('a', NOW);
    const b = await repo.createContext('b', NOW);
    expect(a.color).not.toBe(b.color);
    expect(a.color).not.toBe('grey'); // grey 留给未分类
  });

  it('可按 nativeGroupId 查回 Context 并设置/清除', async () => {
    const ctx = await repo.createContext('grp', NOW);
    await repo.setNativeGroupId(ctx.id, 77);
    expect((await repo.findContextByNativeGroupId(77))?.id).toBe(ctx.id);
    await repo.setNativeGroupId(ctx.id, undefined);
    expect(await repo.findContextByNativeGroupId(77)).toBeUndefined();
  });

  it('收纳时清除 nativeGroupId', async () => {
    const ctx = await repo.createContext('grp', NOW);
    await repo.setNativeGroupId(ctx.id, 88);
    const t = await repo.addTab(makeTabInput('https://a.com', 'A', 101), NOW);
    await repo.moveTab(t.id, ctx.id, NOW);
    await repo.archiveContext(ctx.id, NOW + 1);
    const archived = await repo.getContext(ctx.id);
    expect(archived!.nativeGroupId).toBeUndefined();
  });

  it('createContext 可采纳指定颜色与 groupId(收编原生分组)', async () => {
    const ctx = await repo.createContext('native', NOW, { color: 'pink', nativeGroupId: 5 });
    expect(ctx.color).toBe('pink');
    expect(ctx.nativeGroupId).toBe(5);
    expect((await repo.findContextByNativeGroupId(5))?.id).toBe(ctx.id);
  });
});

describe('removeTab', () => {
  it('关闭标签:从簇内移除并删记录', async () => {
    const t = await repo.addTab(makeTabInput('https://a.com', 'A', 101), NOW);
    await repo.removeTabByChromeId(101);
    expect(await repo.getTab(t.id)).toBeUndefined();
    const inbox = await repo.getContext(INBOX_ID);
    expect(inbox!.tabOrder).not.toContain(t.id);
  });
});
