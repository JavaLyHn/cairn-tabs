import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { AISettingsStore } from '@/core/background/settings';

beforeEach(() => new FakeChrome().install());

async function fresh(): Promise<AISettingsStore> {
  const s = new AISettingsStore();
  await s.load();
  return s;
}

describe('AISettingsStore(多份配置)', () => {
  it('全新:空列表、无当前、未就绪', async () => {
    const s = await fresh();
    expect(s.profiles()).toEqual([]);
    expect(s.active()).toBeNull();
    expect(s.configured()).toBe(false);
    expect(s.status()).toEqual({ profiles: [], activeId: null, ready: false });
  });

  it('新建即设为当前;status 不含 key', async () => {
    const s = await fresh();
    const id = await s.upsert({ label: '主力', provider: 'anthropic', model: 'claude-x' }, 'sk-ant');
    expect(s.activeId()).toBe(id);
    expect(s.configured()).toBe(true);
    expect(s.keyFor(id)).toBe('sk-ant');
    expect(s.status().profiles[0]).toMatchObject({
      id,
      label: '主力',
      model: 'claude-x',
      hasKey: true,
    });
    expect(JSON.stringify(s.status())).not.toContain('sk-ant');
  });

  it('label 留空 → 取模型名,再空 → 取服务商名', async () => {
    const s = await fresh();
    const a = await s.upsert({ label: '', provider: 'openai', model: 'gpt-4o' }, 'k1');
    const b = await s.upsert({ label: '', provider: 'openai', model: '' }, 'k2');
    expect(s.profiles().find((p) => p.id === a)!.label).toBe('gpt-4o');
    expect(s.profiles().find((p) => p.id === b)!.label).toBe('OpenAI');
  });

  it('可存多份、互不串;切换当前', async () => {
    const s = await fresh();
    const a = await s.upsert(
      { label: 'A', provider: 'custom', model: 'gpt-4o', baseUrl: 'https://a.com/v1' },
      'ka',
    );
    const b = await s.upsert(
      { label: 'B', provider: 'custom', model: 'claude-3-5-sonnet', baseUrl: 'https://b.com/v1' },
      'kb',
    );
    expect(s.profiles()).toHaveLength(2);
    expect(s.activeId()).toBe(b); // 最后新建的成为当前
    await s.activate(a);
    expect(s.active()!.model).toBe('gpt-4o');
    expect(s.keyFor(b)).toBe('kb'); // 另一份的 key 仍在
  });

  it('编辑:key 留空不动、改模型;不改变当前指针', async () => {
    const s = await fresh();
    const a = await s.upsert({ label: 'A', provider: 'anthropic', model: 'm1' }, 'ka');
    const b = await s.upsert({ label: 'B', provider: 'anthropic', model: 'm2' }, 'kb');
    expect(s.activeId()).toBe(b);
    await s.upsert({ id: a, label: 'A2', provider: 'anthropic', model: 'm1b' }); // key 未传
    expect(s.activeId()).toBe(b); // 编辑不夺当前
    expect(s.profiles().find((p) => p.id === a)!.model).toBe('m1b');
    expect(s.keyFor(a)).toBe('ka'); // 留空 → 保留
  });

  it('effectiveModel:空 model 用默认', async () => {
    const s = await fresh();
    await s.upsert({ label: 'x', provider: 'anthropic', model: '' }, 'k');
    expect(s.effectiveModel(s.active()!)).toBe('claude-haiku-4-5');
  });

  it('custom:缺 baseUrl → 未就绪;补上 → 就绪', async () => {
    const s = await fresh();
    const id = await s.upsert({ label: 'r', provider: 'custom', model: 'gpt-4o' }, 'k');
    expect(s.configured()).toBe(false);
    await s.upsert({
      id,
      label: 'r',
      provider: 'custom',
      model: 'gpt-4o',
      baseUrl: 'https://r.com/v1',
    });
    expect(s.configured()).toBe(true);
    expect(s.status().profiles[0]!.baseUrl).toBe('https://r.com/v1');
  });

  it('删除当前份 → 当前落到列表首个;删非当前不动当前', async () => {
    const s = await fresh();
    const a = await s.upsert({ label: 'A', provider: 'anthropic', model: 'm1' }, 'ka');
    const b = await s.upsert({ label: 'B', provider: 'anthropic', model: 'm2' }, 'kb');
    await s.remove(b); // b 是当前
    expect(s.activeId()).toBe(a);
    expect(s.keyFor(b)).toBeUndefined();
    await s.remove(a);
    expect(s.activeId()).toBeNull();
    expect(s.configured()).toBe(false);
  });

  it('持久化:新实例可恢复,id/当前不变', async () => {
    const s1 = await fresh();
    const a = await s1.upsert(
      { label: 'A', provider: 'custom', model: 'gpt-4o', baseUrl: 'https://a.com/v1' },
      'ka',
    );
    const s2 = new AISettingsStore();
    await s2.load();
    expect(s2.activeId()).toBe(a);
    expect(s2.keyFor(a)).toBe('ka');
    expect(s2.active()!.baseUrl).toBe('https://a.com/v1');
  });

  it('迁移旧结构:每个有 key 的服务商 → 一份 profile,当前落在旧 provider,并固化持久', async () => {
    await chrome.storage.local.set({
      'settings:ai': {
        provider: 'custom',
        keys: { anthropic: 'sk-ant', custom: 'sk-relay' },
        models: { anthropic: 'claude-x' },
        baseUrls: { custom: 'https://newapi.elevatesphere.com/v1' },
      },
    });
    const s = new AISettingsStore();
    await s.load();
    expect(s.profiles()).toHaveLength(2);
    const active = s.active()!;
    expect(active.provider).toBe('custom'); // 旧 provider=custom
    expect(active.baseUrl).toBe('https://newapi.elevatesphere.com/v1');
    expect(s.keyFor(active.id)).toBe('sk-relay');
    const ant = s.profiles().find((p) => p.provider === 'anthropic')!;
    expect(ant.model).toBe('claude-x');
    expect(s.keyFor(ant.id)).toBe('sk-ant');
    // 固化:再开一个新实例(读的是 load() 里 persist 过的新结构),id 与当前不变
    const s2 = new AISettingsStore();
    await s2.load();
    expect(s2.activeId()).toBe(active.id);
    expect(s2.profiles()).toHaveLength(2);
  });

  it('迁移旧结构但从未配置(无 key) → 视为空', async () => {
    await chrome.storage.local.set({
      'settings:ai': { provider: 'anthropic', keys: {}, models: {}, baseUrls: {} },
    });
    const s = new AISettingsStore();
    await s.load();
    expect(s.profiles()).toEqual([]);
    expect(s.activeId()).toBeNull();
  });
});
