# 多份 AI 配置 + 自由切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「每种服务商各一个槽、只能启用一个」的 AI 配置,改成「存任意多份命名配置、自由挑一份启用」,并修复「配置完看不到用的是哪个模型」的 bug。

**Architecture:** `AISettingsStore` 从「服务商为主键」改为「`profiles[] + activeId`,key 按 profileId 存」;`AIStatus` 广播 profile 列表(不含 key)。SW 的 `complete/test` 走当前 active profile。设置面板把 AI 那块抽成独立组件 `AiProfilesSection`,列表 + 编辑表单,顶部显示当前配置的模型名。旧单份配置在 `hydrate` 里自动迁移成列表。

**Tech Stack:** WXT(MV3)、React 19、TypeScript(strict, noUncheckedIndexedAccess)、Zustand、Vitest + @testing-library/react + jsdom、fake-chrome、nanoid。

## Global Constraints

- 回答用中文;commit 分层;消息尾部两行:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 与 `Claude-Session: https://claude.ai/code/session_01LGDcjBZFfv4KPH3kZ21YCZ`。**推送/bump 仅在用户明确指示时**。
- F-13 隐私:API key 只在 SW 读、**永不进 `AIStatus`/快照**;`baseUrl` 非机密可广播;AI 只发标题 + eTLD+1 域名 + 任务名。
- 架构不变量:SW 是 DB 唯一写方;UI 发 Command、订阅 `STATE_SNAPSHOT`;`chrome.storage.local` 里 UI 偏好 UI 直读,AI 配置经命令写。
- i18n:`en` 是 `as const` 类型源,`Messages = Record<MessageKey,string>` 强制四语(en/zh-CN/ja/ko)键完全一致,缺键编译失败。
- 校验命令:`npx tsc --noEmit`(exit 0)、`npx oxlint`(exit 0)、`npx prettier --check <改动文件>`、`npx vitest run`、`npx wxt build`。
- vitest 逐文件用 esbuild 转译、不做全项目类型检查 —— 故 store/命令/组件的单测在跨文件类型尚未补齐时也能跑绿;**全项目 `tsc` 绿的门在 Task 5**。

---

### Task 1: 存储数据模型 + 迁移(`AISettingsStore`)

**Files:**
- Modify: `shared/ai.ts`(重塑 `AIStatus`,新增 `AIProfileStatus`)
- Modify: `core/background/settings.ts`(`AISettingsStore` 全量重写;新增 `AIProfile` 导出、迁移助手)
- Test: `tests/ai-settings.test.ts`(全量重写)

**Interfaces:**
- Produces:
  - `interface AIProfile { id: string; label: string; provider: AIProviderId; model: string; baseUrl?: string }`(从 settings.ts 导出)
  - `AISettingsStore`:`profiles(): AIProfile[]`、`activeId(): string | null`、`active(): AIProfile | null`、`keyFor(id: string): string | undefined`、`effectiveModel(p: AIProfile): string`、`configured(): boolean`、`status(): AIStatus`、`upsert(input: { id?: string; label: string; provider: AIProviderId; model: string; baseUrl?: string }, key?: string): Promise<string>`、`activate(id: string): Promise<void>`、`remove(id: string): Promise<void>`、`load(): Promise<void>`
  - `shared/ai.ts`:`AIProfileStatus`、新 `AIStatus`(见下)

- [ ] **Step 1: 重塑 `shared/ai.ts` 的 `AIStatus`**

把原 `AIStatus` 替换为:

```ts
/** 单份配置的脱敏状态(随快照广播,永不含 key)。model 为「生效模型」(覆写或默认)。 */
export interface AIProfileStatus {
  id: string;
  label: string;
  provider: AIProviderId;
  model: string;
  baseUrl?: string;
  hasKey: boolean;
}

/** AI 配置总状态:多份 profile + 当前指针 + 当前份是否可用。永不含 key。 */
export interface AIStatus {
  profiles: AIProfileStatus[];
  activeId: string | null;
  ready: boolean;
}
```

- [ ] **Step 2: 重写 `tests/ai-settings.test.ts`(先写测试)**

```ts
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
    expect(s.status().profiles[0]).toMatchObject({ id, label: '主力', model: 'claude-x', hasKey: true });
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
    const a = await s.upsert({ label: 'A', provider: 'custom', model: 'gpt-4o', baseUrl: 'https://a.com/v1' }, 'ka');
    const b = await s.upsert({ label: 'B', provider: 'custom', model: 'claude-3-5-sonnet', baseUrl: 'https://b.com/v1' }, 'kb');
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
    const id = await s.upsert({ label: 'x', provider: 'anthropic', model: '' }, 'k');
    expect(s.effectiveModel(s.active()!)).toBe('claude-haiku-4-5');
  });

  it('custom:缺 baseUrl → 未就绪;补上 → 就绪', async () => {
    const s = await fresh();
    const id = await s.upsert({ label: 'r', provider: 'custom', model: 'gpt-4o' }, 'k');
    expect(s.configured()).toBe(false);
    await s.upsert({ id, label: 'r', provider: 'custom', model: 'gpt-4o', baseUrl: 'https://r.com/v1' });
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
    const a = await s1.upsert({ label: 'A', provider: 'custom', model: 'gpt-4o', baseUrl: 'https://a.com/v1' }, 'ka');
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
    await chrome.storage.local.set({ 'settings:ai': { provider: 'anthropic', keys: {}, models: {}, baseUrls: {} } });
    const s = new AISettingsStore();
    await s.load();
    expect(s.profiles()).toEqual([]);
    expect(s.activeId()).toBeNull();
  });
});
```

