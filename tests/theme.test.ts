import { describe, it, expect } from 'vitest';
import {
  isValidHex,
  isThemeMode,
  resolveAccentHex,
  accentPresetId,
  resolveTheme,
  DEFAULT_ACCENT_HEX,
} from '@/entrypoints/sidepanel/theme/theme';

describe('isValidHex', () => {
  it('接受 3/6 位 hex(大小写)', () => {
    expect(isValidHex('#abc')).toBe(true);
    expect(isValidHex('#AABBCC')).toBe(true);
    expect(isValidHex('  #6366f1  ')).toBe(true);
  });
  it('拒绝非法', () => {
    expect(isValidHex('6366f1')).toBe(false); // 缺 #
    expect(isValidHex('#12')).toBe(false);
    expect(isValidHex('#1234')).toBe(false);
    expect(isValidHex('#gggggg')).toBe(false);
    expect(isValidHex('')).toBe(false);
  });
});

describe('isThemeMode', () => {
  it('只认三档', () => {
    expect(isThemeMode('auto')).toBe(true);
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('system')).toBe(false);
    expect(isThemeMode(undefined)).toBe(false);
  });
});

describe('resolveAccentHex', () => {
  it('预设 id → 对应 hex', () => {
    expect(resolveAccentHex('teal')).toBe('#1d9e75');
    expect(resolveAccentHex('indigo')).toBe('#6366f1');
  });
  it('合法自定义 hex → 原值(小写)', () => {
    expect(resolveAccentHex('#AABBCC')).toBe('#aabbcc');
    expect(resolveAccentHex('#f0f')).toBe('#f0f');
  });
  it('非法自定义 hex → 默认', () => {
    expect(resolveAccentHex('#zzz')).toBe(DEFAULT_ACCENT_HEX);
    expect(resolveAccentHex('#12')).toBe(DEFAULT_ACCENT_HEX);
  });
  it('未知 id / 空 → 默认', () => {
    expect(resolveAccentHex('chartreuse')).toBe(DEFAULT_ACCENT_HEX);
    expect(resolveAccentHex(undefined)).toBe(DEFAULT_ACCENT_HEX);
    expect(resolveAccentHex('')).toBe(DEFAULT_ACCENT_HEX);
  });
});

describe('accentPresetId', () => {
  it('预设 id 原样返回', () => {
    expect(accentPresetId('rose')).toBe('rose');
  });
  it('等于某预设的自定义 hex → 归位到该预设', () => {
    expect(accentPresetId('#1D9E75')).toBe('teal');
  });
  it('不匹配任何预设的自定义 hex → null', () => {
    expect(accentPresetId('#123456')).toBe(null);
  });
  it('空 → 默认预设', () => {
    expect(accentPresetId(undefined)).toBe('teal');
  });
});

describe('resolveTheme', () => {
  it('强制模式忽略系统', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('auto 跟随系统', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
  });
});
