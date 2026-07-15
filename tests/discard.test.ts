import { describe, it, expect } from 'vitest';
import { shouldDiscard, formatReclaimed, BYTES_PER_DISCARD } from '@/shared/discard';
import type { TabRecord } from '@/shared/types';

const MIN = 60_000;
const NOW = 1_000_000_000;
const OPTS = { discardAfterMinutes: 30, skipLocalhost: true };

function tab(over: Partial<TabRecord>): TabRecord {
  return {
    id: 'x',
    chromeTabId: 'chromeTabId' in over ? over.chromeTabId : 1,
    contextId: 'inbox',
    url: over.url ?? 'https://a.com',
    title: 't',
    firstOpenedAt: NOW,
    lastActiveAt: over.lastActiveAt ?? NOW,
    ...over,
  };
}
const idle = { active: false, audible: false, pinned: false, discarded: false };

describe('shouldDiscard', () => {
  it('空闲超过阈值 → 挂起', () => {
    expect(shouldDiscard(tab({ lastActiveAt: NOW - 31 * MIN }), idle, NOW, OPTS)).toBe(true);
  });
  it('空闲未到阈值 → 不挂起', () => {
    expect(shouldDiscard(tab({ lastActiveAt: NOW - 20 * MIN }), idle, NOW, OPTS)).toBe(false);
  });
  it('活跃 / 播放音频 / 置顶 / 已挂起 → 不挂起', () => {
    const old = { lastActiveAt: NOW - 60 * MIN };
    expect(shouldDiscard(tab(old), { ...idle, active: true }, NOW, OPTS)).toBe(false);
    expect(shouldDiscard(tab(old), { ...idle, audible: true }, NOW, OPTS)).toBe(false);
    expect(shouldDiscard(tab(old), { ...idle, pinned: true }, NOW, OPTS)).toBe(false);
    expect(shouldDiscard(tab(old), { ...idle, discarded: true }, NOW, OPTS)).toBe(false);
  });
  it('localhost 默认不挂起,关掉白名单则挂起', () => {
    const rec = tab({ url: 'http://localhost:3000/x', lastActiveAt: NOW - 60 * MIN });
    expect(shouldDiscard(rec, idle, NOW, OPTS)).toBe(false);
    expect(shouldDiscard(rec, idle, NOW, { ...OPTS, skipLocalhost: false })).toBe(true);
  });
  it('重点标签(starred)永不自动挂起', () => {
    expect(shouldDiscard(tab({ starred: true, lastActiveAt: NOW - 120 * MIN }), idle, NOW, OPTS)).toBe(false);
  });
  it('记录已挂起或无真实标签 → 不挂起', () => {
    expect(shouldDiscard(tab({ discarded: true, lastActiveAt: NOW - 60 * MIN }), idle, NOW, OPTS)).toBe(false);
    expect(shouldDiscard(tab({ lastActiveAt: NOW - 60 * MIN }), undefined, NOW, OPTS)).toBe(false);
    expect(shouldDiscard(tab({ chromeTabId: undefined, lastActiveAt: NOW - 60 * MIN }), idle, NOW, OPTS)).toBe(false);
  });
});

describe('formatReclaimed', () => {
  it('按 MB / GB 格式化', () => {
    expect(formatReclaimed(0)).toBe('0');
    expect(formatReclaimed(BYTES_PER_DISCARD)).toBe('~80 MB');
    expect(formatReclaimed(23 * BYTES_PER_DISCARD)).toBe('~1.8 GB');
  });
});
