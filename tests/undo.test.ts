import { describe, it, expect, vi } from 'vitest';
import { UndoManager } from '@/core/background/undo';

describe('UndoManager', () => {
  it('archive:register 后 consume 返回 action + contextId', () => {
    const u = new UndoManager();
    const { token } = u.register('archive', 'ctx-1', 5000);
    expect(u.consume(token)).toEqual({ action: 'archive', contextId: 'ctx-1', reorg: undefined });
  });

  it('reorg:registerReorg 后 consume 返回 action:reorg + payload', () => {
    const u = new UndoManager();
    const reorg = {
      moves: [{ tabId: 't1', toContextId: 'c0' }],
      recreate: [],
      deleteContextIds: ['c9'],
    };
    const { token } = u.registerReorg(reorg, 5000);
    expect(u.consume(token)).toEqual({ action: 'reorg', contextId: undefined, reorg });
  });

  it('consume 后 token 作废;未知 token → undefined', () => {
    const u = new UndoManager();
    const { token } = u.register('archive', 'x', 5000);
    u.consume(token);
    expect(u.consume(token)).toBeUndefined();
    expect(u.consume('nope')).toBeUndefined();
  });

  it('TTL 到期后自动作废(archive):consume 返回 undefined', () => {
    vi.useFakeTimers();
    try {
      const u = new UndoManager();
      const { token } = u.register('archive', 'x', 5000);
      vi.advanceTimersByTime(5001);
      expect(u.consume(token)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('TTL 到期后自动作废(reorg)', () => {
    vi.useFakeTimers();
    try {
      const u = new UndoManager();
      const { token } = u.registerReorg({ moves: [], recreate: [], deleteContextIds: [] }, 3000);
      vi.advanceTimersByTime(3001);
      expect(u.consume(token)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
