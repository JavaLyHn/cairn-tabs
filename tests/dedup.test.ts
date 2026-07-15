import { describe, it, expect } from 'vitest';
import { dedupKey, findDuplicateGroups, duplicateMarks, redundantCount } from '@/shared/dedup';
import { INBOX_ID, type TabRecord } from '@/shared/types';

const NOW = 1_700_000_000_000;

function tab(
  id: string,
  url: string,
  opts: { chromeTabId?: number; firstOpenedAt?: number; contextId?: string } = {},
): TabRecord {
  return {
    id,
    contextId: opts.contextId ?? 'c1',
    url,
    title: url,
    chromeTabId: 'chromeTabId' in opts ? opts.chromeTabId : 1,
    firstOpenedAt: opts.firstOpenedAt ?? NOW,
    lastActiveAt: NOW,
  };
}

describe('dedupKey', () => {
  it('网址完全一致才相等:hash/query 任何差异都算不同', () => {
    expect(dedupKey('https://x.com/a')).toBe(dedupKey('https://x.com/a'));
    expect(dedupKey('https://x.com/a#top')).not.toBe(dedupKey('https://x.com/a#bottom'));
    expect(dedupKey('https://x.com/a')).not.toBe(dedupKey('https://x.com/a#x'));
    expect(dedupKey('https://x.com/a?p=1')).not.toBe(dedupKey('https://x.com/a?p=2'));
  });
});

describe('findDuplicateGroups', () => {
  it('同一网址归为一组,保留最新打开的(firstOpenedAt 最大)为 keeper', () => {
    const tabs = [
      tab('t1', 'https://x.com/a', { firstOpenedAt: NOW + 100 }),
      tab('t2', 'https://x.com/a', { firstOpenedAt: NOW + 300 }), // 最新打开 → keeper
      tab('t3', 'https://x.com/a', { firstOpenedAt: NOW + 200 }),
      tab('t4', 'https://x.com/a#x'), // hash 不同 → 不算重复
    ];
    const groups = findDuplicateGroups(tabs);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keeper.id).toBe('t2');
    expect(groups[0]!.redundant.map((r) => r.id).sort()).toEqual(['t1', 't3']);
  });

  it('优先保留已在任务里的副本(而非未分类里更新打开的那个)', () => {
    // 场景:站点已在某任务里(较早打开),又在未分类新开了一个同址标签(更新)。
    // 合并应保留任务里的、关掉未分类那个——而不是反过来把结果留在未分类。
    const tabs = [
      tab('loose', 'https://x.com/a', { contextId: INBOX_ID, firstOpenedAt: NOW + 500 }),
      tab('grouped', 'https://x.com/a', { contextId: 'task-1', firstOpenedAt: NOW + 1 }),
    ];
    const groups = findDuplicateGroups(tabs);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keeper.id).toBe('grouped');
    expect(groups[0]!.redundant.map((r) => r.id)).toEqual(['loose']);
  });

  it('多个副本都在未分类时,仍按最新打开选 keeper(行为不变)', () => {
    const tabs = [
      tab('older', 'https://y.com/a', { contextId: INBOX_ID, firstOpenedAt: NOW + 1 }),
      tab('newer', 'https://y.com/a', { contextId: INBOX_ID, firstOpenedAt: NOW + 9 }),
    ];
    expect(findDuplicateGroups(tabs)[0]!.keeper.id).toBe('newer');
  });

  it('跨 Context 的同一网址也算重复', () => {
    const a = tab('a', 'https://x.com/p', { firstOpenedAt: NOW + 1 });
    const b = { ...tab('b', 'https://x.com/p'), contextId: 'c2' };
    expect(findDuplicateGroups([a, b])).toHaveLength(1);
  });

  it('归档标签(无 chromeTabId)不参与去重', () => {
    const open = tab('t1', 'https://x.com/a');
    const archived = tab('t2', 'https://x.com/a', { chromeTabId: undefined });
    expect(findDuplicateGroups([open, archived])).toEqual([]);
  });

  it('duplicateMarks 标出 keeper 与 redundant;redundantCount 只数冗余', () => {
    const tabs = [
      tab('t1', 'https://x.com/a', { firstOpenedAt: NOW + 3 }), // keeper
      tab('t2', 'https://x.com/a', { firstOpenedAt: NOW + 1 }),
      tab('t3', 'https://x.com/a', { firstOpenedAt: NOW + 2 }),
    ];
    const marks = duplicateMarks(tabs);
    expect(marks.get('t1')).toBe('keeper');
    expect(marks.get('t2')).toBe('redundant');
    expect(marks.get('t3')).toBe('redundant');
    expect(redundantCount(tabs)).toBe(2);
  });
});
