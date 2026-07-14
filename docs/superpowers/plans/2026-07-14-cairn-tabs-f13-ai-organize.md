# F-13 AI 整理未分类(BYO Key)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给「未分类」一键 AI 整理:AI 读标签标题+域名与已有任务名,提议分成新任务或并入已有任务,用户预览确认后生效。

**Architecture:** SW 全包 —— UI 发命令,SW 调 API(直连,BYO key)、解析成提案返回,UI 预览确认后再发命令让 SW 建组/移动。提案不落库,应用前 DB 零改动。key 只在 SW 读,不进 UI。

**Tech Stack:** WXT (MV3) · TypeScript · Dexie · Zustand · React 19 · Vitest · fake-chrome/fake-indexeddb 测试。

## Global Constraints

- **默认关闭**:某 provider 存了 key 才可用;不设单独 enabled 开关。
- **BYO Key,直连官方**:Anthropic + OpenAI 两家;不经任何中转服务器。
- **数据最小化**:只发 标签标题 + eTLD+1 域名 + 任务名;绝不发完整 URL / query / 页面内容。
- **不盲信 / 静默降级**:AI 只产出提案;任何失败(无 key/权限/网络/解析)都不改数据。
- **权限最小化**:`optional_host_permissions`,用户存 key 时按需申请对应域名。
- **架构不变量**:SW 是唯一写入方;自发的 tabs/tabGroups 操作走同步锁;DB 只经 repositories。
- **key 只在 SW**:UI 只收脱敏状态 `{provider, hasKey, model}`,永不含 key。
- 严格 TS(`noUncheckedIndexedAccess` 开启);正则捕获/数组下标需断言或判空。
- 默认模型:Anthropic `claude-haiku-4-5`;OpenAI `gpt-4o-mini`。
- 提交信息结尾:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: 共享类型 + prompt 构建与响应解析(纯逻辑)

**Files:**
- Create: `shared/ai.ts`
- Create: `core/ai/organize.ts`
- Test: `tests/ai-organize.test.ts`

**Interfaces:**
- Produces: `AIPlan`、`AIStatus`、`AIProviderId`、`AIErrorReason`(`shared/ai.ts`);
  `buildOrganizePrompt(tabs: OrganizeTab[], tasks: OrganizeTask[]): { system: string; user: string }`;
  `parseOrganizeResponse(raw: string, validTabIds: Set<string>, validTaskIds: Set<string>): AIPlan | null`;
  `OrganizeTab = { id: string; title: string; domain: string }`;`OrganizeTask = { id: string; name: string }`。

- [ ] **Step 1: 写 `shared/ai.ts`(类型)**

```ts
// AI 整理未分类的共享类型(F-13,见 spec)。UI 与 SW 共用。

export type AIProviderId = 'anthropic' | 'openai';

/** AI 提案:新建分组 + 并入已有任务;未提及的标签留在未分类。 */
export interface AIPlan {
  newGroups: { name: string; tabIds: string[] }[];
  assign: { taskId: string; tabIds: string[] }[];
}

/** 脱敏状态,随快照广播给 UI —— 永不含 key。 */
export interface AIStatus {
  provider: AIProviderId;
  hasKey: boolean;
  model: string;
}

export type AIErrorReason = 'no_key' | 'permission' | 'network' | 'parse' | 'empty';
```

- [ ] **Step 2: 写失败测试 `tests/ai-organize.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildOrganizePrompt, parseOrganizeResponse } from '@/core/ai/organize';

const TABS = new Set(['t1', 't2', 't3']);
const TASKS = new Set(['c1']);

describe('buildOrganizePrompt', () => {
  it('系统提示含 JSON 约束,user 含标签与任务', () => {
    const { system, user } = buildOrganizePrompt(
      [{ id: 't1', title: 'React hooks', domain: 'react.dev' }],
      [{ id: 'c1', name: 'auth-service' }],
    );
    expect(system).toContain('JSON');
    expect(user).toContain('t1');
    expect(user).toContain('react.dev');
    expect(user).toContain('auth-service');
  });
});

describe('parseOrganizeResponse', () => {
  it('解析正常 JSON', () => {
    const raw = '{"newGroups":[{"name":"前端","tabIds":["t1","t2"]}],"assign":[{"taskId":"c1","tabIds":["t3"]}]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [{ name: '前端', tabIds: ['t1', 't2'] }],
      assign: [{ taskId: 'c1', tabIds: ['t3'] }],
    });
  });
  it('去掉 ```json 代码围栏', () => {
    const raw = '```json\n{"newGroups":[{"name":"g","tabIds":["t1"]}],"assign":[]}\n```';
    expect(parseOrganizeResponse(raw, TABS, TASKS)?.newGroups[0]?.name).toBe('g');
  });
  it('丢弃非法 tabId 与未知 taskId', () => {
    const raw = '{"newGroups":[{"name":"g","tabIds":["t1","BAD"]}],"assign":[{"taskId":"NOPE","tabIds":["t2"]}]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [{ name: 'g', tabIds: ['t1'] }],
      assign: [],
    });
  });
  it('同一标签只归一处(去重,以先出现为准)', () => {
    const raw = '{"newGroups":[{"name":"a","tabIds":["t1"]},{"name":"b","tabIds":["t1","t2"]}],"assign":[]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [{ name: 'a', tabIds: ['t1'] }, { name: 'b', tabIds: ['t2'] }],
      assign: [],
    });
  });
  it('空组名或空 tabIds 的组被丢弃', () => {
    const raw = '{"newGroups":[{"name":"","tabIds":["t1"]},{"name":"x","tabIds":[]}],"assign":[]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toBeNull();
  });
  it('JSON 解析失败 → null', () => {
    expect(parseOrganizeResponse('not json', TABS, TASKS)).toBeNull();
  });
  it('空结果 → null', () => {
    expect(parseOrganizeResponse('{"newGroups":[],"assign":[]}', TABS, TASKS)).toBeNull();
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm vitest run tests/ai-organize.test.ts`
Expected: FAIL(`organize` 模块不存在)

- [ ] **Step 4: 写 `core/ai/organize.ts`**

```ts
// AI 整理:prompt 构建 + 响应解析(F-13)。provider 无关的纯逻辑,重点单测。

import type { AIPlan } from '@/shared/ai';

export interface OrganizeTab {
  id: string;
  title: string;
  domain: string;
}
export interface OrganizeTask {
  id: string;
  name: string;
}

export function buildOrganizePrompt(
  tabs: OrganizeTab[],
  tasks: OrganizeTask[],
): { system: string; user: string } {
  const system = [
    '你是帮程序员整理浏览器标签的助手。',
    '把「零散标签」按任务/主题归类:可新建命名分组,或并入某个「已有任务」。',
    '规则:',
    '- 保守:拿不准就不要归类(该标签不出现在输出里,自动留在未分类)。',
    '- 明显属于某个已有任务时,优先并入该任务而不是新建同类分组。',
    '- 新建分组名简短(不超过 16 字),语言与标签标题一致。',
    '- 只输出严格 JSON,不要任何解释、不要 Markdown 代码块。',
    'JSON 结构:',
    '{"newGroups":[{"name":"组名","tabIds":["标签id"]}],"assign":[{"taskId":"任务id","tabIds":["标签id"]}]}',
  ].join('\n');
  const user = JSON.stringify({
    looseTabs: tabs.map((t) => ({ id: t.id, title: t.title, domain: t.domain })),
    existingTasks: tasks.map((t) => ({ id: t.id, name: t.name })),
  });
  return { system, user };
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1]! : s).trim();
}

