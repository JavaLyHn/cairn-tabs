// 聚簇引擎与 SW/存储的接线(见 PRD §6)。纯逻辑在 core/clustering,这里负责读写。

import type { Repository } from '../store/repositories';
import { INBOX_ID, type TabRecord } from '@/shared/types';
import { assignContext, findPromotableCluster } from '../clustering/engine';
import type { Penalties } from '../clustering/rules';
import { groupTabsForContext } from './group-sync';

/** 为新标签(未被原生分组归属的)用打分引擎选簇。 */
export async function resolveNewTabContext(
  repo: Repository,
  penalties: Penalties,
  opts: { url: string; openerRecordId?: string; now: number },
): Promise<string> {
  const { contexts, tabs } = await repo.getSnapshot();
  return assignContext({
    url: opts.url,
    openerRecordId: opts.openerRecordId,
    now: opts.now,
    contexts,
    tabs,
    penalties,
  });
}

/**
 * 未分类累积出可升格的 opener 树时,自动升格为新命名簇(见 PRD §6.3)。
 * 返回是否发生了升格。
 */
export async function maybePromoteInbox(repo: Repository, now: number): Promise<boolean> {
  const inbox = await repo.getContext(INBOX_ID);
  if (!inbox) return false;

  const inboxTabs = (
    await Promise.all(inbox.tabOrder.map((id) => repo.getTab(id)))
  ).filter((t): t is TabRecord => t != null);

  const cluster = findPromotableCluster(inboxTabs, now);
  if (!cluster) return false;

  const ctx = await repo.createContext(cluster.name, now);
  for (const id of cluster.memberIds) {
    await repo.moveTab(id, ctx.id, now);
  }

  // 把升格的标签编入新原生分组
  const chromeTabIds: number[] = [];
  for (const id of cluster.memberIds) {
    const t = await repo.getTab(id);
    if (t?.chromeTabId != null) chromeTabIds.push(t.chromeTabId);
  }
  if (chromeTabIds.length) await groupTabsForContext(repo, ctx.id, chromeTabIds);

  return true;
}
