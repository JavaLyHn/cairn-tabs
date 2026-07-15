// 与原生 chrome.tabGroups 双向同步(见设计文档 §6.4)。
// 映射:未分类 = 未分组标签;每个命名 Context = 一个原生分组(标题+颜色同步)。

import type { Repository } from '../store/repositories';
import { INBOX_ID, type Context, type ContextColor } from '@/shared/types';
import { DRAFT_CONTEXT_NAME } from '@/shared/messaging';
import { withSyncPaused, isSyncPaused } from './sync-lock';

const NONE = -1; // chrome.tabGroups.TAB_GROUP_ID_NONE

/**
 * 空壳任务回收:一个活跃的命名任务若已无标签,则删除它。
 * 用于「原生分组在浏览器里被删/散、或最后一个标签被拖出」之后——否则侧边栏会残留一个空任务
 * (见回归 Bug:删除分组后 tabs 里仍显示)。
 * 只在确实无标签时删(空 tabOrder),避免把正在关闭的标签误移成未分类幻影;
 * 并放过正在命名的新建草稿(空且名为「新任务」)。
 */
async function gcEmptyContext(repo: Repository, contextId: string): Promise<void> {
  if (contextId === INBOX_ID) return;
  const ctx = await repo.getContext(contextId);
  if (!ctx || ctx.status !== 'active') return;
  if (ctx.tabOrder.length > 0) return;
  if (ctx.origin === 'manual' && ctx.name === DRAFT_CONTEXT_NAME) return;
  await repo.deleteContext(contextId, Date.now());
}

/** 并发去重:同一 groupId 的收编只跑一次。 */
const adoptionInFlight = new Map<number, Promise<Context>>();

/** 收编一个原生创建的分组为新 Context(采纳其标题+颜色)。幂等且并发安全。 */
function adoptGroup(repo: Repository, groupId: number, now: number): Promise<Context> {
  const inflight = adoptionInFlight.get(groupId);
  if (inflight) return inflight;
  const p = (async () => {
    const found = await repo.findContextByNativeGroupId(groupId);
    if (found) return found;
    let title = '新分组';
    let color: ContextColor = 'blue';
    try {
      const g = await chrome.tabGroups.get(groupId);
      title = g.title?.trim() || title;
      color = g.color as ContextColor;
    } catch {
      /* 分组已消失,用默认值 */
    }
    return repo.createContext(title, now, { color, nativeGroupId: groupId });
  })().finally(() => adoptionInFlight.delete(groupId));
  adoptionInFlight.set(groupId, p);
  return p;
}

// ---- 出站:Cairn Tabs → 原生 ----

/** 把标签并入其 Context 对应的原生分组(未分类则取消分组)。懒创建分组。 */
export async function ensureTabInContextGroup(
  repo: Repository,
  contextId: string,
  chromeTabId: number,
): Promise<void> {
  await withSyncPaused(async () => {
    if (contextId === INBOX_ID) {
      await chrome.tabs.ungroup(chromeTabId).catch(() => {});
      return;
    }
    const ctx = await repo.getContext(contextId);
    if (!ctx) return;

    let groupId = ctx.nativeGroupId;
    if (groupId != null) {
      // 校验分组是否仍存在
      try {
        await chrome.tabGroups.get(groupId);
      } catch {
        groupId = undefined;
      }
    }
    try {
      if (groupId != null) {
        await chrome.tabs.group({ tabIds: [chromeTabId], groupId });
      } else {
        groupId = await chrome.tabs.group({ tabIds: [chromeTabId] });
        await repo.setNativeGroupId(contextId, groupId);
      }
      await chrome.tabGroups.update(groupId, { title: ctx.name, color: ctx.color });
    } catch {
      /* 标签可能已关闭 */
    }
  });
}

/** 把一组标签编入某 Context 的新原生分组(恢复、升格共用)。 */
export async function groupTabsForContext(
  repo: Repository,
  contextId: string,
  chromeTabIds: number[],
): Promise<void> {
  if (contextId === INBOX_ID || chromeTabIds.length === 0) return;
  const ctx = await repo.getContext(contextId);
  if (!ctx) return;
  const tabIds = chromeTabIds as [number, ...number[]]; // 上面已保证非空
  await withSyncPaused(async () => {
    try {
      const groupId = await chrome.tabs.group({ tabIds });
      await repo.setNativeGroupId(contextId, groupId);
      await chrome.tabGroups.update(groupId, { title: ctx.name, color: ctx.color });
    } catch {
      /* 忽略 */
    }
  });
}