- [ ] **Step 3: 运行测试,确认失败**

Run: `npx vitest run tests/ai-settings.test.ts`
Expected: FAIL(旧 `AISettingsStore` 无 `upsert/active/...`;`status()` 旧形状)

- [ ] **Step 4: 重写 `core/background/settings.ts` 的 AI 段**

顶部加导入:`import { nanoid } from 'nanoid';`(文件已 `import { PROVIDERS } from '../ai/provider';`)。
把 `const AI_KEY = ...` 起、到文件末 `AISettingsStore` 结束的整段,替换为:

```ts
const AI_KEY = 'settings:ai';

/** 一份 AI 配置:服务商 + 模型 + (中转)地址 + 备注名。key 不在此,另按 id 存。 */
export interface AIProfile {
  id: string;
  label: string;
  provider: AIProviderId;
  model: string;
  baseUrl?: string;
}

interface AIData {
  profiles: AIProfile[];
  activeId: string | null;
  keys: Record<string, string>; // profileId → key;SW-only,永不广播
}

const PROVIDER_BRAND: Record<AIProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  custom: 'Custom',
};

/** 备注名兜底:优先模型名,再退服务商品牌名。 */
function fallbackLabel(model: string, provider: AIProviderId): string {
  return model.trim() || PROVIDER_BRAND[provider];
}

/** 旧结构(provider 为主键)→ 新结构;非旧结构或从未配置返回 null。 */
function migrateLegacy(saved: Record<string, unknown>): AIData | null {
  const keys = saved.keys as Partial<Record<AIProviderId, string>> | undefined;
  if (!keys || typeof keys !== 'object') return null;
  const models = (saved.models as Partial<Record<AIProviderId, string>>) ?? {};
  const baseUrls = (saved.baseUrls as Partial<Record<AIProviderId, string>>) ?? {};
  const oldProvider = (saved.provider as AIProviderId) ?? 'anthropic';
  const profiles: AIProfile[] = [];
  const newKeys: Record<string, string> = {};
  let activeId: string | null = null;
  for (const p of ['anthropic', 'openai', 'custom'] as AIProviderId[]) {
    const k = keys[p];
    if (!k || !k.trim()) continue;
    const id = nanoid();
    const model = (models[p] ?? '').trim();
    const baseUrl = p === 'custom' ? (baseUrls[p] ?? '').trim() || undefined : undefined;
    profiles.push({ id, label: fallbackLabel(model, p), provider: p, model, baseUrl });
    newKeys[id] = k.trim();
    if (p === oldProvider) activeId = id;
  }
  if (profiles.length === 0) return null;
  return { profiles, activeId: activeId ?? profiles[0]!.id, keys: newKeys };
}

/** AI 配置:多份 profile + 当前指针。key 只在 SW 读、永不广播。 */
export class AISettingsStore extends PersistedStore<AIData> {
  private needsPersist = false;

  constructor() {
    super(AI_KEY, () => ({ profiles: [], activeId: null, keys: {} }));
  }

  protected hydrate(raw: unknown): AIData {
    const saved = (raw as Record<string, unknown>) ?? {};
    if (Array.isArray(saved.profiles)) {
      const profiles = (saved.profiles as AIProfile[]).filter(
        (p) => p && typeof p.id === 'string' && typeof p.provider === 'string',
      );
      const keys = (saved.keys as Record<string, string>) ?? {};
      const ids = new Set(profiles.map((p) => p.id));
      const activeId =
        typeof saved.activeId === 'string' && ids.has(saved.activeId)
          ? saved.activeId
          : (profiles[0]?.id ?? null);
      return { profiles, activeId, keys };
    }
    const migrated = migrateLegacy(saved);
    if (migrated) {
      this.needsPersist = true;
      return migrated;
    }
    return { profiles: [], activeId: null, keys: {} };
  }

  /** 迁移旧结构时,load 后固化一次新结构(稳定 id)。 */
  async load(): Promise<void> {
    await super.load();
    if (this.needsPersist) {
      this.needsPersist = false;
      await this.persist();
    }
  }

  profiles(): AIProfile[] {
    return this.data.profiles;
  }

  activeId(): string | null {
    return this.data.activeId;
  }

  active(): AIProfile | null {
    return this.data.profiles.find((p) => p.id === this.data.activeId) ?? null;
  }

  keyFor(id: string): string | undefined {
    return this.data.keys[id];
  }

  effectiveModel(p: AIProfile): string {
    return p.model.trim() || PROVIDERS[p.provider].defaultModel;
  }

  configured(): boolean {
    const p = this.active();
    if (!p || !this.data.keys[p.id]) return false;
    if (p.provider === 'custom') return !!p.baseUrl?.trim();
    return true;
  }

  status(): AIStatus {
    return {
      profiles: this.data.profiles.map((p) => ({
        id: p.id,
        label: p.label,
        provider: p.provider,
        model: this.effectiveModel(p),
        baseUrl: p.baseUrl,
        hasKey: !!this.data.keys[p.id],
      })),
      activeId: this.data.activeId,
      ready: this.configured(),
    };
  }

  /** 新建(无 id,建后设为当前)或编辑(有 id,不动当前)。key===undefined 表示不改已存 key。返回 id。 */
  async upsert(
    input: { id?: string; label: string; provider: AIProviderId; model: string; baseUrl?: string },
    key?: string,
  ): Promise<string> {
    const id = input.id ?? nanoid();
    const model = input.model.trim();
    const baseUrl =
      input.provider === 'custom' ? (input.baseUrl ?? '').trim() || undefined : undefined;
    const profile: AIProfile = {
      id,
      label: input.label.trim() || fallbackLabel(model, input.provider),
      provider: input.provider,
      model,
      baseUrl,
    };
    const profiles = input.id
      ? this.data.profiles.map((p) => (p.id === id ? profile : p))
      : [...this.data.profiles, profile];
    const keys = { ...this.data.keys };
    if (key !== undefined) {
      const k = key.trim();
      if (k) keys[id] = k;
    }
    const activeId = input.id ? this.data.activeId : id; // 新建即当前;编辑不动
    this.data = { profiles, activeId, keys };
    await this.persist();
    return id;
  }

  async activate(id: string): Promise<void> {
    if (!this.data.profiles.some((p) => p.id === id)) return;
    this.data = { ...this.data, activeId: id };
    await this.persist();
  }

  async remove(id: string): Promise<void> {
    const profiles = this.data.profiles.filter((p) => p.id !== id);
    const keys = { ...this.data.keys };
    delete keys[id];
    const activeId = this.data.activeId === id ? (profiles[0]?.id ?? null) : this.data.activeId;
    this.data = { profiles, activeId, keys };
    await this.persist();
  }
}
```

