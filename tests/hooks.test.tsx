// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// dispatch 是 UI→SW 的唯一出口;mock 掉以断言发出的命令(useDraftNaming/useAiActions)
const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@/entrypoints/sidepanel/store', () => ({ dispatch }));

import { useDraftNaming } from '@/entrypoints/sidepanel/hooks/useDraftNaming';
import { useAiActions } from '@/entrypoints/sidepanel/hooks/useAiActions';
import { useDerived } from '@/entrypoints/sidepanel/hooks/useDerived';
import { DRAFT_CONTEXT_NAME } from '@/shared/messaging';
import { DEFAULT_FLAGS, INBOX_ID, type Context, type TabRecord } from '@/shared/types';

beforeEach(() => dispatch.mockReset());
afterEach(cleanup);

function ctx(id: string, over: Partial<Context> = {}): Context {
  return {
    id,
    name: id,
    origin: 'manual',
    status: 'active',
    color: 'blue',
    createdAt: 0,
    lastActiveAt: 0,
    tabOrder: [],
    ...over,
  };
}
function tab(id: string, over: Partial<TabRecord> = {}): TabRecord {
  return {
    id,
    contextId: 'c1',
    url: `https://${id}.com`,
    title: id,
    chromeTabId: 1,
    firstOpenedAt: 0,
    lastActiveAt: 0,
    ...over,
  };
}

describe('useDraftNaming', () => {
  it('createContext 用 DRAFT_CONTEXT_NAME 哨兵新建并进入编辑', async () => {
    dispatch.mockResolvedValue({ type: 'CONTEXT_CREATED', contextId: 'c1' });
    const { result } = renderHook(() => useDraftNaming());
    await act(async () => {
      await result.current.createContext();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_CONTEXT', name: DRAFT_CONTEXT_NAME });
    expect(result.current.editingId).toBe('c1');
  });

  it('commitName 有效名 → RENAME_CONTEXT', () => {
    const { result } = renderHook(() => useDraftNaming());
    act(() => result.current.commitName(ctx('c1'), '  Real Name  '));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'RENAME_CONTEXT',
      contextId: 'c1',
      name: 'Real Name',
    });
  });

  it('commitName 空 / 哨兵 / 本地化默认名 → 不改名', () => {
    const { result } = renderHook(() => useDraftNaming());
    act(() => result.current.commitName(ctx('c1'), ''));
    act(() => result.current.commitName(ctx('c1'), DRAFT_CONTEXT_NAME));
    act(() => result.current.commitName(ctx('c1'), 'New task')); // en fallback 默认名
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'RENAME_CONTEXT' }));
  });

  it('cancelEdit 空草稿 → DELETE_CONTEXT;有标签草稿 → 不删', async () => {
    dispatch.mockResolvedValue({ type: 'CONTEXT_CREATED', contextId: 'c1' });
    const { result } = renderHook(() => useDraftNaming());
    await act(async () => {
      await result.current.createContext();
    });
    dispatch.mockClear();

    act(() => result.current.cancelEdit(ctx('c1', { tabOrder: ['t1'] }))); // 有标签
    expect(dispatch).not.toHaveBeenCalled();

    act(() => result.current.cancelEdit(ctx('c1', { tabOrder: [] }))); // 空草稿
    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_CONTEXT', contextId: 'c1' });
  });
});

