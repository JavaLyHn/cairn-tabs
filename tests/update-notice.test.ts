import { describe, it, expect } from 'vitest';
import { shouldNoticeUpdate } from '@/entrypoints/sidepanel/hooks/useUpdateNotice';

describe('shouldNoticeUpdate', () => {
  it('首次安装(无旧版本记录)→ 不提示', () => {
    expect(shouldNoticeUpdate(undefined, '1.0.0')).toBe(false);
  });
  it('同版本 → 不提示', () => {
    expect(shouldNoticeUpdate('1.0.0', '1.0.0')).toBe(false);
  });
  it('升级(旧版本 ≠ 当前)→ 提示', () => {
    expect(shouldNoticeUpdate('1.0.0', '1.0.1')).toBe(true);
  });
  it('当前版本取不到(空)→ 不提示', () => {
    expect(shouldNoticeUpdate('1.0.0', '')).toBe(false);
  });
});
