import { describe, it, expect } from 'vitest';
import { isStale, staleTabs, daysSince } from '@/shared/stale';
import type { TabRecord } from '@/shared/types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 10_000 * DAY; // 一个远离 0 的稳定时间基准

function tab(over: Partial<TabRecord>): TabRecord {
  return {
    id: over.id ?? 'x',
    chromeTabId: 'chromeTabId' in over ? over.chromeTabId : 1,
    contextId: 'inbox',
    url: over.url ?? 'https://a.com',
    title: 't',
    firstOpenedAt: NOW,
    lastActiveAt: over.lastActiveAt ?? NOW,
    ...over,
  };
}

describe('isStale', () => {
  it('超过阈值天数未访问 → 陈旧', () => {
    expect(isStale(tab({ lastActiveAt: NOW - 8 * DAY }), NOW, 7)).toBe(true);
    expect(isStale(tab({ lastActiveAt: NOW - 6 * DAY }), NOW, 7)).toBe(false);
  });
  it('恰好等于阈值 → 陈旧', () => {
    expect(isStale(tab({ lastActiveAt: NOW - 7 * DAY }), NOW, 7)).toBe(true);
  });
  it('已归档(无 chromeTabId)不算陈旧', () => {
    expect(isStale(tab({ chromeTabId: undefined, lastActiveAt: NOW - 30 * DAY }), NOW, 7)).toBe(
      false,
    );
  });
  it('重点标签(starred)永不陈旧', () => {
    expect(isStale(tab({ starred: true, lastActiveAt: NOW - 90 * DAY }), NOW, 7)).toBe(false);
  });
});

describe('staleTabs', () => {
  it('筛出陈旧、最久未访问在前', () => {
    const tabs = [
      tab({ id: 'fresh', lastActiveAt: NOW - 1 * DAY }),
      tab({ id: 'old', lastActiveAt: NOW - 20 * DAY }),
      tab({ id: 'mid', lastActiveAt: NOW - 9 * DAY }),
      tab({ id: 'archived', chromeTabId: undefined, lastActiveAt: NOW - 40 * DAY }),
    ];
    expect(staleTabs(tabs, NOW, 7).map((t) => t.id)).toEqual(['old', 'mid']);
  });
});

describe('daysSince', () => {
  it('向下取整,不为负', () => {
    expect(daysSince(NOW - 3 * DAY - 5000, NOW)).toBe(3);
    expect(daysSince(NOW + 10 * DAY, NOW)).toBe(0);
  });
});
