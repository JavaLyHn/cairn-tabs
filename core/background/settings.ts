// 设置存储:功能开关、端口映射、内存回收统计,落 chrome.storage.local(见 PRD §5.3)。

import { DEFAULT_FLAGS, type Flags, type PortMapping } from '@/shared/types';
import type { AIProviderId, AIStatus } from '@/shared/ai';
import { PROVIDERS } from '../ai/provider';
import { logError } from '@/shared/log';
import { nanoid } from 'nanoid';

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
