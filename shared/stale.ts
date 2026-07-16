// 陈旧标签判定 —— 纯逻辑(F-10,见 PRD §3.2/US-07)。UI 与 SW 共用。
// 陈旧 = 仍打开、但超过 staleDays 未活跃。只做过滤与展示,不做任何后台任务。

import type { TabRecord } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 距今天数(向下取整,最小 0)。 */
export function daysSince(ts: number, now: number): number {
  return Math.max(0, Math.floor((now - ts) / DAY_MS));
}

/** 是否陈旧:仍是打开的标签(有 chromeTabId)且超过 staleDays 未活跃。 */
export function isStale(tab: TabRecord, now: number, staleDays: number): boolean {
  if (tab.chromeTabId == null) return false; // 已归档/已关闭的不算陈旧
  if (tab.starred) return false; // 重点标签不下沉(用户显式保留)
  return now - tab.lastActiveAt >= staleDays * DAY_MS;
}

/** 所有陈旧标签,最久未访问的排在前面。 */
export function staleTabs(tabs: TabRecord[], now: number, staleDays: number): TabRecord[] {
  return tabs
    .filter((t) => isStale(t, now, staleDays))
    .toSorted((a, b) => a.lastActiveAt - b.lastActiveAt);
}
