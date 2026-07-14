import { describe, it, expect } from 'vitest';
import { dedupKey, findDuplicateGroups, redundantIds, redundantCount } from '@/shared/dedup';
import type { TabRecord } from '@/shared/types';

const NOW = 1_700_000_000_000;

function tab(id: string, url: string, opts: { chromeTabId?: number; lastActiveAt?: number } = {}): TabRecord {
  return {
    id,
    contextId: 'c1',
    url,
    title: url,
    chromeTabId: 'chromeTabId' in opts ? opts.chromeTabId : 1, // 允许显式 undefined(归档态)
    firstOpenedAt: NOW,
    lastActiveAt: opts.lastActiveAt ?? NOW,
  };
}

describe('dedupKey', () => {
  it('忽略 hash,但区分 query', () => {
    expect(dedupKey('https://x.com/a#top')).toBe(dedupKey('https://x.com/a#bottom'));
    expect(dedupKey('https://x.com/a?p=1')).not.toBe(dedupKey('https://x.com/a?p=2'));
  });

  it('localhost 用完整 URL(含 hash)', () => {
    expect(dedupKey('http://localhost:3000/#/a')).not.toBe(dedupKey('http://localhost:3000/#/b'));
    expect(dedupKey('http://127.0.0.1:5173/x#1')).not.toBe(dedupKey('http://127.0.0.1:5173/x#2'));
  });
});

describe('findDuplicateGroups', () => {
  it('同 URL(忽略 hash)归为一组,保留最近活跃的为 keeper', () => {
    const tabs = [
      tab('t1', 'https://x.com/a#one', { lastActiveAt: NOW + 100 }),
      tab('t2', 'https://x.com/a#two', { lastActiveAt: NOW + 300 }), // 最新 → keeper
      tab('t3', 'https://x.com/a', { lastActiveAt: NOW + 200 }),
      tab('t4', 'https://x.com/other', { lastActiveAt: NOW }),
    ];
    const groups = findDuplicateGroups(tabs);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keeper.id).toBe('t2');
    expect(groups[0]!.redundant.map((r) => r.id).sort()).toEqual(['t1', 't3']);
  });

  it('跨 Context 的同 URL 也算重复', () => {
    const a = tab('a', 'https://x.com/p', { lastActiveAt: NOW + 1 });
    const b = { ...tab('b', 'https://x.com/p'), contextId: 'c2' };
    expect(findDuplicateGroups([a, b])).toHaveLength(1);
  });

  it('归档标签(无 chromeTabId)不参与去重', () => {
    const open = tab('t1', 'https://x.com/a');
    const archived = tab('t2', 'https://x.com/a', { chromeTabId: undefined });
    expect(findDuplicateGroups([open, archived])).toEqual([]);
  });

  it('redundantIds / redundantCount', () => {
    const tabs = [
      tab('t1', 'https://x.com/a', { lastActiveAt: NOW + 3 }),
      tab('t2', 'https://x.com/a', { lastActiveAt: NOW + 1 }),
      tab('t3', 'https://x.com/a', { lastActiveAt: NOW + 2 }),
    ];
    expect(redundantCount(tabs)).toBe(2);
    expect(redundantIds(tabs)).toEqual(new Set(['t2', 't3'])); // 保留最新 t1
  });
});
