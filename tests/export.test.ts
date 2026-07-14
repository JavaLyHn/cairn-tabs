import { describe, it, expect } from 'vitest';
import { contextToMarkdown, exportAllJSON } from '@/shared/export';
import type { Context, TabRecord } from '@/shared/types';

const NOW = 1_700_000_000_000; // 2023-11-14 (UTC)

function ctx(name: string, archivedAt?: number): Context {
  return {
    id: 'c1',
    name,
    origin: 'manual',
    status: archivedAt ? 'archived' : 'active',
    color: 'blue',
    createdAt: NOW,
    archivedAt,
    lastActiveAt: NOW,
    tabOrder: ['t1', 't2'],
  };
}
function tab(id: string, title: string, url: string): TabRecord {
  return { id, contextId: 'c1', url, title, chromeTabId: 1, firstOpenedAt: NOW, lastActiveAt: NOW };
}

describe('contextToMarkdown', () => {
  it('输出 ## 任务名 (日期) + 链接列表', () => {
    const md = contextToMarkdown(ctx('bug-42', NOW), [
      tab('t1', 'Fix login', 'https://github.com/x/y/issues/1'),
      tab('t2', 'SO answer', 'https://stackoverflow.com/q/1'),
    ]);
    expect(md).toContain('## bug-42 (');
    expect(md).toContain('- [Fix login](https://github.com/x/y/issues/1)');
    expect(md).toContain('- [SO answer](https://stackoverflow.com/q/1)');
  });

  it('清理标题里会破坏链接的方括号', () => {
    const md = contextToMarkdown(ctx('t'), [tab('t1', 'a [beta] b', 'https://x.com')]);
    expect(md).toContain('- [a beta b](https://x.com)');
  });
});

describe('exportAllJSON', () => {
  it('输出可解析的备份结构', () => {
    const json = exportAllJSON([ctx('t')], [tab('t1', 'A', 'https://x.com')], NOW);
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe('cairn-tabs');
    expect(parsed.version).toBe(1);
    expect(parsed.contexts).toHaveLength(1);
    expect(parsed.tabs).toHaveLength(1);
  });
});