export function parseOrganizeResponse(
  raw: string,
  validTabIds: Set<string>,
  validTaskIds: Set<string>,
): AIPlan | null {
  let data: unknown;
  try {
    data = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const seen = new Set<string>(); // 一个标签至多归一处
  const takeTabs = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const x of arr) {
      if (typeof x === 'string' && validTabIds.has(x) && !seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  };

  const d = data as { newGroups?: unknown; assign?: unknown };
  const newGroups: AIPlan['newGroups'] = [];
  if (Array.isArray(d.newGroups)) {
    for (const g of d.newGroups) {
      if (!g || typeof g !== 'object') continue;
      const rawName = (g as { name?: unknown }).name;
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      const tabIds = takeTabs((g as { tabIds?: unknown }).tabIds);
      if (name && tabIds.length) newGroups.push({ name: name.slice(0, 40), tabIds });
    }
  }

  const assign: AIPlan['assign'] = [];
  if (Array.isArray(d.assign)) {
    for (const a of d.assign) {
      if (!a || typeof a !== 'object') continue;
      const rawTaskId = (a as { taskId?: unknown }).taskId;
      const taskId = typeof rawTaskId === 'string' ? rawTaskId : '';
      if (!validTaskIds.has(taskId)) continue;
      const tabIds = takeTabs((a as { tabIds?: unknown }).tabIds);
      if (tabIds.length) assign.push({ taskId, tabIds });
    }
  }

  if (newGroups.length === 0 && assign.length === 0) return null;
  return { newGroups, assign };
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm vitest run tests/ai-organize.test.ts`
Expected: PASS(7 个用例)

- [ ] **Step 6: 提交**

```bash
git add shared/ai.ts core/ai/organize.ts tests/ai-organize.test.ts
git commit -m "feat(ai): organize prompt builder + response parser (F-13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Provider(Anthropic + OpenAI HTTP)

**Files:**
- Create: `core/ai/provider.ts`
- Test: `tests/ai-provider.test.ts`

**Interfaces:**
- Consumes: `AIProviderId`(Task 1)。
- Produces: `ChatRequest = { system: string; user: string; model: string; maxTokens: number; signal?: AbortSignal }`;
  `AIProvider = { id; defaultModel: string; host: string; complete(req, key, fetchImpl?): Promise<string> }`;
  `PROVIDERS: Record<AIProviderId, AIProvider>`;`anthropicProvider`、`openaiProvider`。

- [ ] **Step 1: 写失败测试 `tests/ai-provider.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { anthropicProvider, openaiProvider, PROVIDERS } from '@/core/ai/provider';
import type { ChatRequest } from '@/core/ai/provider';

const req: ChatRequest = { system: 'S', user: 'U', model: 'm', maxTokens: 100 };

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('anthropicProvider', () => {
  it('请求塑形正确、取出文本', async () => {
    const { fn, calls } = fakeFetch(200, { content: [{ text: 'hello' }] });
    const out = await anthropicProvider.complete(req, 'sk-ant', fn);
    expect(out).toBe('hello');
    const call = calls[0]!;
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(JSON.parse(call.init.body as string).system).toBe('S');
  });
  it('非 2xx 抛错', async () => {
    const { fn } = fakeFetch(401, {});
    await expect(anthropicProvider.complete(req, 'k', fn)).rejects.toThrow();
  });
});

describe('openaiProvider', () => {
  it('请求塑形正确、取出文本', async () => {
    const { fn, calls } = fakeFetch(200, { choices: [{ message: { content: 'hi' } }] });
    const out = await openaiProvider.complete(req, 'sk-oai', fn);
    expect(out).toBe('hi');
    const call = calls[0]!;
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions');
    expect((call.init.headers as Record<string, string>).authorization).toBe('Bearer sk-oai');
    const msgs = JSON.parse(call.init.body as string).messages;
    expect(msgs[0]).toEqual({ role: 'system', content: 'S' });
    expect(msgs[1]).toEqual({ role: 'user', content: 'U' });
  });
});

describe('PROVIDERS', () => {
  it('两家默认模型', () => {
    expect(PROVIDERS.anthropic.defaultModel).toBe('claude-haiku-4-5');
    expect(PROVIDERS.openai.defaultModel).toBe('gpt-4o-mini');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/ai-provider.test.ts`
Expected: FAIL(`provider` 模块不存在)

- [ ] **Step 3: 写 `core/ai/provider.ts`**

```ts
// AI Provider —— 各家 HTTP + 鉴权差异(F-13)。fetch 可注入以便单测。

import type { AIProviderId } from '@/shared/ai';

export interface ChatRequest {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface AIProvider {
  id: AIProviderId;
  defaultModel: string;
  host: string; // optional host permission 匹配串
  complete(req: ChatRequest, key: string, fetchImpl?: typeof fetch): Promise<string>;
}

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  defaultModel: 'claude-haiku-4-5',
  host: 'https://api.anthropic.com/*',
  async complete(req, key, fetchImpl = fetch) {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      }),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data = (await res.json()) as { content?: { text?: unknown }[] };
    const text = data?.content?.[0]?.text;
    if (typeof text !== 'string') throw new Error('anthropic: no text');
    return text;
  },
};

export const openaiProvider: AIProvider = {
  id: 'openai',
  defaultModel: 'gpt-4o-mini',
  host: 'https://api.openai.com/*',
  async complete(req, key, fetchImpl = fetch) {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      }),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('openai: no text');
    return text;
  },
};

export const PROVIDERS: Record<AIProviderId, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run tests/ai-provider.test.ts`
Expected: PASS(5 个用例)

- [ ] **Step 5: 提交**

```bash
git add core/ai/provider.ts tests/ai-provider.test.ts
git commit -m "feat(ai): Anthropic + OpenAI providers (F-13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: AISettingsStore(key/model 按 provider 存)

**Files:**
- Modify: `core/background/settings.ts`(追加 `AISettingsStore`)
- Test: `tests/ai-settings.test.ts`

**Interfaces:**
- Consumes: `PROVIDERS`(Task 2)、`AIProviderId`/`AIStatus`(Task 1)。
- Produces: `AISettingsStore`,方法 `load()`、`provider()`、`keyFor(p?)`、`effectiveModel(p?)`、
  `configured()`、`status(): AIStatus`、`set(provider, key?, model?)`。

- [ ] **Step 1: 写失败测试 `tests/ai-settings.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/ai-settings.test.ts`
Expected: FAIL(`AISettingsStore` 未导出)

- [ ] **Step 3: 在 `core/background/settings.ts` 顶部加导入,并在文件末尾追加 `AISettingsStore`**

顶部加(与现有 import 合并):

```ts
import type { AIProviderId, AIStatus } from '@/shared/ai';
import { PROVIDERS } from '../ai/provider';
```

文件末尾追加:

```ts
const AI_KEY = 'settings:ai';

interface AIData {
  provider: AIProviderId;
  keys: Partial<Record<AIProviderId, string>>;
  models: Partial<Record<AIProviderId, string>>;
}

/** AI 设置:provider、各家 key 与模型覆盖。key 只在 SW 读,永不广播。 */
export class AISettingsStore {
  private data: AIData = { provider: 'anthropic', keys: {}, models: {} };

  async load(): Promise<void> {
    try {
      const r = await chrome.storage.local.get(AI_KEY);
      const saved = (r[AI_KEY] as Partial<AIData>) ?? {};
      this.data = {
        provider: saved.provider ?? 'anthropic',
        keys: saved.keys ?? {},
        models: saved.models ?? {},
      };
    } catch {
      this.data = { provider: 'anthropic', keys: {}, models: {} };
    }
  }

  provider(): AIProviderId {
    return this.data.provider;
  }

  keyFor(p: AIProviderId = this.data.provider): string | undefined {
    return this.data.keys[p];
  }

  effectiveModel(p: AIProviderId = this.data.provider): string {
    return this.data.models[p] || PROVIDERS[p].defaultModel;
  }

  configured(): boolean {
    return !!this.keyFor();
  }

  status(): AIStatus {
    return { provider: this.data.provider, hasKey: this.configured(), model: this.effectiveModel() };
  }

  async set(provider: AIProviderId, key?: string, model?: string): Promise<void> {
    const keys = { ...this.data.keys };
    const models = { ...this.data.models };
    if (key !== undefined) {
      const k = key.trim();
      if (k) keys[provider] = k;
      else delete keys[provider];
    }
    if (model !== undefined) {
      const m = model.trim();
      if (m) models[provider] = m;
      else delete models[provider];
    }
    this.data = { provider, keys, models };
    try {
      await chrome.storage.local.set({ [AI_KEY]: this.data });
    } catch {
      /* 忽略写入失败 */
    }
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run tests/ai-settings.test.ts`
Expected: PASS(5 个用例)

- [ ] **Step 5: 提交**

```bash
git add core/background/settings.ts tests/ai-settings.test.ts
git commit -m "feat(ai): AISettingsStore — per-provider key/model, redacted status (F-13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 消息协议 + 命令处理(SET_AI_SETTINGS / AI_ORGANIZE_INBOX / APPLY_AI_PLAN)

**Files:**
- Modify: `shared/messaging.ts`(命令/事件/快照 ai + COMMAND_TYPES)
- Modify: `core/background/commands.ts`(`CommandContext.ai`、三个 handler、`assignTab` 辅助)
- Test: `tests/ai-apply.integration.test.ts`

**Interfaces:**
- Consumes: `AIPlan`/`AIStatus`/`AIProviderId`/`AIErrorReason`(Task 1);`buildOrganizePrompt`/`parseOrganizeResponse`(Task 1);`registrableDomain`(`core/clustering/signals`);`ensureTabInContextGroup`/`syncGroupTitle`(`core/background/group-sync`,已在 commands.ts 导入)。
- Produces: `CommandContext.ai?: { status(): AIStatus; configured(): boolean; complete(system, user): Promise<string>; set(provider, key?, model?): Promise<void> }`。

- [ ] **Step 1: 改 `shared/messaging.ts`**

顶部导入补 `AIPlan, AIStatus, AIProviderId, AIErrorReason`:

```ts
import type { Context, TabRecord, SearchResult, PortMapping, Flags } from './types';
import type { AIPlan, AIStatus, AIProviderId, AIErrorReason } from './ai';
```

`Command` 联合追加:

```ts
  | { type: 'AI_ORGANIZE_INBOX' }
  | { type: 'APPLY_AI_PLAN'; plan: AIPlan }
  | { type: 'SET_AI_SETTINGS'; provider: AIProviderId; key?: string; model?: string }
```

`Event` 联合追加,并给 `STATE_SNAPSHOT` 加 `ai`:

```ts
  | { type: 'AI_PLAN'; plan: AIPlan; tabs: TabRecord[] }
  | { type: 'AI_ERROR'; reason: AIErrorReason }
```

`STATE_SNAPSHOT` 对象加一行 `ai: AIStatus;`(在 `discardedBytes` 后)。

`COMMAND_TYPES` 集合追加三个:`'AI_ORGANIZE_INBOX'`、`'APPLY_AI_PLAN'`、`'SET_AI_SETTINGS'`。

- [ ] **Step 2: 改 `core/background/commands.ts` —— 导入与 CommandContext**

顶部导入补:

```ts
import { registrableDomain } from '../clustering/signals';
import { buildOrganizePrompt, parseOrganizeResponse } from '../ai/organize';
import type { AIProviderId, AIStatus } from '@/shared/ai';
```

`CommandContext` 追加:

```ts
  /** AI 整理(F-13);测试中可注入假实现,省略则相关命令降级。 */
  ai?: {
    status: () => AIStatus;
    configured: () => boolean;
    complete: (system: string, user: string) => Promise<string>;
    set: (provider: AIProviderId, key?: string, model?: string) => Promise<void>;
  };
```

- [ ] **Step 3: 在 `commands.ts` 加 `assignTab` 辅助(放在 `archiveAndClose` 附近)**

```ts
/** 把标签归入某任务(与手动拖拽同一套:移动 + 锁定 + 并入原生分组)。 */
async function assignTab(
  tabRecordId: string,
  toContextId: string,
  repo: Repository,
  now: number,
): Promise<void> {
  const rec = await repo.getTab(tabRecordId);
  if (!rec) return;
  await repo.moveTab(tabRecordId, toContextId, now);
  await repo.pinTab(tabRecordId);
  const after = await repo.getTab(tabRecordId);
  if (after?.chromeTabId != null) await ensureTabInContextGroup(repo, toContextId, after.chromeTabId);
}
```

- [ ] **Step 4: 在 `commands.ts` 的 `switch` 里加三个 case(放在 SET_DISCARD_SKIP_LOCALHOST 之后)**

```ts
    case 'SET_AI_SETTINGS':
      await ctx.ai?.set(cmd.provider, cmd.key, cmd.model);
      onChange();
      return;

    case 'AI_ORGANIZE_INBOX': {
      if (!ctx.ai || !ctx.ai.configured()) return { type: 'AI_ERROR', reason: 'no_key' };
      const { contexts, tabs } = await repo.getSnapshot();
      const loose = tabs.filter((t) => t.contextId === INBOX_ID && t.chromeTabId != null);
      if (loose.length === 0) return { type: 'AI_ERROR', reason: 'empty' };
      const tasks = contexts.filter((c) => c.id !== INBOX_ID && c.status === 'active');
      const { system, user } = buildOrganizePrompt(
        loose.map((t) => ({ id: t.id, title: t.title, domain: registrableDomain(t.url) })),
        tasks.map((c) => ({ id: c.id, name: c.name })),
      );
      let raw: string;
      try {
        raw = await ctx.ai.complete(system, user);
      } catch {
        return { type: 'AI_ERROR', reason: 'network' };
      }
      const plan = parseOrganizeResponse(
        raw,
        new Set(loose.map((t) => t.id)),
        new Set(tasks.map((c) => c.id)),
      );
      if (!plan) return { type: 'AI_ERROR', reason: 'parse' };
      return { type: 'AI_PLAN', plan, tabs: loose };
    }

    case 'APPLY_AI_PLAN': {
      for (const g of cmd.plan.newGroups) {
        const created = await repo.createContext(g.name, now);
        for (const tabId of g.tabIds) await assignTab(tabId, created.id, repo, now);
        await syncGroupTitle(repo, created.id, g.name);
      }
      for (const a of cmd.plan.assign) {
        const target = await repo.getContext(a.taskId);
        if (!target || target.status !== 'active') continue;
        for (const tabId of a.tabIds) await assignTab(tabId, a.taskId, repo, now);
      }
      onChange();
      return;
    }
```

- [ ] **Step 5: 写集成测试 `tests/ai-apply.integration.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { Repository } from '@/core/store/repositories';
import { CairnTabsDB } from '@/core/store/db';
import { SearchIndex } from '@/core/search';
import { UndoManager } from '@/core/background/undo';
import { registerTabListeners } from '@/core/background/tab-sync';
import { registerGroupListeners } from '@/core/background/group-sync';
import { handleCommand, type CommandContext } from '@/core/background/commands';
import { INBOX_ID } from '@/shared/types';

let fake: FakeChrome;
let repo: Repository;
let ctx: CommandContext;
let dbn = 7000;

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`ai-itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, ctx.onChange, () => ({}), () => false); // 关自动聚簇,保证进未分类
  registerGroupListeners(repo, ctx.onChange);
});

async function looseTabIds(): Promise<string[]> {
  return (await repo.getContext(INBOX_ID))!.tabOrder;
}

describe('AI_ORGANIZE_INBOX (F-13)', () => {
  it('未配置 key → no_key', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const ev = await handleCommand({ type: 'AI_ORGANIZE_INBOX' }, ctx);
    expect(ev).toEqual({ type: 'AI_ERROR', reason: 'no_key' });
  });

  it('把 AI 提案原样返回(不写库)', async () => {
    const aiCtx: CommandContext = {
      ...ctx,
      ai: {
        status: () => ({ provider: 'anthropic', hasKey: true, model: 'm' }),
        configured: () => true,
        complete: async () => '', // 下面按需覆盖
        set: async () => {},
      },
    };
    await fake.userOpenTab('https://react.dev/x', { title: 'React' });
    await fake.userOpenTab('https://vitejs.dev/y', { title: 'Vite' });
    const ids = await looseTabIds();
    aiCtx.ai!.complete = async () =>
      JSON.stringify({ newGroups: [{ name: '前端', tabIds: ids }], assign: [] });

    const ev = await handleCommand({ type: 'AI_ORGANIZE_INBOX' }, aiCtx);
    expect(ev?.type).toBe('AI_PLAN');
    // 提案返回但 DB 未变:两标签仍在未分类
    expect((await looseTabIds()).length).toBe(2);
  });

  it('complete 抛错 → network', async () => {
    const aiCtx: CommandContext = {
      ...ctx,
      ai: {
        status: () => ({ provider: 'anthropic', hasKey: true, model: 'm' }),
        configured: () => true,
        complete: async () => {
          throw new Error('boom');
        },
        set: async () => {},
      },
    };
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const ev = await handleCommand({ type: 'AI_ORGANIZE_INBOX' }, aiCtx);
    expect(ev).toEqual({ type: 'AI_ERROR', reason: 'network' });
  });
});

