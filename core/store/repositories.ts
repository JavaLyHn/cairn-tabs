// 仓储层 —— 唯一的 DB 读写封装(见设计文档 §3)。
// 只操作 Dexie,不碰 chrome.* API,因此可用 fake-indexeddb 单测。

import { nanoid } from 'nanoid';
import { db as defaultDb, CairnTabsDB } from './db';
import {
  INBOX_ID,
  CONTEXT_PALETTE,
  type Context,
  type ContextColor,
  type TabRecord,
} from '@/shared/types';

export class Repository {
  constructor(private db: CairnTabsDB = defaultDb) {}

  /** 确保内置「未分类」簇存在。幂等。 */
  async ensureInbox(now: number): Promise<void> {
    const existing = await this.db.contexts.get(INBOX_ID);
    if (!existing) {
      await this.db.contexts.put({
        id: INBOX_ID,
        name: '未分类',
        origin: 'auto',
        status: 'active',
        color: 'grey', // 未分类不建原生分组,颜色仅占位
        createdAt: now,
        lastActiveAt: now,
        tabOrder: [],
      });
    }
  }

  /** 选一个当前未被占用的调色板颜色(全用满则轮转)。 */
  private async nextColor(): Promise<ContextColor> {
    const contexts = await this.db.contexts.toArray();
    const used = new Set(contexts.filter((c) => c.id !== INBOX_ID).map((c) => c.color));
    for (const color of CONTEXT_PALETTE) {
      if (!used.has(color)) return color;
    }
    return CONTEXT_PALETTE[used.size % CONTEXT_PALETTE.length] ?? 'blue';
  }

  async getSnapshot(): Promise<{ contexts: Context[]; tabs: TabRecord[] }> {
    const [contexts, tabs] = await Promise.all([
      this.db.contexts.toArray(),
      this.db.tabs.toArray(),
    ]);
    return { contexts, tabs };
  }

  async getContext(id: string): Promise<Context | undefined> {
    return this.db.contexts.get(id);
  }

  async getTab(id: string): Promise<TabRecord | undefined> {
    return this.db.tabs.get(id);
  }

  async getTabByChromeId(chromeTabId: number): Promise<TabRecord | undefined> {
    return this.db.tabs.where('chromeTabId').equals(chromeTabId).first();
  }

  // ---- Context CRUD ----

  async createContext(
    name: string,
    now: number,
    opts?: { color?: ContextColor; nativeGroupId?: number },
  ): Promise<Context> {
    const ctx: Context = {
      id: nanoid(),
      name: name.trim() || '新任务',
      origin: 'manual',
      status: 'active',
      color: opts?.color ?? (await this.nextColor()),
      nativeGroupId: opts?.nativeGroupId,
      createdAt: now,
      lastActiveAt: now,
      tabOrder: [],
    };
    await this.db.contexts.put(ctx);
    return ctx;
  }

  async renameContext(contextId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await this.db.contexts.update(contextId, { name: trimmed });
  }

  async setContextColor(contextId: string, color: ContextColor): Promise<void> {
    await this.db.contexts.update(contextId, { color });
  }

  // ---- 原生 tabGroups 映射 ----

  async findContextByNativeGroupId(groupId: number): Promise<Context | undefined> {
    if (groupId < 0) return undefined;
    return this.db.contexts.filter((c) => c.nativeGroupId === groupId).first();
  }

  async setNativeGroupId(contextId: string, groupId: number | undefined): Promise<void> {
    await this.db.contexts.update(contextId, { nativeGroupId: groupId });
  }

  /**
   * 删除手动簇。内置未分类不可删。
   * - 活跃簇:标签仍是真实打开的,迁回未分类保留。
   * - 归档簇:标签只是归档指针,连同记录一并清除(不能迁回未分类,否则会变成死记录幻影)。
   */
  async deleteContext(contextId: string, now: number): Promise<void> {
    if (contextId === INBOX_ID) return;
    await this.db.transaction('rw', this.db.contexts, this.db.tabs, async () => {
      const ctx = await this.db.contexts.get(contextId);
      if (!ctx) return;
      if (ctx.status === 'archived') {
        await this.db.tabs.where('contextId').equals(contextId).delete();
      } else {
        for (const tabId of ctx.tabOrder) {
          await this.moveTabInTxn(tabId, INBOX_ID, now);
        }
      }
      await this.db.contexts.delete(contextId);
    });
  }

  // ---- Tab 生命周期(供 tab-sync 使用)----

  /** 新标签落入某簇(默认未分类),追加到 tabOrder 末尾。 */
  async addTab(
    partial: Omit<TabRecord, 'id' | 'contextId'> & { contextId?: string },
    now: number,
  ): Promise<TabRecord> {
    const contextId = partial.contextId ?? INBOX_ID;
    return this.db.transaction('rw', this.db.contexts, this.db.tabs, async () => {
      // 幂等:同一 chromeTabId 已有记录则复用,绝不重复插。
      // 事务串行化保证 check-then-insert 原子,挡住加载期 onCreated/onUpdated 并发建重复记录。
      if (partial.chromeTabId != null) {
        const existing = await this.db.tabs.where('chromeTabId').equals(partial.chromeTabId).first();
        if (existing) return existing;
      }
      const record: TabRecord = { ...partial, id: nanoid(), contextId };
      await this.db.tabs.put(record);
      await this.appendToOrder(contextId, record.id, now);
      return record;
    });
  }

