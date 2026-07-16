// 设置存储:功能开关、端口映射、内存回收统计,落 chrome.storage.local(见 PRD §5.3)。

import { DEFAULT_FLAGS, type Flags, type PortMapping } from '@/shared/types';
import type { AIProviderId, AIStatus } from '@/shared/ai';
import { PROVIDERS } from '../ai/provider';

const KEY = 'settings:portMappings';
const FLAGS_KEY = 'settings:flags';
const MEM_KEY = 'stats:discardedBytes';

/** 功能开关(自动聚簇 / 陈旧提示 / 自动挂起 等),落 chrome.storage.local。 */
export class FlagsStore {
  private data: Flags = { ...DEFAULT_FLAGS };

  async load(): Promise<void> {
    try {
      const r = await chrome.storage.local.get(FLAGS_KEY);
      this.data = { ...DEFAULT_FLAGS, ...((r[FLAGS_KEY] as Partial<Flags>) ?? {}) };
    } catch {
      this.data = { ...DEFAULT_FLAGS };
    }
  }

  get(): Flags {
    return this.data;
  }

  async patch(partial: Partial<Flags>): Promise<void> {
    this.data = { ...this.data, ...partial };
    try {
      await chrome.storage.local.set({ [FLAGS_KEY]: this.data });
    } catch {
      /* 忽略写入失败 */
    }
  }
}

/** 累计估算回收内存(F-11),落 chrome.storage.local。 */
export class MemoryStore {
  private bytes = 0;

  async load(): Promise<void> {
    try {
      const r = await chrome.storage.local.get(MEM_KEY);
      this.bytes = (r[MEM_KEY] as number) ?? 0;
    } catch {
      this.bytes = 0;
    }
  }

  get(): number {
    return this.bytes;
  }

  async add(delta: number): Promise<void> {
    if (delta <= 0) return;
    this.bytes += delta;
    try {
      await chrome.storage.local.set({ [MEM_KEY]: this.bytes });
    } catch {
      /* 忽略写入失败 */
    }
  }
}

export class PortMappingStore {
  private data: PortMapping[] = [];

  async load(): Promise<void> {
    try {
      const r = await chrome.storage.local.get(KEY);
      this.data = (r[KEY] as PortMapping[]) ?? [];
    } catch {
      this.data = [];
    }
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
    await this.save();
  }

  async remove(port: number): Promise<void> {
    this.data = this.data.filter((m) => m.port !== port);
    await this.save();
  }

  private async save(): Promise<void> {
    try {
      await chrome.storage.local.set({ [KEY]: this.data });
    } catch {
      /* 忽略写入失败 */
    }
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
export class AISettingsStore {
  private data: AIData = { provider: 'anthropic', keys: {}, models: {}, baseUrls: {} };

  async load(): Promise<void> {
    try {
      const r = await chrome.storage.local.get(AI_KEY);
      const saved = (r[AI_KEY] as Partial<AIData>) ?? {};
      this.data = {
        provider: saved.provider ?? 'anthropic',
        keys: saved.keys ?? {},
        models: saved.models ?? {},
        baseUrls: saved.baseUrls ?? {},
      };
    } catch {
      this.data = { provider: 'anthropic', keys: {}, models: {}, baseUrls: {} };
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
    try {
      await chrome.storage.local.set({ [AI_KEY]: this.data });
    } catch {
      /* 忽略写入失败 */
    }
  }
}
