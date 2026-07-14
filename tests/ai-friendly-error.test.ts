import { describe, it, expect } from 'vitest';
import { friendlyAIError } from '@/shared/ai';

describe('friendlyAIError', () => {
  it('401/403 → 认证失败', () => {
    expect(friendlyAIError('openai 401')).toContain('认证失败');
    expect(friendlyAIError('custom 403')).toContain('认证失败');
  });
  it('404 → 地址或模型不存在', () => {
    expect(friendlyAIError('custom 404')).toContain('地址或模型不存在');
  });
  it('429 → 限流', () => {
    expect(friendlyAIError('openai 429')).toContain('限流');
  });
  it('5xx → 服务端错误', () => {
    expect(friendlyAIError('custom 502')).toContain('服务端错误');
    expect(friendlyAIError('custom 500')).toContain('服务端错误');
  });
  it('abort → 连接超时', () => {
    expect(friendlyAIError('The operation was aborted')).toBe('连接超时');
    expect(friendlyAIError('signal is aborted without reason')).toBe('连接超时');
  });
  it('no text → 响应格式异常', () => {
    expect(friendlyAIError('custom: no text')).toContain('响应格式异常');
  });
  it('failed to fetch → 网络错误', () => {
    expect(friendlyAIError('TypeError: Failed to fetch')).toContain('网络错误');
  });
  it('未知消息原样返回', () => {
    expect(friendlyAIError('something odd')).toBe('something odd');
  });
});