describe('APPLY_AI_PLAN (F-13)', () => {
  it('建新任务并把标签移入,新鲜标签离开未分类', async () => {
    await fake.userOpenTab('https://react.dev/x', { title: 'React' });
    await fake.userOpenTab('https://vitejs.dev/y', { title: 'Vite' });
    const ids = await looseTabIds();

    await handleCommand(
      { type: 'APPLY_AI_PLAN', plan: { newGroups: [{ name: '前端', tabIds: ids }], assign: [] } },
      ctx,
    );

    expect(await looseTabIds()).toEqual([]);
    const { contexts } = await repo.getSnapshot();
    const created = contexts.find((c) => c.name === '前端');
    expect(created).toBeTruthy();
    expect(created!.tabOrder.length).toBe(2);
  });

  it('并入已有任务;忽略非法 tabId 与不存在任务', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [id] = await looseTabIds();
    await handleCommand({ type: 'CREATE_CONTEXT', name: 'bug-1' }, ctx);
    const { contexts } = await repo.getSnapshot();
    const target = contexts.find((c) => c.name === 'bug-1')!;

    await handleCommand(
      {
        type: 'APPLY_AI_PLAN',
        plan: {
          newGroups: [],
          assign: [
            { taskId: target.id, tabIds: [id!, 'BADID'] },
            { taskId: 'NOPE', tabIds: [] },
          ],
        },
      },
      ctx,
    );

    expect((await repo.getContext(target.id))!.tabOrder).toContain(id);
    expect(await looseTabIds()).toEqual([]);
  });
});
```

- [ ] **Step 6: 运行 + 全量类型检查**

Run: `pnpm vitest run tests/ai-apply.integration.test.ts && pnpm compile`
Expected: PASS(5 用例)+ 类型检查干净

- [ ] **Step 7: 提交**

```bash
git add shared/messaging.ts core/background/commands.ts tests/ai-apply.integration.test.ts
git commit -m "feat(ai): AI_ORGANIZE_INBOX / APPLY_AI_PLAN / SET_AI_SETTINGS commands (F-13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: SW 装配 + 权限声明

