import { describe, it, expect } from 'vitest';
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
});
