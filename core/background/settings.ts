// 设置存储:功能开关、端口映射、内存回收统计,落 chrome.storage.local(见 PRD §5.3)。

import { DEFAULT_FLAGS, type Flags, type PortMapping } from '@/shared/types';

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
    this.data = [...this.data.filter((m) => m.port !== port), { port, project: name }].sort(
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