**Files:**
- Modify: `core/background/index.ts`
- Modify: `wxt.config.ts`

**Interfaces:**
- Consumes: `AISettingsStore`(Task 3)、`PROVIDERS`(Task 2)、`CommandContext.ai`(Task 4)。
- Produces: 广播的 `STATE_SNAPSHOT.ai`;运行期 `cmdCtx.ai`(complete 走真 provider,30s 超时)。

- [ ] **Step 1: 改 `core/background/index.ts`**

导入补:

```ts
import { PortMappingStore, FlagsStore, MemoryStore, AISettingsStore } from './settings';
import { PROVIDERS } from '../ai/provider';
```

实例化(与其它 store 一起):

```ts
const aiSettings = new AISettingsStore();
```

`broadcast()` 的 `sendMessage` 对象加一行:

```ts
      ai: aiSettings.status(),
```

`cmdCtx` 追加:

```ts
  ai: {
    status: () => aiSettings.status(),
    configured: () => aiSettings.configured(),
    complete: (system, user) => {
      const p = aiSettings.provider();
      const key = aiSettings.keyFor();
      if (!key) return Promise.reject(new Error('no key'));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      return PROVIDERS[p]
        .complete(
          { system, user, model: aiSettings.effectiveModel(), maxTokens: 1024, signal: ctrl.signal },
          key,
        )
        .finally(() => clearTimeout(timer));
    },
    set: (provider, key, model) => aiSettings.set(provider, key, model),
  },
```

