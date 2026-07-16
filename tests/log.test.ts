import { describe, it, expect, vi, afterEach } from 'vitest';
import { logError, logDebug } from '@/shared/log';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logError', () => {
  it('总是输出到 console.error,带前缀 + scope + 错误 + 上下文', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    logError('settings.persist', err, { key: 'flags' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('[cairn-tabs] settings.persist', err, { key: 'flags' });
  });
});

describe('logDebug', () => {
  // Vitest 下 import.meta.env.DEV 为 true → 走 DEV 分支输出;此处校验该分支带前缀。
  // 生产(DEV=false)静默的行为由 isDev() 的实现保证,不在此断言(测试环境无法切 DEV)。
  it('DEV 分支输出到 console.debug,带前缀 + scope + 上下文', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logDebug('tab.race', 123);
    expect(spy).toHaveBeenCalledWith('[cairn-tabs] tab.race', 123);
  });
});
