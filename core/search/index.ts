// 全局搜索(见设计文档 §7.4)。SW 内存持有索引,标签事件后全量重建(500 标签 <20ms)。

import Fuse from 'fuse.js';
import type { Context, TabRecord, SearchResult } from '@/shared/types';

interface IndexItem {
  tab: TabRecord;
  contextId: string;
  contextName: string;
  archived: boolean;
  title: string;
  url: string;
}

const FUSE_OPTIONS: import('fuse.js').IFuseOptions<IndexItem> = {
  includeScore: true,
  threshold: 0.35,
  ignoreLocation: true,
  keys: [
    { name: 'title', weight: 0.6 },
    { name: 'url', weight: 0.25 },
    { name: 'contextName', weight: 0.15 },
  ],
};

export class SearchIndex {
  private fuse: Fuse<IndexItem> = new Fuse<IndexItem>([], FUSE_OPTIONS);

  /** 从快照重建索引。 */
  rebuild(contexts: Context[], tabs: TabRecord[]): void {
    const nameById = new Map(contexts.map((c) => [c.id, c]));
    const items: IndexItem[] = tabs.map((tab) => {
      const ctx = nameById.get(tab.contextId);
      return {
        tab,
        contextId: tab.contextId,
        contextName: ctx?.name ?? '',
        archived: ctx?.status === 'archived',
        title: tab.title,
        url: tab.url,
      };
    });
    this.fuse = new Fuse(items, FUSE_OPTIONS);
  }

  /** 查询。排序:打开的排在归档前;组内按 lastActiveAt 倒序。 */
  query(q: string): SearchResult[] {
    const trimmed = q.trim();
    if (!trimmed) return [];
    const hits = this.fuse.search(trimmed).map((r) => r.item);
    const toResult = (i: IndexItem): SearchResult => ({
      tab: i.tab,
      contextId: i.contextId,
      contextName: i.contextName,
      archived: i.archived,
    });
    const open = hits.filter((i) => !i.archived).sort((a, b) => b.tab.lastActiveAt - a.tab.lastActiveAt);
    const archived = hits.filter((i) => i.archived).sort((a, b) => b.tab.lastActiveAt - a.tab.lastActiveAt);
    return [...open, ...archived].map(toResult);
  }
}
