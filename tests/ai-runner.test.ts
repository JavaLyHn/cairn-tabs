import { describe, it, expect } from 'vitest';
import { createAiRunner } from '@/core/background/ai-runner';
import { isAICancelled } from '@/shared/ai';

/** 一个在 signal abort 时以 AbortError 拒绝的请求(模拟被 abort 的 fetch)。 */
function abortable(signal: AbortSignal): Promise<string> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
}

describe('createAiRunner', () => {
  it('用户 cancel → AICancelledError', async () => {
    const r = createAiRunner();
    const res = r.run(abortable, 10_000).then(() => null, (e) => e);
    r.cancel();
    expect(isAICancelled(await res)).toBe(true);
  });

  it('超时(非用户)→ 原始错误,不算取消', async () => {
    const r = createAiRunner();
    const err = await r.run(abortable, 5).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isAICancelled(err)).toBe(false);
  });

  it('取消 R1 后立刻起 R2(会重置共享态)→ R1 仍判定为取消', async () => {
    const r = createAiRunner();
    const r1 = r.run(abortable, 10_000).then(() => null, (e) => e);
    r.cancel(); // 取消 R1
    const r2 = r.run(async () => 'ok', 10_000).then((v) => v, (e) => e); // R2 立刻开始并很快成功
    expect(isAICancelled(await r1)).toBe(true); // R1 必须仍是取消,不被 R2 清掉
    expect(await r2).toBe('ok');
  });
});
