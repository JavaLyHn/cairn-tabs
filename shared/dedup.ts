// 重复标签检测(F-05)。纯函数,UI 与 SW 共用,保证判定一致。

import { INBOX_ID, type TabRecord } from './types';

/**
 * 去重键:网址「完全一致」才算重复(区分 hash、query 等一切差异)。
 */
export function dedupKey(url: string): string {
  return url.trim();
}

export interface DuplicateGroup {
  key: string;
  keeper: TabRecord; // 合并时保留:优先已归类到任务的副本,其次最新打开的
  redundant: TabRecord[]; // 其余,合并时关闭
}

/** 在「打开中的标签」里找同一网址的重复组(归档标签不参与)。 */
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
    // keeper 选择:优先「已归类到任务」的副本(未分类的排后),再按最新打开(firstOpenedAt 最大)。
    // 这样合并保留已归类的那个、关掉未分类里的重复;否则新开的未分类副本会当选,合并后结果落到未分类(见 Bug 报告)。
    const sorted = [...arr].sort((a, b) => {
      const la = a.contextId === INBOX_ID ? 1 : 0;
      const lb = b.contextId === INBOX_ID ? 1 : 0;
      if (la !== lb) return la - lb;
      return b.firstOpenedAt - a.firstOpenedAt;
    });
    groups.push({ key, keeper: sorted[0]!, redundant: sorted.slice(1) });
  }
  return groups;
}

/** 每个标签的重复角色:keeper=合并后保留,redundant=会被关闭。供 UI 标注。 */
export function duplicateMarks(tabs: TabRecord[]): Map<string, 'keeper' | 'redundant'> {
  const marks = new Map<string, 'keeper' | 'redundant'>();
  for (const g of findDuplicateGroups(tabs)) {
    marks.set(g.keeper.id, 'keeper');
    for (const r of g.redundant) marks.set(r.id, 'redundant');
  }
  return marks;
}

/** 冗余标签总数(= 合并时会被关闭的数量)。 */
export function redundantCount(tabs: TabRecord[]): number {
  return findDuplicateGroups(tabs).reduce((n, g) => n + g.redundant.length, 0);
}
