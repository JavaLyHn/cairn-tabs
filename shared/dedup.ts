// 重复标签检测(F-05)。纯函数,UI 与 SW 共用,保证判定一致。

import type { TabRecord } from './types';

/**
 * 去重键归一化(见 PRD §9):
 * - 普通站点:origin + pathname + search,忽略 hash(#a 与 #b 视为同一页)
 * - localhost / 环回地址:用完整 URL(dev 页面的 hash/query 往往有意义)
 */
export function dedupKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
      return u.href;
    }
    return u.origin + u.pathname + u.search;
  } catch {
    return url;
  }
}

export interface DuplicateGroup {
  key: string;
  keeper: TabRecord; // lastActiveAt 最新的那个,合并时保留
  redundant: TabRecord[]; // 其余,合并时关闭
}

/** 在「打开中的标签」里找同 URL 的重复组(归档标签不参与)。 */
export function findDuplicateGroups(tabs: TabRecord[]): DuplicateGroup[] {
  const open = tabs.filter((t) => t.chromeTabId != null);
  const byKey = new Map<string, TabRecord[]>();
  for (const t of open) {
    const k = dedupKey(t.url);
    const arr = byKey.get(k);
    if (arr) arr.push(t);
    else byKey.set(k, [t]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, arr] of byKey) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    groups.push({ key, keeper: sorted[0]!, redundant: sorted.slice(1) });
  }
  return groups;
}

/** 冗余标签(非 keeper)的 record id 集合,供 UI 打「重复」徽章。 */
export function redundantIds(tabs: TabRecord[]): Set<string> {
  const s = new Set<string>();
  for (const g of findDuplicateGroups(tabs)) {
    for (const r of g.redundant) s.add(r.id);
  }
  return s;
}

/** 冗余标签总数(= 可被合并关闭的数量)。 */
export function redundantCount(tabs: TabRecord[]): number {
  return findDuplicateGroups(tabs).reduce((n, g) => n + g.redundant.length, 0);
}