- [ ] **Step 5: 运行测试,确认通过**

Run: `npx vitest run tests/ai-settings.test.ts`
Expected: PASS(全部)

- [ ] **Step 6: 提交**

```bash
git add shared/ai.ts core/background/settings.ts tests/ai-settings.test.ts
git commit -m "$(printf 'feat(ai): AISettingsStore 支持多份配置 + 旧结构迁移\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LGDcjBZFfv4KPH3kZ21YCZ')"
```

---

### Task 2: SW 命令与调用链(commands + index)

**Files:**
- Modify: `shared/messaging.ts`(命令联合类型 + `COMMAND_TYPES`)
- Modify: `core/background/commands.ts`(`CommandContext.ai` 类型 + `SET_AI_SETTINGS` 段替换为三条)
- Modify: `core/background/index.ts`(`ai` 对象:`complete`/`test` 走 active、`saveProfile`/`deleteProfile`/`activateProfile`)
- Test: `tests/ai-profile-commands.integration.test.ts`(新建)

**Interfaces:**
- Consumes: Task 1 的 `AISettingsStore`、`AIProfile`、`AIStatus`
- Produces:
  - Commands:`{ type: 'SAVE_AI_PROFILE'; id?: string; label: string; provider: AIProviderId; model: string; baseUrl?: string; key?: string }`、`{ type: 'DELETE_AI_PROFILE'; id: string }`、`{ type: 'ACTIVATE_AI_PROFILE'; id: string }`
  - `CommandContext.ai`:去掉 `set`,新增 `saveProfile(input, key?): Promise<string>`、`deleteProfile(id): Promise<void>`、`activateProfile(id): Promise<void>`

- [ ] **Step 1: 写命令往返测试(先写测试)**

`tests/ai-profile-commands.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { AISettingsStore, type AIProfile } from '@/core/background/settings';
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
    const b = await ai.upsert({ label: 'B', provider: 'anthropic', model: 'm2' }, 'k2');
    await handleCommand({ type: 'ACTIVATE_AI_PROFILE', id: a }, ctx);
    expect(ai.activeId()).toBe(a);
  });

  it('DELETE 删除', async () => {
    const a = await ai.upsert({ label: 'A', provider: 'anthropic', model: 'm1' }, 'k1');
    await handleCommand({ type: 'DELETE_AI_PROFILE', id: a }, ctx);
    expect(ai.profiles()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/ai-profile-commands.integration.test.ts`
Expected: FAIL(命令类型未定义 / `ctx.ai.saveProfile` 类型不存在)

- [ ] **Step 3: `shared/messaging.ts` —— 换命令**

删除 `SET_AI_SETTINGS` 那个对象字面量(`shared/messaging.ts:40-46`),替换为:

```ts
  | {
      type: 'SAVE_AI_PROFILE';
      id?: string;
      label: string;
      provider: AIProviderId;
      model: string;
      baseUrl?: string;
      key?: string;
    }
  | { type: 'DELETE_AI_PROFILE'; id: string }
  | { type: 'ACTIVATE_AI_PROFILE'; id: string }
```

`COMMAND_TYPES` 里把 `'SET_AI_SETTINGS'` 一行换成三行:

```ts
  'SAVE_AI_PROFILE',
  'DELETE_AI_PROFILE',
  'ACTIVATE_AI_PROFILE',
```

- [ ] **Step 4: `core/background/commands.ts` —— 改 ctx.ai 类型 + 命令段**

把 `CommandContext.ai` 里的这一行(commands.ts:58):

```ts
    set: (provider: AIProviderId, key?: string, model?: string, baseUrl?: string) => Promise<void>;
```

替换为:

```ts
    saveProfile: (
      input: { id?: string; label: string; provider: AIProviderId; model: string; baseUrl?: string },
      key?: string,
    ) => Promise<string>;
    deleteProfile: (id: string) => Promise<void>;
    activateProfile: (id: string) => Promise<void>;
```

把 `case 'SET_AI_SETTINGS':`(commands.ts:510-513)整段替换为:

```ts
    case 'SAVE_AI_PROFILE':
      await ctx.ai?.saveProfile(
        {
          id: cmd.id,
          label: cmd.label,
          provider: cmd.provider,
          model: cmd.model,
          baseUrl: cmd.baseUrl,
        },
        cmd.key,
      );
      onChange();
      return;

    case 'DELETE_AI_PROFILE':
      await ctx.ai?.deleteProfile(cmd.id);
      onChange();
      return;

    case 'ACTIVATE_AI_PROFILE':
      await ctx.ai?.activateProfile(cmd.id);
      onChange();
      return;
```

