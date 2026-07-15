import { describe, it, expect } from 'vitest';
import { AICancelledError, isAICancelled } from '@/shared/ai';

describe('isAICancelled', () => {
  it('识别 AICancelledError', () => {
    expect(isAICancelled(new AICancelledError())).toBe(true);
  });
  it('普通 Error 不算取消', () => {
    expect(isAICancelled(new Error('boom'))).toBe(false);
  });
  it('AbortError(超时)不算用户取消', () => {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    expect(isAICancelled(e)).toBe(false);
  });
  it('非 Error 值不报错', () => {
    expect(isAICancelled(undefined)).toBe(false);
    expect(isAICancelled('cancelled')).toBe(false);
  });
});
