// 设置存储:功能开关、端口映射、内存回收统计,落 chrome.storage.local(见 PRD §5.3)。

import { DEFAULT_FLAGS, type Flags, type PortMapping } from '@/shared/types';
import type { AIProviderId, AIStatus } from '@/shared/ai';
import { PROVIDERS } from '../ai/provider';
import { logError } from '@/shared/log';

const KEY = 'settings:portMappings';
const FLAGS_KEY = 'settings:flags';
const MEM_KEY = 'stats:discardedBytes';

/**
 * chrome.storage.local 持久化基类:统一 load/persist 的读写与错误日志。
 * 子类只需给出 storage key、默认值与 hydrate(把存储原始值转成合法 data)。
 * 读/写失败经 logError 记录(不再无声吞掉),读失败回退默认值。
 */
abstract class PersistedStore<T> {
  protected data: T;

  constructor(
    private readonly storageKey: string,
    private readonly fallback: () => T,
  ) {
    this.data = fallback();
  }

  async load(): Promise<void> {
    try {
      const r = await chrome.storage.local.get(this.storageKey);
      this.data = this.hydrate(r[this.storageKey]);
    } catch (e) {
      logError(`settings.load:${this.storageKey}`, e);
      this.data = this.fallback();
    }
  }

  protected async persist(): Promise<void> {
    try {
      await chrome.storage.local.set({ [this.storageKey]: this.data });
    } catch (e) {
      logError(`settings.persist:${this.storageKey}`, e);
    }
  }

  /** 把存储的原始值(可能 undefined)转成合法 data。 */
  protected abstract hydrate(raw: unknown): T;
}

/** 功能开关(自动聚簇 / 陈旧提示 / 自动挂起 等),落 chrome.storage.local。 */
export class FlagsStore extends PersistedStore<Flags> {
  constructor() {
    super(FLAGS_KEY, () => ({ ...DEFAULT_FLAGS }));
  }

  protected hydrate(raw: unknown): Flags {
    return { ...DEFAULT_FLAGS, ...((raw as Partial<Flags>) ?? {}) };
  }

  get(): Flags {
    return this.data;
  }

  async patch(partial: Partial<Flags>): Promise<void> {
    this.data = { ...this.data, ...partial };
    await this.persist();
  }
}

/** 累计估算回收内存(F-11),落 chrome.storage.local。 */
export class MemoryStore extends PersistedStore<number> {
  constructor() {
    super(MEM_KEY, () => 0);
  }

  protected hydrate(raw: unknown): number {
    return (raw as number) ?? 0;
  }

  get(): number {
    return this.data;
  }

  async add(delta: number): Promise<void> {
    if (delta <= 0) return;
    this.data += delta;
    await this.persist();
  }
}

export class PortMappingStore extends PersistedStore<PortMapping[]> {
  constructor() {
    super(KEY, () => []);
  }

  protected hydrate(raw: unknown): PortMapping[] {
    return (raw as PortMapping[]) ?? [];
  }

  get(): PortMapping[] {
    return this.data;
  }

  async set(port: number, project: string): Promise<void> {
    const name = project.trim();
    if (!name) return;
    this.data = [...this.data.filter((m) => m.port !== port), { port, project: name }].toSorted(
      (a, b) => a.port - b.port,
    );
    await this.persist();
  }

  async remove(port: number): Promise<void> {
    this.data = this.data.filter((m) => m.port !== port);
    await this.persist();
  }
}

const AI_KEY = 'settings:ai';

interface AIData {
  provider: AIProviderId;
  keys: Partial<Record<AIProviderId, string>>;
  models: Partial<Record<AIProviderId, string>>;
  baseUrls: Partial<Record<AIProviderId, string>>;
}

/** AI 设置:provider、各家 key/模型覆盖/中转站地址。key 只在 SW 读,永不广播。 */
export class AISettingsStore extends PersistedStore<AIData> {
  constructor() {
    super(AI_KEY, () => ({ provider: 'anthropic', keys: {}, models: {}, baseUrls: {} }));
  }

  protected hydrate(raw: unknown): AIData {
    const saved = (raw as Partial<AIData>) ?? {};
    return {
      provider: saved.provider ?? 'anthropic',
      keys: saved.keys ?? {},
      models: saved.models ?? {},
      baseUrls: saved.baseUrls ?? {},
    };
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

  baseUrlFor(p: AIProviderId = this.data.provider): string | undefined {
    return this.data.baseUrls[p];
  }

  configured(): boolean {
    // custom 还需 baseUrl 才算可用(否则 endpoint 无从拼接)
    if (!this.keyFor()) return false;
    if (this.data.provider === 'custom') return !!this.baseUrlFor();
    return true;
  }

  status(): AIStatus {
    return {
      provider: this.data.provider,
      hasKey: this.configured(),
      model: this.effectiveModel(),
      baseUrl: this.baseUrlFor(),
    };
  }

  async set(provider: AIProviderId, key?: string, model?: string, baseUrl?: string): Promise<void> {
    const keys = { ...this.data.keys };
    const models = { ...this.data.models };
    const baseUrls = { ...this.data.baseUrls };
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
    if (baseUrl !== undefined) {
      const b = baseUrl.trim();
      if (b) baseUrls[provider] = b;
      else delete baseUrls[provider];
    }
    this.data = { provider, keys, models, baseUrls };
    await this.persist();
  }
}
