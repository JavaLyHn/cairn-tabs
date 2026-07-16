// 负样本存储:落 chrome.storage.local,SW 启动时载入,拖出纠错时累加(见 PRD §6.2)。

import { bumpPenalty, type Penalties } from '../clustering/rules';
import { registrableDomain, hostnameOf } from '../clustering/signals';
import { logError } from '@/shared/log';

const STORAGE_KEY = 'clustering:penalties';

export class PenaltyStore {
  private data: Penalties = {};

  async load(): Promise<void> {
    try {
      const r = await chrome.storage.local.get(STORAGE_KEY);
      this.data = (r[STORAGE_KEY] as Penalties) ?? {};
    } catch {
      this.data = {};
    }
  }

  get(): Penalties {
    return this.data;
  }

  /** 把某 URL 的注册域记为「不属于 contextId」的负样本。 */
  async recordNegativeForUrl(url: string, contextId: string): Promise<void> {
    const domain = registrableDomain(hostnameOf(url));
    if (!domain) return;
    this.data = bumpPenalty(this.data, domain, contextId);
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.data });
    } catch (e) {
      logError('penalties.persist', e);
    }
  }
}
