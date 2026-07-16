// 挂起扫描(F-11,见 PRD §7.5)。由 chrome.alarms 每 5 分钟触发(仅在自动挂起开启时注册)。
// 遍历打开标签,挂起符合条件者,回填 discarded 并累计估算回收内存。

import type { Repository } from '../store/repositories';
import { shouldDiscard, BYTES_PER_DISCARD, type DiscardOptions } from '@/shared/discard';
import { withSyncPaused } from './sync-lock';
import { logDebug } from '@/shared/log';

/**
 * 执行一轮挂起扫描,返回本轮挂起的标签数。
 * 挂起是我方发起的操作,持锁执行以免自身触发的 onUpdated(discarded) 回灌。
 */
export async function runDiscardScan(
  repo: Repository,
  opts: DiscardOptions,
  onReclaim: (bytes: number) => Promise<void>,
  onChange: () => void,
): Promise<number> {
  const now = Date.now();
  const live = await chrome.tabs.query({});
  const liveById = new Map<number, chrome.tabs.Tab>();
  for (const t of live) if (t.id != null) liveById.set(t.id, t);

  const { tabs } = await repo.getSnapshot();
  let count = 0;
  for (const rec of tabs) {
    if (rec.chromeTabId == null) continue;
    if (!shouldDiscard(rec, liveById.get(rec.chromeTabId), now, opts)) continue;
    await withSyncPaused(async () => {
      try {
        const t = await chrome.tabs.discard(rec.chromeTabId!);
        // discard 可能返回新 id(旧版 Chrome 会换 id);一并回填,避免记录陈旧
        await repo.updateTab(rec.id, { discarded: true, chromeTabId: t?.id ?? rec.chromeTabId });
        count++;
      } catch (e) {
        logDebug('runDiscardScan: 挂起失败(标签可能刚被关闭)', e);
      }
    });
  }
  if (count > 0) {
    await onReclaim(count * BYTES_PER_DISCARD);
    onChange();
  }
  return count;
}
