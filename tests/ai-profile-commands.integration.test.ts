import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { AISettingsStore } from '@/core/background/settings';
import { handleCommand, type CommandContext } from '@/core/background/commands';

let ai: AISettingsStore;
let ctx: CommandContext;

beforeEach(async () => {
  new FakeChrome().install();
  ai = new AISettingsStore();
  await ai.load();
  ctx = {
    // 仅 AI 命令用到 ctx.ai;其余依赖此处不触及,给最小可编译桩。
    repo: {} as CommandContext['repo'],
    search: {} as CommandContext['search'],
    undo: {} as CommandContext['undo'],
    onChange: () => {},
    ai: {
      status: () => ai.status(),
      configured: () => ai.configured(),
      complete: () => Promise.reject(new Error('n/a')),
      saveProfile: (input, key) => ai.upsert(input, key),
      deleteProfile: (id) => ai.remove(id),
      activateProfile: (id) => ai.activate(id),
      test: async () => ({ ok: true, detail: 'ok' }),
      cancel: () => {},
    },
  };
});

describe('AI profile 命令', () => {
  it('SAVE 新建 → 出现在 status 且成为当前', async () => {
    await handleCommand(
      { type: 'SAVE_AI_PROFILE', label: 'A', provider: 'anthropic', model: 'm1', key: 'k1' },
      ctx,
    );
    const st = ai.status();
    expect(st.profiles).toHaveLength(1);
    expect(st.activeId).toBe(st.profiles[0]!.id);
    expect(st.ready).toBe(true);
  });

  it('SAVE 编辑(带 id) → 改模型、key 留空不动、不夺当前', async () => {
    const a = await ai.upsert({ label: 'A', provider: 'anthropic', model: 'm1' }, 'k1');
    const b = await ai.upsert({ label: 'B', provider: 'anthropic', model: 'm2' }, 'k2');
    await handleCommand(
      { type: 'SAVE_AI_PROFILE', id: a, label: 'A2', provider: 'anthropic', model: 'm1b' },
      ctx,
    );
    expect(ai.activeId()).toBe(b);
    expect(ai.profiles().find((p) => p.id === a)!.model).toBe('m1b');
    expect(ai.keyFor(a)).toBe('k1');
  });

  it('ACTIVATE 切换当前', async () => {
    const a = await ai.upsert({ label: 'A', provider: 'anthropic', model: 'm1' }, 'k1');
    await ai.upsert({ label: 'B', provider: 'anthropic', model: 'm2' }, 'k2');
    await handleCommand({ type: 'ACTIVATE_AI_PROFILE', id: a }, ctx);
    expect(ai.activeId()).toBe(a);
  });

  it('DELETE 删除', async () => {
    const a = await ai.upsert({ label: 'A', provider: 'anthropic', model: 'm1' }, 'k1');
    await handleCommand({ type: 'DELETE_AI_PROFILE', id: a }, ctx);
    expect(ai.profiles()).toHaveLength(0);
  });
});
