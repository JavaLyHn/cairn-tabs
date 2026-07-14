import Dexie, { type Table } from 'dexie';
import type { Context, TabRecord } from '@/shared/types';

// Dexie schema(见设计文档 §5)
// 索引:url 支撑去重(未来);[contextId+lastActiveAt] 支撑簇内排序;status+archivedAt 支撑归档查询。
export class CairnTabsDB extends Dexie {
  contexts!: Table<Context, string>;
  tabs!: Table<TabRecord, string>;

  constructor(name = 'cairn-tabs') {
    super(name);
    this.version(1).stores({
      contexts: 'id, status, lastActiveAt, archivedAt',
      tabs: 'id, contextId, url, chromeTabId, lastActiveAt, [contextId+lastActiveAt]',
    });
  }
}

export const db = new CairnTabsDB();
