// chrome.tabs.* → TabRecord 增删改(见设计文档 §4)。
// SW 是唯一写入方。收纳/恢复/分组操作期间用 sync-lock 抑制自身触发的事件回灌。

import type { Repository } from '../store/repositories';
import { INBOX_ID, type TabRecord } from '@/shared/types';
import { isSyncPaused } from './sync-lock';
import { handleTabGroupChange, ensureTabInContextGroup } from './group-sync';
import { resolveNewTabContext } from './clustering';
import type { Penalties } from '../clustering/rules';

type OnChange = () => void;
type GetPenalties = () => Penalties;
type GetAutoCluster = () => boolean;

/** 一个 chrome.Tab 是否值得记录(跳过无 url 的空白页/内部页)。 */
function isTrackable(tab: chrome.tabs.Tab): boolean {
  const url = tab.url || tab.pendingUrl || '';
  if (!url) return false;
  if (url.startsWith('chrome://newtab') || url === 'about:blank') return false;
  return true;
}

function tabTitle(tab: chrome.tabs.Tab): string {
  return tab.title?.trim() || tab.url || tab.pendingUrl || '(无标题)';
}

/** 依据原生分组归属决定新标签落入哪个 Context(未分组 → 未分类)。 */
async function contextIdForGroup(repo: Repository, groupId?: number): Promise<string> {
  if (groupId != null && groupId >= 0) {
    const ctx = await repo.findContextByNativeGroupId(groupId);
    if (ctx) return ctx.id;
  }
  return INBOX_ID;
}

export function registerTabListeners(
  repo: Repository,
  onChange: OnChange,
  getPenalties: GetPenalties = () => ({}),
  getAutoCluster: GetAutoCluster = () => true,
): void {
  chrome.tabs.onCreated.addListener(async (tab) => {
    if (isSyncPaused() || tab.id == null) return;
    if (!isTrackable(tab)) return;
    if (await repo.getTabByChromeId(tab.id)) return; // 幂等
    const now = Date.now();
    const url = tab.url || tab.pendingUrl || '';
    const openerRecordId =
      tab.openerTabId != null ? (await repo.getTabByChromeId(tab.openerTabId))?.id : undefined;

    // 原生分组归属优先(F-06);否则(自动聚簇开启时)用引擎打分(F-07)
    const autoCluster = getAutoCluster();
    let contextId = await contextIdForGroup(repo, tab.groupId);
    if (contextId === INBOX_ID && autoCluster) {
      contextId = await resolveNewTabContext(repo, getPenalties(), { url, openerRecordId, now });
    }

    await repo.addTab(
      {
        chromeTabId: tab.id,
        windowId: tab.windowId,
        contextId,
        url,
        title: tabTitle(tab),
        faviconUrl: tab.favIconUrl,
        openerRecordId,
        firstOpenedAt: now,
        lastActiveAt: now,
      },
      now,
    );

    if (contextId !== INBOX_ID) {
      await ensureTabInContextGroup(repo, contextId, tab.id); // 引擎归入命名簇 → 同步进原生分组
    }
    // 注:不再自动升格未分类里的 opener 树成新任务 —— 成组一律走「同站归类建议」由用户确认。
    onChange();
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (isSyncPaused()) return;

    // 原生 UI 把标签拖进/出分组
    if (changeInfo.groupId !== undefined) {
      await handleTabGroupChange(repo, tabId, changeInfo.groupId, tab, onChange);
    }

    const record = await repo.getTabByChromeId(tabId);
    if (!record) {
      if (isTrackable(tab)) {
        // 防御:仅为确实仍存在的标签补建记录,避免为正在关闭的标签回填幻影
        try {
          await chrome.tabs.get(tabId);
        } catch {
          return;
        }
        const now = Date.now();
        await repo.addTab(
          {
            chromeTabId: tabId,
            windowId: tab.windowId,
            contextId: await contextIdForGroup(repo, tab.groupId),
            url: tab.url || '',
            title: tabTitle(tab),
            faviconUrl: tab.favIconUrl,
            firstOpenedAt: now,
            lastActiveAt: now,
          },
          now,
        );
        onChange();
      }
      return;
    }
    if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl) {
      await repo.updateTab(record.id, {
        url: tab.url ?? record.url,
        title: tabTitle(tab),
        faviconUrl: tab.favIconUrl ?? record.faviconUrl,
      });
      onChange();
    }
    // 挂起状态变化(我方扫描或 Chrome 自身内存回收都会触发)→ 回填 discarded
    if (changeInfo.discarded !== undefined) {
      await repo.updateTab(record.id, { discarded: changeInfo.discarded });
      onChange();
    }
  });

  chrome.tabs.onActivated.addListener(async (info) => {
    if (isSyncPaused()) return;
    const record = await repo.getTabByChromeId(info.tabId);
    if (record) {
      await repo.touchTab(record.id, Date.now());
      onChange();
    }
  });

  chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (isSyncPaused()) return;
    // 收纳已把 chromeTabId 清空,此处按 chromeTabId 找不到记录 → 自然 no-op(区别于归档)
    await repo.removeTabByChromeId(tabId);
    onChange();
  });

  // Chrome 替换标签(discard/预渲染换 id)→ 回填新 id,避免记录 chromeTabId 变陈旧
  // 导致后续关闭/激活匹配不上而残留(见 sync.integration.test)。
  chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
    if (isSyncPaused()) return;
    const record = await repo.getTabByChromeId(removedTabId);
    if (record) {
      await repo.updateTab(record.id, { chromeTabId: addedTabId });
      onChange();
    }
  });
}

