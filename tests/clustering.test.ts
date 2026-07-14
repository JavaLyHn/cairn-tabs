import { describe, it, expect } from 'vitest';
import { assignContext, findPromotableCluster } from '@/core/clustering/engine';
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
function tab(id: string, contextId: string, url: string, extra: Partial<TabRecord> = {}): TabRecord {
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

describe('findPromotableCluster', () => {
  it('未分类里 ≥3 个 opener 连通、时间跨度内 → 升格,取根标题命名', () => {
    const root = tab('r', INBOX_ID, 'https://github.com/a/b/issues/1', {
      title: 'Fix login bug',
      firstOpenedAt: NOW,
    });
    const c1 = tab('c1', INBOX_ID, 'https://so.com/1', { openerRecordId: 'r', firstOpenedAt: NOW + 1000 });
    const c2 = tab('c2', INBOX_ID, 'https://so.com/2', { openerRecordId: 'r', firstOpenedAt: NOW + 2000 });
    const cluster = findPromotableCluster([c2, root, c1], NOW + 3000);
    expect(cluster).not.toBeNull();
    expect(cluster!.name).toBe('Fix login bug');
    expect(cluster!.memberIds).toEqual(['r', 'c1', 'c2']); // 按时间排序
  });

  it('少于 3 个 → 不升格', () => {
    const root = tab('r', INBOX_ID, 'https://x.com', { firstOpenedAt: NOW });
    const c1 = tab('c1', INBOX_ID, 'https://x.com/1', { openerRecordId: 'r', firstOpenedAt: NOW + 1 });
    expect(findPromotableCluster([root, c1], NOW)).toBeNull();
  });

  it('时间跨度超窗 → 不升格', () => {
    const root = tab('r', INBOX_ID, 'https://x.com', { firstOpenedAt: NOW });
    const c1 = tab('c1', INBOX_ID, 'https://x.com/1', { openerRecordId: 'r', firstOpenedAt: NOW + 1000 });
    const c2 = tab('c2', INBOX_ID, 'https://x.com/2', {
      openerRecordId: 'r',
      firstOpenedAt: NOW + 20 * 60 * 1000, // 20min 后,超 15min 窗
    });
    expect(findPromotableCluster([root, c1, c2], NOW)).toBeNull();
  });

  it('pinned 标签不参与,断链后不足 3 → 不升格', () => {
    const root = tab('r', INBOX_ID, 'https://x.com', { firstOpenedAt: NOW, pinned: true });
    const c1 = tab('c1', INBOX_ID, 'https://x.com/1', { openerRecordId: 'r', firstOpenedAt: NOW + 1 });
    const c2 = tab('c2', INBOX_ID, 'https://x.com/2', { openerRecordId: 'r', firstOpenedAt: NOW + 2 });
    // root 被 pin 剔除后,c1/c2 失去共同 opener → 各自独立 → 无 ≥3 分量
    expect(findPromotableCluster([root, c1, c2], NOW)).toBeNull();
  });
});