- [ ] **Step 5: `core/background/index.ts` —— ai 对象走 active profile**

把 `ai: { ... }`(index.ts:138-192)整块替换为:

```ts
  ai: {
    status: () => aiSettings.status(),
    configured: () => aiSettings.configured(),
    complete: (system, user) => {
      const prof = aiSettings.active();
      const key = prof ? aiSettings.keyFor(prof.id) : undefined;
      if (!prof || !key) return Promise.reject(new Error('no key'));
      return aiRunner.run(
        (signal) =>
          PROVIDERS[prof.provider].complete(
            {
              system,
              user,
              model: aiSettings.effectiveModel(prof),
              maxTokens: 1024,
              temperature: 0, // 整理/命名求稳定可复现
              baseUrl: prof.baseUrl,
              signal,
            },
            key,
          ),
        30_000,
      );
    },
    saveProfile: (input, key) => aiSettings.upsert(input, key),
    deleteProfile: (id) => aiSettings.remove(id),
    activateProfile: (id) => aiSettings.activate(id),
    test: async () => {
      const prof = aiSettings.active();
      const key = prof ? aiSettings.keyFor(prof.id) : undefined;
      if (!prof || !key) return { ok: false, detail: '未配置 key' };
      const model = aiSettings.effectiveModel(prof);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      const t0 = Date.now();
      try {
        await PROVIDERS[prof.provider].complete(
          {
            system: '你是连接测试。',
            user: '仅回复 OK。',
            model,
            maxTokens: 8,
            baseUrl: prof.baseUrl,
            signal: ctrl.signal,
          },
          key,
        );
        return { ok: true, detail: `连接成功 · ${model} · ${Date.now() - t0}ms` };
      } catch (e) {
        return { ok: false, detail: friendlyAIError(e instanceof Error ? e.message : String(e)) };
      } finally {
        clearTimeout(timer);
      }
    },
    cancel: () => aiRunner.cancel(),
  },
```

- [ ] **Step 6: 运行测试,确认通过**

Run: `npx vitest run tests/ai-profile-commands.integration.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add shared/messaging.ts core/background/commands.ts core/background/index.ts tests/ai-profile-commands.integration.test.ts
git commit -m "$(printf 'feat(ai): 多份配置的 SW 命令(SAVE/DELETE/ACTIVATE)与调用链走当前份\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LGDcjBZFfv4KPH3kZ21YCZ')"
```

---

### Task 3: i18n 四语键

**Files:**
- Modify: `entrypoints/sidepanel/i18n/en.ts`(类型源)、`zh-CN.ts`、`ja.ts`、`ko.ts`
- Test: 无(靠 Task 5 `tsc` 校验四语齐 + 组件测试用到)

**Interfaces:**
- Produces:新增键 `settings.ai.current`、`settings.ai.profiles.empty`、`settings.ai.profiles.add`、`settings.ai.label.placeholder`、`settings.ai.actions.edit`、`settings.ai.actions.delete`、`settings.ai.actions.setActive`、`settings.ai.activeBadge`、`settings.ai.deleteConfirm`、`settings.ai.newTitle`、`settings.ai.editTitle`、`settings.ai.backToList`

- [ ] **Step 1: en.ts(类型源)加键**

在 `settings.ai.*` 段落内加(紧邻现有 `'settings.ai.configured'` 附近):

```ts
  'settings.ai.current': 'Active: {label} · {model}',
  'settings.ai.profiles.empty': 'No AI configs yet. Add one to enable AI organizing.',
  'settings.ai.profiles.add': '+ Add config',
  'settings.ai.label.placeholder': 'Label (optional, e.g. Work Claude)',
  'settings.ai.actions.edit': 'Edit',
  'settings.ai.actions.delete': 'Delete',
  'settings.ai.actions.setActive': 'Use this',
  'settings.ai.activeBadge': 'Active',
  'settings.ai.deleteConfirm': 'Delete config "{label}"?',
  'settings.ai.newTitle': 'New config',
  'settings.ai.editTitle': 'Edit config',
  'settings.ai.backToList': '← Back',
```

- [ ] **Step 2: zh-CN.ts 加同名键**

```ts
  'settings.ai.current': '当前:{label} · {model}',
  'settings.ai.profiles.empty': '还没有 AI 配置。新增一份即可启用 AI 整理。',
  'settings.ai.profiles.add': '+ 新增配置',
  'settings.ai.label.placeholder': '备注名(可选,如 工作用 Claude)',
  'settings.ai.actions.edit': '编辑',
  'settings.ai.actions.delete': '删除',
  'settings.ai.actions.setActive': '设为当前',
  'settings.ai.activeBadge': '当前',
  'settings.ai.deleteConfirm': '删除配置「{label}」?',
  'settings.ai.newTitle': '新增配置',
  'settings.ai.editTitle': '编辑配置',
  'settings.ai.backToList': '← 返回',
```

- [ ] **Step 3: ja.ts 加同名键**

```ts
  'settings.ai.current': '使用中:{label} · {model}',
  'settings.ai.profiles.empty': 'AI 設定がまだありません。追加すると AI 整理が使えます。',
  'settings.ai.profiles.add': '+ 設定を追加',
  'settings.ai.label.placeholder': 'ラベル(任意、例:仕事用 Claude)',
  'settings.ai.actions.edit': '編集',
  'settings.ai.actions.delete': '削除',
  'settings.ai.actions.setActive': 'これを使う',
  'settings.ai.activeBadge': '使用中',
  'settings.ai.deleteConfirm': '設定「{label}」を削除しますか?',
  'settings.ai.newTitle': '新しい設定',
  'settings.ai.editTitle': '設定を編集',
  'settings.ai.backToList': '← 戻る',
```

