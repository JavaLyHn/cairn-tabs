import { describe, it, expect } from 'vitest';
import { parseImport } from '@/shared/import';
import { exportAllJSON } from '@/shared/export';
import type { Context, TabRecord } from '@/shared/types';

const ctx: Context = {
  id: 'c1',
  name: 'Work',
  origin: 'manual',
  status: 'active',
  color: 'blue',
  createdAt: 1,
  lastActiveAt: 2,
  tabOrder: ['t1'],
};
const tab: TabRecord = {
  id: 't1',
  contextId: 'c1',
  url: 'https://a.com',
  title: 'A',
  firstOpenedAt: 1,
  lastActiveAt: 2,
};

describe('parseImport', () => {
  it('round-trips a valid export', () => {
    const json = exportAllJSON([ctx], [tab], 123);
    const r = parseImport(json);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.contexts).toHaveLength(1);
      expect(r.data.tabs).toHaveLength(1);
      expect(r.data.contexts[0]!.id).toBe('c1');
    }
  });

  it('rejects non-JSON', () => {
    expect(parseImport('not json {')).toEqual({ ok: false, reason: 'json' });
  });

  it('rejects wrong version', () => {
    const j = JSON.stringify({ app: 'cairn-tabs', version: 2, contexts: [ctx], tabs: [tab] });
    expect(parseImport(j)).toEqual({ ok: false, reason: 'version' });
  });

  it('rejects a foreign app payload', () => {
    const j = JSON.stringify({ app: 'other', version: 1, contexts: [], tabs: [] });
    expect(parseImport(j)).toEqual({ ok: false, reason: 'schema' });
  });

  it('rejects missing arrays', () => {
    const j = JSON.stringify({ app: 'cairn-tabs', version: 1, contexts: [ctx] });
    expect(parseImport(j)).toEqual({ ok: false, reason: 'schema' });
  });

  it('rejects an empty payload', () => {
    const j = JSON.stringify({ app: 'cairn-tabs', version: 1, contexts: [], tabs: [] });
    expect(parseImport(j)).toEqual({ ok: false, reason: 'empty' });
  });

  it('drops invalid entries but keeps valid ones', () => {
    const j = JSON.stringify({
      app: 'cairn-tabs',
      version: 1,
      contexts: [ctx, { id: 'bad' /* missing fields */ }],
      tabs: [tab, { id: 'x' /* missing fields */ }],
    });
    const r = parseImport(j);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.contexts).toHaveLength(1);
      expect(r.data.tabs).toHaveLength(1);
    }
  });
});