  /** 更新标签的 url/title/favicon/活跃时间等运行态字段。 */
  async updateTab(id: string, patch: Partial<TabRecord>): Promise<void> {
    await this.db.tabs.update(id, patch);
  }

  /** 标记为人工归属,聚簇引擎不再改动。 */
  async pinTab(id: string): Promise<void> {
    await this.db.tabs.update(id, { pinned: true });
  }

  async touchTab(id: string, now: number): Promise<void> {
    const tab = await this.db.tabs.get(id);
    if (!tab) return;
    await this.db.transaction('rw', this.db.contexts, this.db.tabs, async () => {
      await this.db.tabs.update(id, { lastActiveAt: now });
      await this.db.contexts.update(tab.contextId, { lastActiveAt: now });
    });
  }

  /** 标签被真实关闭(非收纳):从簇内移除并删除记录。 */
  async removeTab(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.contexts, this.db.tabs, async () => {
      const tab = await this.db.tabs.get(id);
      if (!tab) return;
      await this.removeFromOrder(tab.contextId, id);
      await this.db.tabs.delete(id);
    });
  }

  async removeTabByChromeId(chromeTabId: number): Promise<void> {
    const tab = await this.getTabByChromeId(chromeTabId);
    if (tab) await this.removeTab(tab.id);
  }

  /** 拖拽纠错:把标签移到目标簇,维护两侧 tabOrder。 */
  async moveTab(tabRecordId: string, toContextId: string, now: number): Promise<void> {
    await this.db.transaction('rw', this.db.contexts, this.db.tabs, async () => {
      await this.moveTabInTxn(tabRecordId, toContextId, now);
    });
  }

  // ---- 收纳 / 恢复 ----

  /** 整簇收纳:事务落盘 status=archived、清空 chromeTabId。返回被关闭的 chromeTabId 列表供调用方 remove。 */
  async archiveContext(contextId: string, now: number): Promise<number[]> {
    if (contextId === INBOX_ID) return [];
    return this.db.transaction('rw', this.db.contexts, this.db.tabs, async () => {
      const ctx = await this.db.contexts.get(contextId);
      if (!ctx || ctx.status === 'archived') return [];
      const tabs = await this.db.tabs.where('contextId').equals(contextId).toArray();
      const closedTabIds = tabs.map((t) => t.chromeTabId).filter((n): n is number => n != null);
      await this.db.tabs.bulkPut(tabs.map((t) => ({ ...t, chromeTabId: undefined, windowId: undefined })));
      await this.db.contexts.update(contextId, {
        status: 'archived',
        archivedAt: now,
        nativeGroupId: undefined,
      });
      return closedTabIds;
    });
  }

  /** 恢复:把簇标回 active,清 archivedAt。chromeTabId 由调用方重开标签后回填。 */
  async setContextActive(contextId: string): Promise<void> {
    await this.db.contexts.update(contextId, { status: 'active', archivedAt: undefined });
  }

  /** 恢复时回填新 chromeTabId。 */
  async bindChromeTab(
    tabRecordId: string,
    chromeTabId: number,
    windowId: number,
    now: number,
  ): Promise<void> {
    await this.db.tabs.update(tabRecordId, { chromeTabId, windowId, lastActiveAt: now });
  }

  // ---- 私有:tabOrder 维护 ----

  private async appendToOrder(contextId: string, tabId: string, now: number): Promise<void> {
    const ctx = await this.db.contexts.get(contextId);
    if (!ctx) return;
    if (!ctx.tabOrder.includes(tabId)) {
      await this.db.contexts.update(contextId, {
        tabOrder: [...ctx.tabOrder, tabId],
        lastActiveAt: now,
      });
    }
  }

  private async removeFromOrder(contextId: string, tabId: string): Promise<void> {
    const ctx = await this.db.contexts.get(contextId);
    if (!ctx) return;
    await this.db.contexts.update(contextId, {
      tabOrder: ctx.tabOrder.filter((id) => id !== tabId),
    });
  }

  /** 必须在事务内调用。 */
  private async moveTabInTxn(tabRecordId: string, toContextId: string, now: number): Promise<void> {
    const tab = await this.db.tabs.get(tabRecordId);
    if (!tab || tab.contextId === toContextId) return;
    const target = await this.db.contexts.get(toContextId);
    if (!target) return;
    await this.removeFromOrder(tab.contextId, tabRecordId);
    await this.db.tabs.update(tabRecordId, { contextId: toContextId });
    await this.appendToOrder(toContextId, tabRecordId, now);
  }
}

export const repository = new Repository();