- [ ] **Step 4: ko.ts 加同名键**

```ts
  'settings.ai.current': '사용 중: {label} · {model}',
  'settings.ai.profiles.empty': '아직 AI 설정이 없습니다. 하나 추가하면 AI 정리를 켤 수 있어요.',
  'settings.ai.profiles.add': '+ 설정 추가',
  'settings.ai.label.placeholder': '이름표 (선택, 예: 업무용 Claude)',
  'settings.ai.actions.edit': '편집',
  'settings.ai.actions.delete': '삭제',
  'settings.ai.actions.setActive': '이걸로 사용',
  'settings.ai.activeBadge': '사용 중',
  'settings.ai.deleteConfirm': '설정 "{label}"을(를) 삭제할까요?',
  'settings.ai.newTitle': '새 설정',
  'settings.ai.editTitle': '설정 편집',
  'settings.ai.backToList': '← 뒤로',
```

- [ ] **Step 5: 提交**

```bash
git add entrypoints/sidepanel/i18n/en.ts entrypoints/sidepanel/i18n/zh-CN.ts entrypoints/sidepanel/i18n/ja.ts entrypoints/sidepanel/i18n/ko.ts
git commit -m "$(printf 'i18n(ai): 多份配置列表 + 当前模型显示 文案(四语)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LGDcjBZFfv4KPH3kZ21YCZ')"
```

---

### Task 4: UI 组件 `AiProfilesSection` + hook

**Files:**
- Create: `entrypoints/sidepanel/components/AiProfilesSection.tsx`
- Modify: `entrypoints/sidepanel/hooks/useAiActions.ts`(`saveAi` → `saveProfile`;加 `deleteProfile`/`activateProfile`)
- Test: `tests/ai-profiles-section.test.tsx`(新建)

**Interfaces:**
- Consumes: `AIStatus`/`AIProfileStatus`(Task 1)、`SAVE_/DELETE_/ACTIVATE_AI_PROFILE`(Task 2)、i18n 键(Task 3)、`permissionOriginFor`(现有)
- Produces:
  - `useAiActions`:`saveProfile(input: { id?: string; label: string; provider: AIProviderId; model: string; baseUrl?: string; key?: string }): Promise<void>`、`deleteProfile(id: string): Promise<void>`、`activateProfile(id: string): Promise<void>`(替换原 `saveAi`)
  - `AiProfilesSection`(default 具名导出):props `{ ai: AIStatus; onSave; onDelete; onActivate; onTest }`

- [ ] **Step 1: 改 `useAiActions.ts`**

把 `saveAi`(useAiActions.ts:164-175)整段替换为:

```ts
  const saveProfile = async (input: {
    id?: string;
    label: string;
    provider: AIProviderId;
    model: string;
    baseUrl?: string;
    key?: string;
  }) => {
    // custom 的授权域名由所填 baseUrl 的 origin 派生;官方两档用固定 host(见 permissionOriginFor)
    const origin = permissionOriginFor(input.provider, input.baseUrl);
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error(t('settings.ai.permissionRequired'));
    await dispatch({ type: 'SAVE_AI_PROFILE', ...input });
  };
  const deleteProfile = async (id: string) => {
    await dispatch({ type: 'DELETE_AI_PROFILE', id });
  };
  const activateProfile = async (id: string) => {
    await dispatch({ type: 'ACTIVATE_AI_PROFILE', id });
  };
```

在返回类型签名里把 `saveAi: (...) => Promise<void>;` 换成三个新签名;返回对象里 `saveAi` → `saveProfile, deleteProfile, activateProfile`(返回对象末尾 `saveAi,` 一行替换)。

- [ ] **Step 2: 写组件测试(先写测试)**