describe('useAiActions', () => {
  const plan = { newGroups: [], assign: [] };

  it('applyAiPlan 全局 UNDOABLE → setUndo + flash', async () => {
    dispatch.mockResolvedValue({ type: 'UNDOABLE', action: 'reorg', token: 'tk', ttlMs: 5000 });
    const setUndo = vi.fn();
    const showFlash = vi.fn();
    const { result } = renderHook(() => useAiActions({ showFlash, setUndo }));
    await act(async () => {
      await result.current.applyAiPlan(plan, { global: true });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'APPLY_AI_PLAN', plan, global: true });
    expect(setUndo).toHaveBeenCalledWith({ action: 'reorg', token: 'tk', ttlMs: 5000 });
    expect(showFlash).toHaveBeenCalledTimes(1);
  });

  it('aiOrganize 错误 → flash 提示、不设 plan', async () => {
    dispatch.mockResolvedValue({ type: 'AI_ERROR', reason: 'no_key' });
    const showFlash = vi.fn();
    const { result } = renderHook(() => useAiActions({ showFlash, setUndo: vi.fn() }));
    await act(async () => {
      await result.current.aiOrganize();
    });
    expect(showFlash).toHaveBeenCalledTimes(1);
    expect(result.current.aiPlan).toBeNull();
  });

  it('aiOrganize 成功 → 设 aiPlan(scope inbox)', async () => {
    dispatch.mockResolvedValue({ type: 'AI_PLAN', plan, tabs: [] });
    const { result } = renderHook(() => useAiActions({ showFlash: vi.fn(), setUndo: vi.fn() }));
    await act(async () => {
      await result.current.aiOrganize();
    });
    expect(result.current.aiPlan).toEqual({ plan, tabs: [], scope: 'inbox' });
  });
});

describe('useDerived', () => {
  const base = {
    flags: DEFAULT_FLAGS,
    portMappings: [],
    now: 1_000_000_000_000,
    ignoredPorts: new Set<number>(),
    ignoredDomains: new Set<string>(),
  };

  it('tabsOf 把 ★重点 排到组顶(稳定)', () => {
    const c = ctx('c1', { tabOrder: ['t1', 't2', 't3'] });
    const recent = base.now; // 非陈旧,避免被下沉过滤掉
    const tabs = [
      tab('t1', { lastActiveAt: recent }),
      tab('t2', { starred: true, lastActiveAt: recent }),
      tab('t3', { lastActiveAt: recent }),
    ];
    const { result } = renderHook(() =>
      useDerived({ ...base, flags: { ...DEFAULT_FLAGS, staleHints: false }, contexts: [c], tabs }),
    );
    const ids = result.current.tabsOf(c).map((t) => t.id);
    expect(ids).toEqual(['t2', 't1', 't3']);
  });

  it('归档任务的 tabsOf 仍包含陈旧标签', () => {
    const old = base.now - 1000 * 60 * 60 * 24 * 30; // 30 天前 → 陈旧
    const c = ctx('c1', { status: 'archived', tabOrder: ['t1'] });
    const tabs = [tab('t1', { chromeTabId: undefined, lastActiveAt: old, firstOpenedAt: old })];
    const { result } = renderHook(() =>
      useDerived({ ...base, flags: { ...DEFAULT_FLAGS, staleHints: true }, contexts: [c], tabs }),
    );
    expect(result.current.tabsOf(c).map((t) => t.id)).toEqual(['t1']);
  });

  it('portSuggestions 每端口去重', () => {
    const c = ctx('c1', { tabOrder: ['t1', 't2'] });
    const tabs = [
      tab('t1', { url: 'http://localhost:3000/a', contextId: 'c1' }),
      tab('t2', { url: 'http://localhost:3000/b', contextId: 'c1' }),
    ];
    const { result } = renderHook(() => useDerived({ ...base, contexts: [c], tabs }));
    expect(result.current.portSuggestions.filter((s) => s.port === 3000)).toHaveLength(1);
  });

  it('domainSuggestions 在 autoCluster=false 时为空', () => {
    const inbox = ctx(INBOX_ID, { name: '未分类', origin: 'auto' });
    const tabs = Array.from({ length: 6 }, (_, i) =>
      tab(`t${i}`, { url: `https://x.example.com/${i}`, contextId: INBOX_ID }),
    );
    const off = renderHook(() =>
      useDerived({
        ...base,
        flags: { ...DEFAULT_FLAGS, autoCluster: false },
        contexts: [inbox],
        tabs,
      }),
    );
    expect(off.result.current.domainSuggestions).toEqual([]);
  });
});
