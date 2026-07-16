import { describe, it, expect, vi } from 'vitest';
import {
  shouldPurgeNow,
  runRecoverySequence,
  type RecoveryDeps,
} from '@/core/background/session-recovery';
import type { Repository } from '@/core/store/repositories';

describe('shouldPurgeNow', () => {
  it('宽限期内(graceUntil 未过)→ 不清删', () => {
    expect(shouldPurgeNow(2000, 1000)).toBe(false);
  });
  it('宽限已过 → 清删', () => {
    expect(shouldPurgeNow(1000, 2000)).toBe(true);
  });
  it('无标志 / 非数字 → 清删', () => {
    expect(shouldPurgeNow(undefined, 1000)).toBe(true);
    expect(shouldPurgeNow('x', 1000)).toBe(true);
    expect(shouldPurgeNow(null, 1000)).toBe(true);
  });
});

describe('runRecoverySequence', () => {
  it('严格顺序:非破坏对账 → 归档未恢复 → 清删对账 → 广播', async () => {
    const calls: string[] = [];
    const deps: RecoveryDeps = {
      reconcile: async (_r, _c, opts) => {
        calls.push(`reconcile:${opts?.purge}`);
      },
      reconcileGroups: async (_r, _c, opts) => {
        calls.push(`reconcileGroups:${opts?.prune}`);
      },
      archiveUnrestored: async () => {
        calls.push('archive');
        return [];
      },
    };
    const onChange = vi.fn();
    await runRecoverySequence({} as Repository, onChange, 123, deps);

    expect(calls).toEqual([
      'reconcile:false',
      'reconcileGroups:false',
      'archive',
      'reconcile:true',
      'reconcileGroups:true',
    ]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('把 now 传给归档判定', async () => {
    const archiveUnrestored = vi.fn(async () => [] as string[]);
    const deps: RecoveryDeps = {
      reconcile: async () => {},
      reconcileGroups: async () => {},
      archiveUnrestored,
    };
    await runRecoverySequence({} as Repository, () => {}, 777, deps);
    expect(archiveUnrestored).toHaveBeenCalledWith({}, 777);
  });
});
