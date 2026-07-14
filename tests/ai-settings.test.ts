import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { AISettingsStore } from '@/core/background/settings';

beforeEach(() => new FakeChrome().install());

describe('AISettingsStore', () => {
  it('默认 anthropic、未配置', async () => {
    const s = new AISettingsStore();
    await s.load();
    expect(s.provider()).toBe('anthropic');
    expect(s.configured()).toBe(false);
    expect(s.status()).toEqual({ provider: 'anthropic', hasKey: false, model: 'claude-haiku-4-5' });
  });

  it('存 key → 已配置;状态不含 key', async () => {
    const s = new AISettingsStore();
    await s.load();
    await s.set('anthropic', 'sk-ant');
    expect(s.configured()).toBe(true);
    expect(s.keyFor()).toBe('sk-ant');
    expect(s.status()).toEqual({ provider: 'anthropic', hasKey: true, model: 'claude-haiku-4-5' });
    expect(JSON.stringify(s.status())).not.toContain('sk-ant');
  });

  it('key/model 按 provider 分别存;切换 provider 不串', async () => {
    const s = new AISettingsStore();
    await s.load();
    await s.set('anthropic', 'sk-ant', 'claude-x');
    await s.set('openai', 'sk-oai');
    expect(s.provider()).toBe('openai');
    expect(s.configured()).toBe(true); // openai 有 key
    expect(s.effectiveModel()).toBe('gpt-4o-mini'); // openai 无 model 覆盖 → 默认
    expect(s.keyFor('anthropic')).toBe('sk-ant');
    expect(s.effectiveModel('anthropic')).toBe('claude-x');
  });

  it('空 key 清除该 provider 的 key', async () => {
    const s = new AISettingsStore();
    await s.load();
    await s.set('anthropic', 'sk-ant');
    await s.set('anthropic', '   ');
    expect(s.configured()).toBe(false);
  });

  it('持久化:新实例可恢复', async () => {
    const s1 = new AISettingsStore();
    await s1.load();
    await s1.set('openai', 'sk-oai', 'gpt-x');
    const s2 = new AISettingsStore();
    await s2.load();
    expect(s2.provider()).toBe('openai');
    expect(s2.keyFor('openai')).toBe('sk-oai');
    expect(s2.effectiveModel('openai')).toBe('gpt-x');
  });
});
