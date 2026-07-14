// 设置存储:localhost 端口映射等,落 chrome.storage.local(F-08,见 PRD §5.3)。

import type { PortMapping } from '@/shared/types';

const KEY = 'settings:portMappings';
const FLAGS_KEY = 'settings:flags';

export interface Flags {
  autoCluster: boolean;
}

const DEFAULT_FLAGS: Flags = { autoCluster: true };

/** 功能开关(如自动聚簇),落 chrome.storage.local。 */
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

  autoCluster(): boolean {
    return this.data.autoCluster;
  }

  async setAutoCluster(enabled: boolean): Promise<void> {
    this.data = { ...this.data, autoCluster: enabled };
    try {
      await chrome.storage.local.set({ [FLAGS_KEY]: this.data });
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
