import { describe, it, expect } from 'vitest';
import { SearchIndex } from '@/core/search';
import { INBOX_ID, type Context, type TabRecord } from '@/shared/types';

const NOW = 1_700_000_000_000;

function ctx(id: string, name: string, status: 'active' | 'archived'): Context {
  return {
    id,
    name,
    origin: id === INBOX_ID ? 'auto' : 'manual',
    status,
    color: id === INBOX_ID ? 'grey' : 'blue',
    createdAt: NOW,
    lastActiveAt: NOW,
    tabOrder: [],
  };
}

function tab(
  id: string,
  contextId: string,
  title: string,
  url: string,
  lastActiveAt = NOW,
): TabRecord {
  return { id, contextId, url, title, firstOpenedAt: NOW, lastActiveAt };
}

describe('SearchIndex', () => {
  it('按标题模糊匹配', () => {
    const idx = new SearchIndex();
    idx.rebuild(
      [ctx('c1', 'bug', 'active')],
      [
        tab('t1', 'c1', 'Fix login authentication', 'https://github.com/x/y'),
        tab('t2', 'c1', 'Weather forecast', 'https://weather.com'),
      ],
    );
    const res = idx.query('login');
    expect(res.map((r) => r.tab.id)).toEqual(['t1']);
  });

  it('可匹配 url 与所属簇名', () => {
    const idx = new SearchIndex();
    idx.rebuild(
      [ctx('c1', 'auth-service', 'active')],
      [tab('t1', 'c1', 'Home', 'https://stackoverflow.com/questions/123')],
    );
    expect(idx.query('stackoverflow').map((r) => r.tab.id)).toEqual(['t1']);
    expect(idx.query('auth-service').map((r) => r.tab.id)).toEqual(['t1']);
  });

  it('打开的标签排在归档之前', () => {
    const idx = new SearchIndex();
    idx.rebuild(
      [ctx('c1', 'open', 'active'), ctx('c2', 'archived', 'archived')],
      [
        tab('t-arch', 'c2', 'React docs', 'https://react.dev'),
        tab('t-open', 'c1', 'React tutorial', 'https://react.dev/learn'),
      ],
    );
    const res = idx.query('react');
    expect(res[0]!.archived).toBe(false);
    expect(res[0]!.tab.id).toBe('t-open');
    expect(res.some((r) => r.tab.id === 't-arch' && r.archived)).toBe(true);
  });

  it('空查询返回空', () => {
    const idx = new SearchIndex();
    idx.rebuild([ctx('c1', 'x', 'active')], [tab('t1', 'c1', 'A', 'https://a.com')]);
    expect(idx.query('   ')).toEqual([]);
  });
});
