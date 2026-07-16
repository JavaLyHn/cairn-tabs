// 会话恢复(见设计文档):浏览器重启后,Chrome 没恢复回来的活跃命名任务 → 归档(保留 URL)。

import type { Repository } from '../store/repositories';
import { INBOX_ID } from '@/shared/types';

/**
 * 归档「Chrome 没恢复回来」的活跃命名任务(标签与原生分组都没回来 = 真丢了)。
 * 归档保留 URL,可经 RESTORE_CONTEXT 一键重开。返回被归档的 contextId 列表。
 * 调用前应已跑过重绑/重连(reconcile/reconcileGroups 的非破坏轮),使已恢复的标签就位。
 */
export async function archiveUnrestoredContexts(repo: Repository, now: number): Promise<string[]> {
  const liveTabIds = new Set(
    (await chrome.tabs.query({})).map((t) => t.id).filter((n): n is number => n != null),
  );
  const liveGroupIds = new Set((await chrome.tabGroups.query({})).map((g) => g.id));
  const { contexts, tabs } = await repo.getSnapshot();
  const archived: string[] = [];
  for (const c of contexts) {
    if (c.id === INBOX_ID || c.status !== 'active') continue;
    const own = tabs.filter((t) => t.contextId === c.id);
    if (own.length === 0) continue; // 空任务交给常规清理
    const anyLive = own.some((t) => t.chromeTabId != null && liveTabIds.has(t.chromeTabId));
    const groupLive = c.nativeGroupId != null && liveGroupIds.has(c.nativeGroupId);
    if (!anyLive && !groupLive) {
      await repo.archiveContext(c.id, now); // 归档:保留 URL,清 chromeTabId/nativeGroupId
      archived.push(c.id);
    }
  }
  return archived;
}