/** 重命名 Context 时同步原生分组标题。 */
export async function syncGroupTitle(repo: Repository, contextId: string, name: string): Promise<void> {
  const ctx = await repo.getContext(contextId);
  if (ctx?.nativeGroupId == null) return;
  const groupId = ctx.nativeGroupId;
  await withSyncPaused(() =>
    chrome.tabGroups
      .update(groupId, { title: name })
      .then(() => {})
      .catch(() => {}),
  );
}

// ---- 入站:原生 → Cairn Tabs ----

/** tab-sync 在 onUpdated(changeInfo.groupId) 时调用:原生把标签拖进/出分组。 */
export async function handleTabGroupChange(
  repo: Repository,
  tabId: number,
  groupId: number,
  _tab: chrome.tabs.Tab,
  onChange: () => void,
): Promise<void> {
  const record = await repo.getTabByChromeId(tabId);
  if (!record) return; // 无记录 → 交由 onUpdated 补建路径按分组归属处理

  const now = Date.now();
  let targetContextId: string;
  if (groupId === NONE) {
    targetContextId = INBOX_ID;
  } else {
    const ctx = (await repo.findContextByNativeGroupId(groupId)) ?? (await adoptGroup(repo, groupId, now));
    targetContextId = ctx.id;
  }

  if (record.contextId !== targetContextId) {
    const from = record.contextId;
    await repo.moveTab(record.id, targetContextId, now);
    await repo.pinTab(record.id); // 原生 UI 的人工分组操作 → 锁定归属(PRD §6.4)
    // 从某命名任务拖出最后一个标签(其原生分组随之解散)→ 清掉空壳任务,不在侧边栏残留
    if (from !== INBOX_ID) await gcEmptyContext(repo, from);
    onChange();
  }
}

export function registerGroupListeners(repo: Repository, onChange: () => void): void {
  // 原生改了分组标题/颜色 → 同步回对应 Context(未知分组则收编)
  chrome.tabGroups.onUpdated.addListener(async (group) => {
    if (isSyncPaused()) return; // 我们自建分组时产生的事件不回灌(否则会把自己的组误收编成「新分组」)
    const ctx = await repo.findContextByNativeGroupId(group.id);
    if (ctx) {
      const nextName = group.title?.trim();
      if (nextName && nextName !== ctx.name) await repo.renameContext(ctx.id, nextName);
      if ((group.color as ContextColor) !== ctx.color) {
        await repo.setContextColor(ctx.id, group.color as ContextColor);
      }
    } else {
      await adoptGroup(repo, group.id, Date.now());
    }
    onChange();
  });

  // 原生解散分组(用户在标签栏「删除/取消分组」)→ 移除对应的空壳任务,标签解组后各自回未分类(不丢)。
  // 先解除分组引用;若标签迁移事件此刻尚未到达、任务还没空,则由那些事件触发的 GC 兜底删除。
  chrome.tabGroups.onRemoved.addListener(async (group) => {
    if (isSyncPaused()) return;
    const ctx = await repo.findContextByNativeGroupId(group.id);
    if (ctx) {
      await repo.setNativeGroupId(ctx.id, undefined);
      await gcEmptyContext(repo, ctx.id);
    }
    onChange();
  });
}

/** hydrate 时按真实分组归属全量校对(补偿 SW 休眠丢失的分组事件)。 */
export async function reconcileGroups(repo: Repository, onChange: () => void): Promise<void> {
  const now = Date.now();

  // 1) 分组在浏览器里已消失:空壳的活跃命名任务直接删除(补偿 SW 休眠期漏收的分组删除事件,
  //    否则侧边栏残留空任务);仍有标签的只解除分组引用、保留任务。
  const liveGroupIds = new Set((await chrome.tabGroups.query({})).map((g) => g.id));
  const { contexts } = await repo.getSnapshot();
  for (const c of contexts) {
    if (c.nativeGroupId != null && !liveGroupIds.has(c.nativeGroupId)) {
      if (c.id !== INBOX_ID && c.status === 'active' && c.tabOrder.length === 0) {
        await repo.deleteContext(c.id, now);
      } else {
        await repo.setNativeGroupId(c.id, undefined);
      }
    }
  }

  // 2) 每个活跃标签的归属对齐其原生分组
  const liveTabs = await chrome.tabs.query({});
  for (const tab of liveTabs) {
    if (tab.id == null) continue;
    const record = await repo.getTabByChromeId(tab.id);
    if (!record) continue;
    const gid = tab.groupId ?? NONE;
    let target: string;
    if (gid === NONE || gid == null) {
      target = INBOX_ID;
    } else {
      const ctx = (await repo.findContextByNativeGroupId(gid)) ?? (await adoptGroup(repo, gid, now));
      target = ctx.id;
    }
    if (record.contextId !== target) await repo.moveTab(record.id, target, now);
  }
  onChange();
}
