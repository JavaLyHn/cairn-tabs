import { describe, it, expect, beforeEach } from 'vitest';
import { Repository } from '@/core/store/repositories';
import { CairnTabsDB } from '@/core/store/db';
import { INBOX_ID, type Context, type TabRecord } from '@/shared/types';

let repo: Repository;
let dbCounter = 0;
const NOW = 1_700_000_000_000;

function ctx(id: string, over: Partial<Context> = {}): Context {
  return {
    id,
    name: id.toUpperCase(),
    origin: 'manual',
    status: 'active',
    color: 'blue',
    createdAt: 1,
    lastActiveAt: 2,
    tabOrder: [],
    ...over,
  };
}
function tab(id: string, contextId: string, over: Partial<TabRecord> = {}): TabRecord {
  return {
    id,
    contextId,
    url: `https://${id}.com`,
    title: id,
    chromeTabId: 999,
    windowId: 1,
    firstOpenedAt: 1,
    lastActiveAt: 2,
    ...over,
  };
}

beforeEach(async () => {
  const db = new CairnTabsDB(`import-test-${dbCounter++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(NOW);
});

describe('Repository.importData', () => {
  it('imports named tasks as archived, clearing live-tab fields, preserving starred/pinned', async () => {
    const c = ctx('work', { tabOrder: ['t1'] });
    const t = tab('t1', 'work', { starred: true, pinned: true });
    const res = await repo.importData([c], [t], NOW);
    expect(res).toEqual({ contexts: 1, tabs: 1 });

    const snap = await repo.getSnapshot();
    const imported = snap.contexts.find((x) => x.id === 'work')!;
    expect(imported.status).toBe('archived');
    expect(imported.archivedAt).toBe(NOW);
    expect(imported.nativeGroupId).toBeUndefined();

    const it1 = snap.tabs.find((x) => x.id === 't1')!;
    expect(it1.chromeTabId).toBeUndefined();
    expect(it1.windowId).toBeUndefined();
    expect(it1.url).toBe('https://t1.com');
    expect(it1.starred).toBe(true);
    expect(it1.pinned).toBe(true);
  });

  it('is non-destructive: skips ids that already exist', async () => {
    // 预置一个活跃任务 work + 其标签
    const existing = await repo.createContext('work-live', NOW);
    await repo.addTab(tab('keep', existing.id, { chromeTabId: 5 }), NOW);

    // 导入用同 id 但归档态 —— 应被跳过,不覆盖现有活跃任务
    const res = await repo.importData(
      [ctx(existing.id, { name: 'HIJACK', tabOrder: [] })],
      [],
      NOW,
    );
    expect(res.contexts).toBe(0);

    const after = await repo.getContext(existing.id);
    expect(after!.status).toBe('active');
    expect(after!.name).toBe('work-live');
  });

  it('never imports into or overwrites the built-in Inbox', async () => {
    const res = await repo.importData(
      [ctx(INBOX_ID, { name: 'evil-inbox' })],
      [tab('it', INBOX_ID)],
      NOW,
    );
    expect(res).toEqual({ contexts: 0, tabs: 0 });
    const inbox = await repo.getContext(INBOX_ID);
    expect(inbox!.name).not.toBe('evil-inbox');
  });

  it('only imports tabs belonging to newly-imported contexts', async () => {
    // 标签 orphan 引用一个未被导入的 context → 不导入
    const res = await repo.importData(
      [ctx('a', { tabOrder: ['t1'] })],
      [tab('t1', 'a'), tab('t2', 'missing')],
      NOW,
    );
    expect(res).toEqual({ contexts: 1, tabs: 1 });
    const snap = await repo.getSnapshot();
    expect(snap.tabs.find((x) => x.id === 't2')).toBeUndefined();
  });
});