/**
 * 与 chrome.tabs.query 全量对账(见设计文档风险表)。
 * 在 hydrate/启动时执行,补偿 SW 休眠期间丢失的事件。
 */
export async function reconcile(
  repo: Repository,
  onChange: OnChange,
  opts?: { purge?: boolean },
): Promise<void> {
  const purge = opts?.purge !== false;
  const now = Date.now();
  const liveTabs = await chrome.tabs.query({});
  const liveById = new Map<number, chrome.tabs.Tab>();
  for (const t of liveTabs) if (t.id != null) liveById.set(t.id, t);

  const { tabs: records } = await repo.getSnapshot();

  // 存活记录(chromeTabId 仍在实时标签中);同 id 重复 → 清多余。死 id 收集起来待重绑。
  const recordByChromeId = new Map<number, TabRecord>();
  const deadRecords: TabRecord[] = [];
  for (const r of records) {
    if (r.chromeTabId == null) continue; // 归档标签,不动
    if (!liveById.has(r.chromeTabId)) {
      deadRecords.push(r);
      continue;
    }
    if (recordByChromeId.has(r.chromeTabId)) {
      await repo.removeTab(r.id); // 同一 chromeTabId 的重复记录 → 清多余,保留先出现的
    } else {
      recordByChromeId.set(r.chromeTabId, r);
    }
  }

  // 重绑趟:重启后 chromeTabId 全变 —— 死记录按 url 找未占用的同 URL 实时标签,回填新 id(元数据保留)
  const stillDead: TabRecord[] = [];
  for (const rec of deadRecords) {
    let matchedId: number | undefined;
    for (const [id, tab] of liveById) {
      if (recordByChromeId.has(id)) continue; // 已被占用
      if (!isTrackable(tab)) continue;
      if ((tab.url || tab.pendingUrl || '') === rec.url) {
        matchedId = id;
        break;
      }
    }
    if (matchedId != null) {
      const tab = liveById.get(matchedId)!;
      await repo.updateTab(rec.id, { chromeTabId: matchedId, windowId: tab.windowId });
      recordByChromeId.set(matchedId, rec);
    } else {
      stillDead.push(rec);
    }
  }

  // 清删趟:重绑不上的死记录 → 仅在 purge 且实时标签非空时删。
  // 空集保护:调用方显式传 opts(重启恢复场景)且实时无标签但库有记录 = 会话恢复尚未就绪,
  // 跳过清删,留给之后的对账。不传 opts 为常规 SW 唤醒对账,不启用保护。
  const restoreIncomplete = opts !== undefined && liveTabs.length === 0 && records.some((r) => r.chromeTabId != null);
  if (purge && !restoreIncomplete) {
    for (const rec of stillDead) await repo.removeTab(rec.id);
  }

  // 补建 / 校正:遍历真实标签 —— 未占用则补建,已有记录则校正 url/title/favicon(仅有变化才写)
  for (const [chromeId, tab] of liveById) {
    if (!isTrackable(tab)) continue;
    const rec = recordByChromeId.get(chromeId);
    if (rec) {
      const url = tab.url || tab.pendingUrl || '';
      const title = tabTitle(tab);
      const faviconUrl = tab.favIconUrl;
      if (rec.url !== url || rec.title !== title || rec.faviconUrl !== faviconUrl) {
        await repo.updateTab(rec.id, { url, title, faviconUrl });
      }
    } else {
      await repo.addTab(
        {
          chromeTabId: chromeId,
          windowId: tab.windowId,
          contextId: await contextIdForGroup(repo, tab.groupId),
          url: tab.url || tab.pendingUrl || '',
          title: tabTitle(tab),
          faviconUrl: tab.favIconUrl,
          firstOpenedAt: now,
          lastActiveAt: now,
        },
        now,
      );
    }
  }
  onChange();
}