`tests/ai-profiles-section.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AiProfilesSection } from '@/entrypoints/sidepanel/components/AiProfilesSection';
import type { AIStatus } from '@/shared/ai';

const noop = () => Promise.resolve();
const test = () => Promise.resolve({ ok: true, detail: 'ok' });

function statusWith(profiles: AIStatus['profiles'], activeId: string | null): AIStatus {
  return { profiles, activeId, ready: !!activeId };
}

beforeEach(() => {
  // permissions.request 桩(hook 用不到这里,组件 onSave 由 prop 注入)
});

describe('AiProfilesSection', () => {
  it('空列表显示引导语', () => {
    render(<AiProfilesSection ai={statusWith([], null)} onSave={noop} onDelete={noop} onActivate={noop} onTest={test} />);
    expect(screen.getByText(/还没有 AI 配置/)).toBeTruthy();
  });

  it('列表显示当前配置的模型名(治「不显示模型」)', () => {
    const ai = statusWith(
      [{ id: 'p1', label: '主力', provider: 'custom', model: 'gpt-4o', baseUrl: 'https://a.com/v1', hasKey: true }],
      'p1',
    );
    render(<AiProfilesSection ai={ai} onSave={noop} onDelete={noop} onActivate={noop} onTest={test} />);
    expect(screen.getByText(/当前:主力 · gpt-4o/)).toBeTruthy();
    expect(screen.getByText('gpt-4o')).toBeTruthy();
  });

  it('点非当前行「设为当前」→ onActivate(id)', () => {
    const onActivate = vi.fn(() => Promise.resolve());
    const ai = statusWith(
      [
        { id: 'p1', label: 'A', provider: 'anthropic', model: 'm1', hasKey: true },
        { id: 'p2', label: 'B', provider: 'anthropic', model: 'm2', hasKey: true },
      ],
      'p1',
    );
    render(<AiProfilesSection ai={ai} onSave={noop} onDelete={noop} onActivate={onActivate} onTest={test} />);
    fireEvent.click(screen.getByTitle('设为当前'));
    expect(onActivate).toHaveBeenCalledWith('p2');
  });

  it('编辑现有配置 → 表单回填模型(bug 回归)', () => {
    const ai = statusWith(
      [{ id: 'p1', label: 'A', provider: 'custom', model: 'gpt-4o', baseUrl: 'https://a.com/v1', hasKey: true }],
      'p1',
    );
    render(<AiProfilesSection ai={ai} onSave={noop} onDelete={noop} onActivate={noop} onTest={test} />);
    fireEvent.click(screen.getByText('编辑'));
    const modelInput = screen.getByDisplayValue('gpt-4o');
    expect(modelInput).toBeTruthy();
    expect(screen.getByDisplayValue('https://a.com/v1')).toBeTruthy();
  });

  it('新增 → 填 key + 模型 → 保存调 onSave(无 id)', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    render(<AiProfilesSection ai={statusWith([], null)} onSave={onSave} onDelete={noop} onActivate={noop} onTest={test} />);
    fireEvent.click(screen.getByText('+ 新增配置'));
    fireEvent.change(screen.getByLabelText(/API key/i), { target: { value: 'sk-x' } });
    fireEvent.change(screen.getByPlaceholderText(/模型/), { target: { value: 'claude-x' } });
    fireEvent.click(screen.getByText('保存并启用'));
    await Promise.resolve();
    expect(onSave).toHaveBeenCalled();
    const arg = onSave.mock.calls[0]![0];
    expect(arg).toMatchObject({ provider: 'anthropic', model: 'claude-x', key: 'sk-x' });
    expect(arg.id).toBeUndefined();
  });

  it('删除 → confirm 通过后 onDelete(id)', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn(() => Promise.resolve());
    const ai = statusWith([{ id: 'p1', label: 'A', provider: 'anthropic', model: 'm1', hasKey: true }], 'p1');
    render(<AiProfilesSection ai={ai} onSave={noop} onDelete={onDelete} onActivate={noop} onTest={test} />);
    fireEvent.click(screen.getByText('删除'));
    expect(onDelete).toHaveBeenCalledWith('p1');
  });
});
```

- [ ] **Step 3: 运行,确认失败**

Run: `npx vitest run tests/ai-profiles-section.test.tsx`
Expected: FAIL(组件不存在)

- [ ] **Step 4: 写 `AiProfilesSection.tsx`**

```tsx
import { useState } from 'react';
import type { AIProviderId, AIStatus } from '@/shared/ai';
import { useT } from '../i18n';

const PROVIDER_LABELS: Record<AIProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  custom: 'custom',
};

type SaveInput = {
  id?: string;
  label: string;
  provider: AIProviderId;
  model: string;
  baseUrl?: string;
  key?: string;
};

interface Props {
  ai: AIStatus;
  onSave: (input: SaveInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onActivate: (id: string) => Promise<void>;
  onTest: () => Promise<{ ok: boolean; detail: string }>;
}

// null = 看列表;{} = 新增;{id,...} = 编辑
type Editing = { id?: string; provider: AIProviderId; label: string; model: string; baseUrl: string } | null;

export function AiProfilesSection({ ai, onSave, onDelete, onActivate, onTest }: Props) {
  const { t } = useT();
  const [editing, setEditing] = useState<Editing>(null);

  const providerLabel = (p: AIProviderId) =>
    p === 'custom' ? t('settings.ai.provider.custom') : PROVIDER_LABELS[p];

  const activeProfile = ai.profiles.find((p) => p.id === ai.activeId) ?? null;

  if (editing) {
    return (
      <ProfileEditor
        editing={editing}
        setEditing={setEditing}
        isNew={editing.id === undefined}
        onSave={onSave}
        onTest={onTest}
      />
    );
  }

  return (
    <div className="px-3 py-2.5">
      <div className="text-[11px] opacity-50 leading-snug mb-2">{t('settings.ai.desc')}</div>

      {activeProfile && (
        <div className="text-[11px] text-accent mb-2">
          {t('settings.ai.current', { label: activeProfile.label, model: activeProfile.model })}
        </div>
      )}

      {ai.profiles.length === 0 ? (
        <div className="text-[11px] opacity-45 leading-snug mb-2">{t('settings.ai.profiles.empty')}</div>
      ) : (
        <div className="space-y-1 mb-2">
          {ai.profiles.map((p) => {
            const isActive = p.id === ai.activeId;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-black/10 dark:border-white/10"
              >
                <button
                  onClick={() => !isActive && onActivate(p.id)}
                  title={isActive ? t('settings.ai.activeBadge') : t('settings.ai.actions.setActive')}
                  aria-label={isActive ? t('settings.ai.activeBadge') : t('settings.ai.actions.setActive')}
                  className={`shrink-0 w-2.5 h-2.5 rounded-full border ${
                    isActive ? 'bg-accent border-accent' : 'border-black/30 dark:border-white/30 hover:border-accent'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-medium truncate">{p.label}</span>
                    {isActive && (
                      <span className="shrink-0 text-[9.5px] px-1 py-px rounded-full bg-accent/15 text-accent">
                        {t('settings.ai.activeBadge')}
                      </span>
                    )}
                  </div>
                  <div className="text-[10.5px] opacity-50 truncate font-mono">
                    {providerLabel(p.provider)} · {p.model}
                    {!p.hasKey && ' · (no key)'}
                  </div>
                </div>
                <button
                  onClick={() =>
                    setEditing({
                      id: p.id,
                      provider: p.provider,
                      label: p.label,
                      model: p.model,
                      baseUrl: p.baseUrl ?? '',
                    })
                  }
                  className="shrink-0 text-[11px] opacity-60 hover:opacity-100"
                >
                  {t('settings.ai.actions.edit')}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(t('settings.ai.deleteConfirm', { label: p.label }))) onDelete(p.id);
                  }}
                  className="shrink-0 text-[11px] opacity-60 hover:opacity-100 hover:text-red-500"
                >
                  {t('settings.ai.actions.delete')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setEditing({ provider: 'anthropic', label: '', model: '', baseUrl: '' })}
        className="text-[12px] text-accent hover:opacity-80"
      >
        {t('settings.ai.profiles.add')}
      </button>
    </div>
  );
}

