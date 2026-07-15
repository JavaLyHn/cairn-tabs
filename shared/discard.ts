// 标签挂起判定与内存估算 —— 纯逻辑(F-11,见 PRD §7.5)。
// 挂起 = chrome.tabs.discard,释放内存但保留标签条目,点击自动重载。

import type { TabRecord } from './types';
import { localhostPort } from './localhost';

/** 每挂起一个标签的估算回收内存(经验均值 ~80MB,PRD §7.5),仅作体感展示。 */
export const BYTES_PER_DISCARD = 80 * 1024 * 1024;

export interface DiscardOptions {
  discardAfterMinutes: number;
  skipLocalhost: boolean;
}

/** 一个已打开标签是否该被挂起(需同时给出它的真实 chrome.Tab 运行态)。 */
export function shouldDiscard(
  record: TabRecord,
  live: { active?: boolean; audible?: boolean; pinned?: boolean; discarded?: boolean } | undefined,
  now: number,
  opts: DiscardOptions,
): boolean {
  if (record.chromeTabId == null) return false; // 已归档,无对应标签
  if (record.starred) return false; // 重点标签不自动挂起(用户显式保留)
  if (record.discarded) return false; // 已挂起
  if (!live) return false; // 找不到真实标签(可能刚被关闭)
  if (live.active || live.audible || live.pinned || live.discarded) return false; // 使用中 / 已挂起
  if (opts.skipLocalhost && localhostPort(record.url) != null) return false; // 护 dev server
  return now - record.lastActiveAt >= opts.discardAfterMinutes * 60_000;
}

/** "~1.8 GB" —— 估算回收量的人类可读表示。 */
export function formatReclaimed(bytes: number): string {
  if (bytes <= 0) return '0';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `~${Math.round(mb)} MB`;
  return `~${(mb / 1024).toFixed(1)} GB`;
}