`hydrate()` 里加(与其它 load 一起):

```ts
  await aiSettings.load();
```

- [ ] **Step 2: 改 `wxt.config.ts` —— 加 optional_host_permissions**

在 `permissions` 行后加:

```ts
    optional_host_permissions: ['https://api.anthropic.com/*', 'https://api.openai.com/*'],
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `pnpm compile && pnpm build`
Expected: 均通过;`.output/chrome-mv3/manifest.json` 含 `optional_host_permissions`

- [ ] **Step 4: 提交**

```bash
git add core/background/index.ts wxt.config.ts
git commit -m "feat(ai): wire AISettingsStore, broadcast status, optional host perms (F-13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: UI 状态 + store

**Files:**
- Modify: `entrypoints/sidepanel/store.ts`

**Interfaces:**
- Consumes: `AIStatus`(Task 1)、`STATE_SNAPSHOT.ai`(Task 4)。
- Produces: `usePanelStore` 增加 `ai: AIStatus`;`applySnapshot` 增加 `ai` 参数(末位)。

- [ ] **Step 1: 改 `store.ts`**

导入补 `AIStatus`:

```ts
import { DEFAULT_FLAGS, type Context, type TabRecord, type PortMapping, type Flags } from '@/shared/types';
import type { AIStatus } from '@/shared/ai';
```