function ProfileEditor({
  editing,
  setEditing,
  isNew,
  onSave,
  onTest,
}: {
  editing: NonNullable<Editing>;
  setEditing: (e: Editing) => void;
  isNew: boolean;
  onSave: (input: SaveInput) => Promise<void>;
  onTest: () => Promise<{ ok: boolean; detail: string }>;
}) {
  const { t } = useT();
  const [provider, setProvider] = useState<AIProviderId>(editing.provider);
  const [label, setLabel] = useState(editing.label);
  const [key, setKey] = useState('');
  const [model, setModel] = useState(editing.model);
  const [baseUrl, setBaseUrl] = useState(editing.baseUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const isCustom = provider === 'custom';
  const needsUrl = isCustom && !baseUrl.trim();
  // 首次(新建)必须有 key;编辑时留空表示不改
  const canSave = !needsUrl && (!!key.trim() || !isNew);

  const providerLabel = (p: AIProviderId) =>
    p === 'custom' ? t('settings.ai.provider.custom') : PROVIDER_LABELS[p];

  const input = (): SaveInput => ({
    id: editing.id,
    label,
    provider,
    model,
    baseUrl: isCustom ? baseUrl : undefined,
    key: key.trim() ? key : undefined,
  });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await onSave(input());
      setEditing(null);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : t('settings.ai.saveFailed'), ok: false });
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (canSave) await onSave(input()); // 先存(含权限申请)再测当前份
      const r = await onTest();
      setMsg({ text: r.detail, ok: r.ok });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : t('settings.ai.testFailed'), ok: false });
    }
    setBusy(false);
  };

  const field =
    'w-full mb-1.5 px-2 py-1 text-[12px] rounded border border-black/15 dark:border-white/15 bg-transparent outline-none focus:border-accent';

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium">
          {isNew ? t('settings.ai.newTitle') : t('settings.ai.editTitle')}
        </span>
        <button onClick={() => setEditing(null)} className="text-[11px] opacity-60 hover:opacity-100">
          {t('settings.ai.backToList')}
        </button>
      </div>

      <div className="flex gap-1 mb-1.5">
        {(['anthropic', 'openai', 'custom'] as AIProviderId[]).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={`px-2 py-0.5 rounded text-[12px] ${
              provider === p ? 'bg-accent/15 text-accent' : 'opacity-60 hover:opacity-100'
            }`}
          >
            {providerLabel(p)}
          </button>
        ))}
      </div>

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t('settings.ai.label.placeholder')}
        aria-label={t('settings.ai.label.placeholder')}
        className={field}
      />

      {isCustom && (
        <>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={t('settings.ai.baseUrl.placeholder')}
            aria-label={t('settings.ai.baseUrl.placeholder')}
            className={`${field} font-mono`}
          />
          <div className="text-[11px] opacity-45 leading-snug mb-1.5">{t('settings.ai.baseUrl.warning')}</div>
        </>
      )}

      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={isNew ? t('settings.ai.key.placeholder.new', { provider: providerLabel(provider) }) : t('settings.ai.key.placeholder.saved')}
        aria-label="API key"
        className={field}
      />

      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder={isCustom ? t('settings.ai.model.placeholder.custom') : t('settings.ai.model.placeholder.default')}
        aria-label={isCustom ? t('settings.ai.model.placeholder.custom') : t('settings.ai.model.placeholder.default')}
        className={`${field} font-mono`}
      />

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy || !canSave}
          className="px-2.5 py-1 rounded-md text-[12px] bg-accent text-white hover:opacity-90 disabled:opacity-40"
        >
          {t('settings.ai.save')}
        </button>
        <button
          onClick={test}
          disabled={busy || !canSave}
          className="px-2.5 py-1 rounded-md text-[12px] border border-black/15 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
        >
          {t('settings.ai.test')}
        </button>
        {msg && (
          <span className={`text-[11px] ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 运行测试,确认通过**

Run: `npx vitest run tests/ai-profiles-section.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add entrypoints/sidepanel/components/AiProfilesSection.tsx entrypoints/sidepanel/hooks/useAiActions.ts tests/ai-profiles-section.test.tsx
git commit -m "$(printf 'feat(ai): AiProfilesSection 配置列表 + 编辑表单;hook 换 saveProfile/delete/activate\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LGDcjBZFfv4KPH3kZ21YCZ')"
```

---

### Task 5: 接线 + 全量验证

**Files:**
- Modify: `entrypoints/sidepanel/components/SettingsPanel.tsx`(删 `AISection`,改用 `AiProfilesSection`;props 更名)
- Modify: `entrypoints/sidepanel/App.tsx`(`ai.hasKey`→`ai.ready`;传 `onSaveProfile/onDeleteProfile/onActivateProfile`)
- Modify: `entrypoints/sidepanel/store.ts:50`(默认 `AIStatus`)
- Modify: `tests/settings-panel.test.tsx`(若引用旧 AI props / AISection,改新形)
- Test: 全量 `vitest` + `tsc` + `oxlint` + `prettier` + `build`

**Interfaces:**
- Consumes: 前四个 Task 的全部产物

- [ ] **Step 1: `store.ts` 默认 AIStatus**

把 `entrypoints/sidepanel/store.ts:50` 一行改为:

```ts
    ai: { profiles: [], activeId: null, ready: false },
```

- [ ] **Step 2: `SettingsPanel.tsx` —— 换组件**

顶部加导入:`import { AiProfilesSection } from './AiProfilesSection';`

把 `<AISection ai={ai} onSave={onSaveAi} onTest={onTestAi} />`(SettingsPanel.tsx:407)替换为:

```tsx
          <AiProfilesSection
            ai={ai}
            onSave={onSaveProfile}
            onDelete={onDeleteProfile}
            onActivate={onActivateProfile}
            onTest={onTestAi}
          />
```

删除整段旧 `AISection` 函数(SettingsPanel.tsx:458-662)与不再使用的 `PROVIDER_LABELS`(452-456,若组件内已自带则删外层);保留 `onTestAi`。改 `SettingsPanel` 的 props 类型:把 `onSaveAi: (...) => Promise<void>` 换成:

```ts
  onSaveProfile: (input: {
    id?: string;
    label: string;
    provider: AIProviderId;
    model: string;
    baseUrl?: string;
    key?: string;
  }) => Promise<void>;
  onDeleteProfile: (id: string) => Promise<void>;
  onActivateProfile: (id: string) => Promise<void>;
```

(`AIProviderId` 已在 SettingsPanel 顶部 import;若删 `AISection` 后 `AIProviderId`/`useState`/`useEffect`/`useRef` 变为未用,按 oxlint 提示清理 import。)

- [ ] **Step 3: `App.tsx` —— ai.ready + 新 props**

- `App.tsx:350` `aiEnabled: ai.hasKey,` → `aiEnabled: ai.ready,`
- `App.tsx:394` `{ai.hasKey && (` → `{ai.ready && (`
- `useAiActions` 解构(App.tsx:~131):把 `saveAi,` 换成 `saveProfile,`,并加 `deleteProfile,` `activateProfile,`
- `<SettingsPanel ...>`(App.tsx:633)把 `onSaveAi={saveAi}` 换成:

```tsx
          onSaveProfile={saveProfile}
          onDeleteProfile={deleteProfile}
          onActivateProfile={activateProfile}
```

- [ ] **Step 4: 跑 `tsc`,按报错收尾**

Run: `npx tsc --noEmit`
Expected: exit 0。若报 `tests/settings-panel.test.tsx` 用了旧 `ai:{provider,hasKey,model}` 或 `onSaveAi`:把该测试里的 mock AIStatus 改为 `{ profiles: [], activeId: null, ready: false }`(或按用例含一份 profile),`onSaveAi` prop 改为 `onSaveProfile={vi.fn()}` 并补 `onDeleteProfile`/`onActivateProfile` 桩。若其它文件仍引用 `AIStatus.hasKey/provider/model` 顶层字段,改为读 `ai.ready` 或 `ai.profiles`。

- [ ] **Step 5: 跑全套校验**

```bash
npx tsc --noEmit && echo tsc-ok
npx oxlint
npx prettier --check "entrypoints/**/*.{ts,tsx}" "core/**/*.ts" "shared/**/*.ts" "tests/**/*.{ts,tsx}"
npx vitest run
npx wxt build
```
Expected: tsc exit 0;oxlint exit 0(仅既有 warning);prettier all-clean(不齐则 `npx prettier --write <文件>`);vitest 全绿;build ✔。

- [ ] **Step 6: 提交**

```bash
git add entrypoints/sidepanel/components/SettingsPanel.tsx entrypoints/sidepanel/App.tsx entrypoints/sidepanel/store.ts tests/settings-panel.test.tsx
git commit -m "$(printf 'feat(ai): 设置面板接入多份配置;App 用 ai.ready\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01LGDcjBZFfv4KPH3kZ21YCZ')"
```

---

## Self-Review 结论(作者自查)

- **Spec 覆盖**:数据模型(T1)、迁移(T1)、调用链(T2)、AIStatus(T1)、命令(T2)、UI 抽组件+列表+编辑+当前模型显示(T4)、hook(T4)、接线(T5)、i18n(T3)、测试(T1/T2/T4/T5)全部有对应 Task。
- **占位符**:无 TBD/TODO;每个代码步给出完整代码。T5 Step 4 对 `settings-panel.test.tsx` 的修法给了具体形状(mock AIStatus 新结构 + prop 更名),非「酌情处理」。
- **类型一致**:`saveProfile`/`upsert` 的入参 `{ id?, label, provider, model, baseUrl?, (key?) }` 在 store/命令/hook/组件四处一致;`AIStatus{profiles,activeId,ready}` 与 `AIProfileStatus{id,label,provider,model,baseUrl?,hasKey}` 全程一致;`active()`/`effectiveModel(p)`/`keyFor(id)` 签名在 T1 定义、T2 index 消费一致。
- **YAGNI**:无主面板切换、无单次改模型、无导入导出。

## 备注

真机验证(重载 `.output/chrome-mv3`):旧自定义中转站配置自动出现在列表且仍启用、顶部显示模型名 → 新增第二份(另一模型/中转站)→ 切换当前 → AI 整理走新当前份 → 编辑回填正常、删除生效。
