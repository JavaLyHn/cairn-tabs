import { describe, it, expect } from 'vitest';
import { sameDomainSuggestions } from '@/core/clustering/engine';
import { INBOX_ID, type TabRecord } from '@/shared/types';

let seq = 1;
function tab(url: string, opts: Partial<TabRecord> = {}): TabRecord {
  return {
    id: `t${seq++}`,
    contextId: INBOX_ID,
    url,
    title: url,
    chromeTabId: opts.chromeTabId === undefined ? seq : opts.chromeTabId,
    firstOpenedAt: 0,
    lastActiveAt: 0,
    ...opts,
  } as TabRecord;
}

describe('sameDomainSuggestions', () => {
  it('同域达到阈值 → 建议;差一个 → 不建议', () => {
    const four = ['a', 'b', 'c', 'd'].map(() => tab('https://stripe.com/x'));
    expect(sameDomainSuggestions(four, new Set(), 4)).toEqual([
      { domain: 'stripe.com', tabIds: four.map((t) => t.id) },
    ]);
    expect(sameDomainSuggestions(four.slice(0, 3), new Set(), 4)).toEqual([]);
  });

  it('子域归并到 eTLD+1', () => {
    const tabs = [
      tab('https://docs.stripe.com/a'),
      tab('https://dashboard.stripe.com/b'),
      tab('https://stripe.com/c'),
    ];
    const [s] = sameDomainSuggestions(tabs, new Set(), 3);
    expect(s!.domain).toBe('stripe.com');
    expect(s!.tabIds).toHaveLength(3);
  });

  it('置顶 / 非活标签不计入', () => {
    const tabs = [
      tab('https://x.com/1'),
      tab('https://x.com/2'),
      tab('https://x.com/3', { pinned: true }),
      tab('https://x.com/4', { chromeTabId: undefined }), // 已挂起/归档,非活
    ];
    expect(sameDomainSuggestions(tabs, new Set(), 3)).toEqual([]); // 只剩 2 个活未锁定
  });

  it('已有同名簇 → 去重,不再建议', () => {
    const tabs = ['1', '2', '3', '4'].map((n) => tab(`https://github.com/${n}`));
    expect(sameDomainSuggestions(tabs, new Set(['github.com']), 4)).toEqual([]);
    expect(sameDomainSuggestions(tabs, new Set(['other']), 4)).toHaveLength(1);
  });

  it('不跳过通用域(google.com 够数也建议)', () => {
    const tabs = ['1', '2', '3', '4'].map((n) => tab(`https://google.com/search?q=${n}`));
    const [s] = sameDomainSuggestions(tabs, new Set(), 4);
    expect(s!.domain).toBe('google.com');
  });

  it('多域并存,按候选数降序', () => {
    const tabs = [
      ...['1', '2', '3'].map((n) => tab(`https://a.com/${n}`)),
      ...['1', '2', '3', '4', '5'].map((n) => tab(`https://b.com/${n}`)),
    ];
    const out = sameDomainSuggestions(tabs, new Set(), 3);
    expect(out.map((s) => s.domain)).toEqual(['b.com', 'a.com']);
  });

  it('阈值 < 2 兜底为 2', () => {
    const tabs = [tab('https://x.com/1'), tab('https://x.com/2')];
    expect(sameDomainSuggestions(tabs, new Set(), 1)).toHaveLength(1); // 按 2 算 → 命中
    expect(sameDomainSuggestions([tab('https://x.com/1')], new Set(), 1)).toEqual([]);
  });
});
