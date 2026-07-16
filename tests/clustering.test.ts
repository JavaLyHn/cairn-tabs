import { describe, it, expect } from 'vitest';
import { assignContext } from '@/core/clustering/engine';
import { bumpPenalty } from '@/core/clustering/rules';
import { INBOX_ID, type Context, type TabRecord } from '@/shared/types';

const NOW = 1_700_000_000_000;

function ctx(id: string, lastActiveAt = NOW): Context {
  return {
    id,
    name: id,
    origin: id === INBOX_ID ? 'auto' : 'manual',
    status: 'active',
    color: 'blue',
    createdAt: NOW,
    lastActiveAt,
    tabOrder: [],
  };
}
function tab(
  id: string,
  contextId: string,
  url: string,
  extra: Partial<TabRecord> = {},
): TabRecord {
  return {
    id,
    contextId,
    url,
    title: url,
    chromeTabId: 1,
    firstOpenedAt: NOW,
    lastActiveAt: NOW,
    ...extra,
  };
}

describe('assignContext', () => {
  it('opener 属于某簇 → 归入该簇', () => {
    const contexts = [ctx(INBOX_ID), ctx('c1')];
    const tabs = [tab('t1', 'c1', 'https://github.com/a/b')];
    const target = assignContext({
      url: 'https://stackoverflow.com/q/1',
      openerRecordId: 't1',
      now: NOW,
      contexts,
      tabs,
      penalties: {},
    });
    expect(target).toBe('c1');
  });

  it('无 opener、弱信号 → 保守进未分类', () => {
    const contexts = [ctx(INBOX_ID), ctx('c1', NOW)];
    const tabs = [tab('t1', 'c1', 'https://github.com/a/b')];
    // 同域名但无 opener:domain+temporal+path 不足 0.5
    const target = assignContext({
      url: 'https://github.com/a/b/pull/9',
      now: NOW,
      contexts,
      tabs,
      penalties: {},
    });
    expect(target).toBe(INBOX_ID);
  });

  it('负样本足够大时,即便 opener 命中也不归入', () => {
    const contexts = [ctx(INBOX_ID), ctx('c1')];
    const tabs = [tab('t1', 'c1', 'https://github.com/a/b')];
    let penalties = {};
    penalties = bumpPenalty(penalties, 'stackoverflow.com', 'c1'); // 0.3
    penalties = bumpPenalty(penalties, 'stackoverflow.com', 'c1'); // 0.6(封顶)
    const target = assignContext({
      url: 'https://stackoverflow.com/q/1',
      openerRecordId: 't1',
      now: NOW,
      contexts,
      tabs,
      penalties,
    });
    // opener 0.55 + temporal 0.15 − 0.6 = 0.10 < 0.5
    expect(target).toBe(INBOX_ID);
  });

  it('没有候选命名簇 → 未分类', () => {
    const target = assignContext({
      url: 'https://x.com',
      now: NOW,
      contexts: [ctx(INBOX_ID)],
      tabs: [],
      penalties: {},
    });
    expect(target).toBe(INBOX_ID);
  });
});
