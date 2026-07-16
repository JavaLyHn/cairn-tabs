// 会话恢复(见设计文档):浏览器重启后,Chrome 没恢复回来的活跃命名任务 → 归档(保留 URL)。

import type { Repository } from '../store/repositories';
import { INBOX_ID } from '@/shared/types';
import { reconcile } from './tab-sync';
import { reconcileGroups } from './group-sync';

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

/** 宽限判定:graceUntil 为数字且未过 → 处于宽限期,应「不清删」(返回 false)。 */
export function shouldPurgeNow(graceUntil: unknown, now: number): boolean {
  return !(typeof graceUntil === 'number' && now < graceUntil);
}

/** runRecoverySequence 的可注入依赖(测试用假实现,断言调用顺序)。 */
export interface RecoveryDeps {
  reconcile: (repo: Repository, onChange: () => void, opts?: { purge?: boolean }) => Promise<void>;
  reconcileGroups: (
    repo: Repository,
    onChange: () => void,
    opts?: { prune?: boolean },
  ) => Promise<void>;
  archiveUnrestored: (repo: Repository, now: number) => Promise<string[]>;
}

const defaultRecoveryDeps: RecoveryDeps = {
  reconcile,
  reconcileGroups,
  archiveUnrestored: archiveUnrestoredContexts,
};

/**
 * 宽限结束的会话恢复编排(严格顺序):
 *   接住迟到恢复(非破坏)→ 归档没恢复的命名任务 → 常规清理(清删)。
 * 顺序错乱会静默破坏崩溃恢复,故抽成纯编排 + 依赖注入,便于 spy 断言顺序。
 */
export async function runRecoverySequence(
  repo: Repository,
  onChange: () => void,
  now: number,
  deps: RecoveryDeps = defaultRecoveryDeps,
): Promise<void> {
  await deps.reconcile(repo, onChange, { purge: false });
  await deps.reconcileGroups(repo, onChange, { prune: false });
  await deps.archiveUnrestored(repo, now);
  await deps.reconcile(repo, onChange, { purge: true });
  await deps.reconcileGroups(repo, onChange, { prune: true });
  onChange();
}