`PanelState` 加字段与参数:

```ts
  ai: AIStatus;
```

`applySnapshot` 签名末尾加 `ai: AIStatus`:

```ts
  applySnapshot: (
    contexts: Context[],
    tabs: TabRecord[],
    portMappings: PortMapping[],
    flags: Flags,
    discardedBytes: number,
    ai: AIStatus,
  ) => void;
```

初始值与 setter:

```ts
  ai: { provider: 'anthropic', hasKey: false, model: 'claude-haiku-4-5' },
```
```ts
  applySnapshot: (contexts, tabs, portMappings, flags, discardedBytes, ai) =>
    set({ contexts, tabs, portMappings, flags, discardedBytes, ai }),
```

- [ ] **Step 2: 类型检查(会因 App 未传 ai 而报错,下一 Task 修)**

Run: `pnpm vitest run tests/ai-organize.test.ts`
Expected: PASS(确认无回归;App 的类型错误在 Task 7 一并解决)

- [ ] **Step 3: 提交**

```bash
git add entrypoints/sidepanel/store.ts
git commit -m "feat(ai): add ai status to panel store (F-13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 预览对话框 + 未分类 AI 入口 + App 接线

**Files:**
- Create: `entrypoints/sidepanel/components/AIPlanDialog.tsx`
- Modify: `entrypoints/sidepanel/components/ContextGroup.tsx`(未分类加「✦ AI 整理」)
- Modify: `entrypoints/sidepanel/App.tsx`

**Interfaces:**
- Consumes: `AIPlan`(Task 1)、`ai` store 状态(Task 6)、命令 `AI_ORGANIZE_INBOX`/`APPLY_AI_PLAN`(Task 4)。
- Produces: `AIPlanDialog` 组件;`ContextGroup` 新增可选 props `aiEnabled?: boolean`、`onAiOrganize?: () => void`。

- [ ] **Step 1: 写 `AIPlanDialog.tsx`**

```tsx
import { useState } from 'react';
import type { TabRecord } from '@/shared/types';
import type { AIPlan } from '@/shared/ai';

interface Props {
  plan: AIPlan;
  tabs: TabRecord[]; // 未分类零散标签,供渲染标题/favicon
  taskNames: Record<string, string>; // contextId → 任务名
  onApply: (plan: AIPlan) => void;
  onClose: () => void;
}

export function AIPlanDialog({ plan, tabs, taskNames, onApply, onClose }: Props) {
  const byId = new Map(tabs.map((t) => [t.id, t]));
  // 本地可编辑副本
  const [groups, setGroups] = useState(plan.newGroups.map((g) => ({ ...g, tabIds: [...g.tabIds] })));
  const [assign, setAssign] = useState(plan.assign.map((a) => ({ ...a, tabIds: [...a.tabIds] })));

  const renameGroup = (i: number, name: string) =>
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, name } : g)));
  const dropFromGroup = (i: number, tabId: string) =>
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, tabIds: g.tabIds.filter((t) => t !== tabId) } : g)));
  const dropFromAssign = (i: number, tabId: string) =>
    setAssign((as) => as.map((a, j) => (j === i ? { ...a, tabIds: a.tabIds.filter((t) => t !== tabId) } : a)));

  const finalPlan: AIPlan = {
    newGroups: groups.filter((g) => g.name.trim() && g.tabIds.length),
    assign: assign.filter((a) => a.tabIds.length),
  };
  const empty = finalPlan.newGroups.length === 0 && finalPlan.assign.length === 0;

  const Tab = ({ id, onRemove }: { id: string; onRemove: () => void }) => {
    const t = byId.get(id);
    if (!t) return null;
    return (
      <div className="group/r flex items-center gap-2 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
        {t.faviconUrl ? (
          <img src={t.faviconUrl} alt="" className="w-4 h-4 shrink-0" />
        ) : (
          <div className="w-4 h-4 shrink-0 rounded-sm bg-black/10 dark:bg-white/10" />
        )}
        <span className="flex-1 truncate text-[12.5px]">{t.title}</span>
        <button
          onClick={onRemove}
          className="hidden group-hover/r:block text-[11px] opacity-50 hover:opacity-100"
          title="不归类这个标签"
        >
          移除
        </button>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-30 flex justify-center bg-black/30" onClick={onClose}>
      <div
        className="mt-6 w-[92%] max-h-[82%] flex flex-col rounded-xl overflow-hidden shadow-2xl
                   bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 text-[12px] opacity-70 border-b border-black/10 dark:border-white/10">
          ✦ AI 整理未分类 · 确认后生效
        </div>

        <div className="flex-1 overflow-auto px-3 py-2 space-y-3">
          {groups.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-40 mb-1">新建任务</div>
              {groups.map((g, i) => (
                <div key={i} className="mb-2 rounded-lg border border-black/10 dark:border-white/10 p-1.5">
                  <input
                    value={g.name}
                    onChange={(e) => renameGroup(i, e.target.value)}
                    className="w-full bg-transparent outline-none border-b border-accent/40 focus:border-accent
                               text-[13px] font-medium px-1 py-0.5 mb-1"
                  />
                  {g.tabIds.map((id) => (
                    <Tab key={id} id={id} onRemove={() => dropFromGroup(i, id)} />
                  ))}
                </div>
              ))}
            </div>
          )}

          {assign.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-40 mb-1">并入已有任务</div>
              {assign.map((a, i) => (
                <div key={i} className="mb-2 rounded-lg border border-black/10 dark:border-white/10 p-1.5">
                  <div className="text-[13px] font-medium px-1 py-0.5 mb-1 opacity-80">→ {taskNames[a.taskId] ?? '任务'}</div>
                  {a.tabIds.map((id) => (
                    <Tab key={id} id={id} onRemove={() => dropFromAssign(i, id)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-black/10 dark:border-white/10">
          <button onClick={onClose} className="px-2.5 py-1 rounded-md text-[12px] opacity-60 hover:opacity-100">
            取消
          </button>
          <button
            onClick={() => onApply(finalPlan)}
            disabled={empty}
            className="px-2.5 py-1 rounded-md text-[12px] bg-accent text-white hover:opacity-90 disabled:opacity-40"
          >
            应用
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 改 `ContextGroup.tsx` —— 未分类加「✦ AI 整理」**

Props 接口追加(在 `onArchiveAll` 附近):

```ts
  aiEnabled?: boolean;
  onAiOrganize?: () => void;
```

函数解构参数追加 `aiEnabled`、`onAiOrganize`。

在 inbox 分支的 `收纳全部` 按钮**之前**插入:

```tsx
              {isInbox && aiEnabled && tabs.length > 0 && (
                <button
                  onClick={onAiOrganize}
                  className="text-[11px] text-accent hover:underline"
                  title="用 AI 把零散标签分组"
                >
                  ✦ AI 整理
                </button>
              )}
```

- [ ] **Step 3: 改 `App.tsx` —— 读 ai、接线快照、AI 流程、传参**

`usePanelStore` 读 ai:

```ts
  const ai = usePanelStore((s) => s.ai);
```

快照 `apply` 补 ai(第 65 行附近):

```ts
        const apply = () =>
          applySnapshot(ev.contexts, ev.tabs, ev.portMappings, ev.flags, ev.discardedBytes, ev.ai);
```

导入 `AIPlanDialog` 与类型:

```ts
import { AIPlanDialog } from './components/AIPlanDialog';
import type { AIPlan } from '@/shared/ai';
```

AI 流程 state 与处理器(放在其它 handler 附近):

```ts
  const [aiPlan, setAiPlan] = useState<{ plan: AIPlan; tabs: TabRecord[] } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const aiOrganize = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    showFlash('✦ AI 分析中…');
    const ev = await dispatch({ type: 'AI_ORGANIZE_INBOX' });
    setAiBusy(false);
    if (ev?.type === 'AI_PLAN') setAiPlan({ plan: ev.plan, tabs: ev.tabs });
    else if (ev?.type === 'AI_ERROR') {
      const msg: Record<string, string> = {
        no_key: '请先在设置里填 AI API key',
        permission: '未授权访问 API 域名',
        network: 'AI 调用失败,请稍后重试',
        parse: 'AI 没能给出可用的分组建议,已保持原样',
        empty: '未分类里没有可整理的标签',
      };
      showFlash(msg[ev.reason] ?? 'AI 调用失败');
    }
  };
  const applyAiPlan = (plan: AIPlan) => {
    dispatch({ type: 'APPLY_AI_PLAN', plan });
    setAiPlan(null);
    showFlash('已应用 AI 整理');
  };
```

`groupProps` 里给 inbox 传 AI 入口(在返回对象里加):

```ts
    aiEnabled: ai.hasKey,
    onAiOrganize: aiOrganize,
```

在 SettingsPanel 渲染块附近加对话框渲染:

```tsx
      {aiPlan && (
        <AIPlanDialog
          plan={aiPlan.plan}
          tabs={aiPlan.tabs}
          taskNames={Object.fromEntries(contexts.map((c) => [c.id, c.name]))}
          onApply={applyAiPlan}
          onClose={() => setAiPlan(null)}
        />
      )}
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `pnpm compile && pnpm build`
Expected: 均通过

- [ ] **Step 5: 提交**

```bash
git add entrypoints/sidepanel/components/AIPlanDialog.tsx entrypoints/sidepanel/components/ContextGroup.tsx entrypoints/sidepanel/App.tsx
git commit -m "feat(ai): AI organize preview dialog + inbox entry (F-13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 设置面板 AI 区(填 key + 按需申请权限)

**Files:**
- Modify: `entrypoints/sidepanel/components/SettingsPanel.tsx`
- Modify: `entrypoints/sidepanel/App.tsx`(传 ai 状态 + 保存处理器)

**Interfaces:**
- Consumes: `ai` store 状态(Task 6)、命令 `SET_AI_SETTINGS`(Task 4)、`PROVIDERS` host(Task 2)。
- Produces: SettingsPanel 新增 props `ai: AIStatus`、`onSaveAi: (provider, key, model) => Promise<void>`。

- [ ] **Step 1: 改 `SettingsPanel.tsx` —— 新增 AI 区**

导入补:

```ts
import { useState } from 'react';
import type { Flags } from '@/shared/types';
import type { AIProviderId, AIStatus } from '@/shared/ai';
```

Props 追加:

```ts
  ai: AIStatus;
  onSaveAi: (provider: AIProviderId, key: string, model: string) => Promise<void>;
```

在「导出全部数据」块**之前**插入 AI 区(用一个内部子组件,保持 SettingsPanel 主体清爽):

```tsx
        <div className="border-t border-black/10 dark:border-white/10">
          <AISection ai={ai} onSave={onSaveAi} />
        </div>
```

文件末尾加子组件:

```tsx
function AISection({
  ai,
  onSave,
}: {
  ai: AIStatus;
  onSave: (provider: AIProviderId, key: string, model: string) => Promise<void>;
}) {
  const [provider, setProvider] = useState<AIProviderId>(ai.provider);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await onSave(provider, key, model);
      setKey('');
      setMsg('已保存');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败');
    }
    setSaving(false);
  };

  return (
    <div className="px-3 py-2.5">
      <div className="text-[12.5px] mb-1">AI 整理(BYO Key)</div>
      <div className="text-[11px] opacity-50 leading-snug mb-2">
        默认关闭。开启后仅把标签标题+域名+任务名发给你选的服务商,用你的 key 直连,绝不发完整网址/页面内容。
        {ai.hasKey && <span className="text-accent"> 当前:{ai.provider} 已配置。</span>}
      </div>
      <div className="flex gap-1 mb-1.5">
        {(['anthropic', 'openai'] as AIProviderId[]).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={`px-2 py-0.5 rounded text-[12px] ${
              provider === p ? 'bg-accent/15 text-accent' : 'opacity-60 hover:opacity-100'
            }`}
          >
            {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
          </button>
        ))}
      </div>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={`${provider} API key`}
        className="w-full mb-1.5 px-2 py-1 text-[12px] rounded border border-black/15 dark:border-white/15
                   bg-transparent outline-none focus:border-accent"
      />
      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder="模型(留空用默认)"
        className="w-full mb-1.5 px-2 py-1 text-[12px] rounded border border-black/15 dark:border-white/15
                   bg-transparent outline-none focus:border-accent font-mono"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving || !key.trim()}
          className="px-2.5 py-1 rounded-md text-[12px] bg-accent text-white hover:opacity-90 disabled:opacity-40"
        >
          保存并启用
        </button>
        {msg && <span className="text-[11px] opacity-60">{msg}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 改 `App.tsx` —— saveAi 处理器(含权限申请)+ 传参**

导入补:

```ts
import { PROVIDERS } from '@/core/ai/provider';
import type { AIProviderId } from '@/shared/ai';
```

处理器(放在其它 handler 附近):

```ts
  const saveAi = async (provider: AIProviderId, key: string, model: string) => {
    const origins = [PROVIDERS[provider].host];
    const granted = await chrome.permissions.request({ origins });
    if (!granted) throw new Error('需要授权访问 API 域名');
    await dispatch({ type: 'SET_AI_SETTINGS', provider, key, model });
  };
```

SettingsPanel 调用补 props:

```tsx
        <SettingsPanel
          flags={flags}
          ai={ai}
          onSaveAi={saveAi}
          onToggleAutoCluster={toggleAutoCluster}
          onToggleStaleHints={toggleStaleHints}
          onToggleAutoDiscard={toggleAutoDiscard}
          onToggleDiscardSkipsLocalhost={toggleDiscardSkipsLocalhost}
          onExportAll={exportAllData}
          onClose={() => setSettingsOpen(false)}
        />
```

- [ ] **Step 3: 类型检查 + 全量测试 + 构建**

Run: `pnpm compile && pnpm test && pnpm build`
Expected: 类型干净;全部测试通过;构建成功

- [ ] **Step 4: 提交**

```bash
git add entrypoints/sidepanel/components/SettingsPanel.tsx entrypoints/sidepanel/App.tsx
git commit -m "feat(ai): settings — provider/key/model with on-demand host permission (F-13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: README 更新(F-13 状态 + 隐私声明)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 功能清单加 F-13**

在 F-12 「导出」条目后加:

```markdown
- **AI 整理未分类**(F-13,可选):填入自己的 Anthropic / OpenAI API key 后,「未分类」头部出现「✦ AI 整理」,AI 读标签标题+域名与已有任务名,提议分成新任务或并入已有任务,预览确认后生效。默认关闭;仅发送标题+域名+任务名,直连官方,key 只存本机。
```

- [ ] **Step 2: 更新「尚未实现」行**

改为:

```markdown
尚未实现(见设计文档 Roadmap):自动聚簇的「同域升格」、Firefox 适配、跨设备同步。
```

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs(readme): record F-13 AI organize

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §2 数据流 → Task 4(命令)+ Task 7(预览)+ Task 5(装配)✓
- §3.1 provider → Task 2 ✓;§3.2 organize → Task 1 ✓;§3.3 shared 类型 → Task 1 ✓;§3.4 AISettingsStore → Task 3 ✓
- §4 消息协议 → Task 4 ✓
- §5 权限与隐私 → Task 5(optional_host_permissions)+ Task 8(运行期请求)+ Task 9(隐私声明)✓
- §6 预览 UI → Task 7 ✓
- §7 错误处理 → Task 4(no_key/network/parse/empty)+ Task 8(permission)✓
- §8 测试 → Task 1/2/4(ai-organize / ai-provider / ai-apply.integration)✓
- §9 文件清单 → 全部覆盖 ✓

**Placeholder scan:** 无 TBD/TODO;每个改动步骤都给了完整代码。

**Type consistency:** `AIPlan`/`AIStatus`/`AIProviderId`/`AIErrorReason` 全程一致;`ai.complete(system,user)` 签名在 Task 4 定义、Task 5 实现一致;`applySnapshot` 的 `ai` 参数在 Task 6 定义、Task 7 调用一致;`AISettingsStore` 方法名 Task 3 定义、Task 5 使用一致。

**注意点(实现者):** Task 6 单独提交后 `pnpm compile` 会因 App 尚未传 `ai` 而暂时报错,这是预期的——Task 7 修复;若逐 Task 严格要求 compile 干净,可把 Task 6 与 Task 7 合并提交。
