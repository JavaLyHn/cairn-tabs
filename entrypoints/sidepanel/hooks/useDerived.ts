import { useMemo } from 'react';
import {
  INBOX_ID,
  type Context,
  type TabRecord,
  type Flags,
  type PortMapping,
} from '@/shared/types';
import { duplicateMarks, redundantCount } from '@/shared/dedup';
import { buildPortMap, localhostPort, suggestProjectName } from '@/shared/localhost';
import { sameDomainSuggestions } from '@/core/clustering/engine';
import { staleTabs } from '@/shared/stale';

export function useDerived(args: {
  contexts: Context[];
  tabs: TabRecord[];
  flags: Flags;
  portMappings: PortMapping[];
  now: number;
  ignoredPorts: Set<number>;
  ignoredDomains: Set<string>;
}): {
  tabsById: Map<string, TabRecord>;
  staleRecords: TabRecord[];
  staleIds: Set<string>;
  tabsOf: (ctx: Context) => TabRecord[];
  inbox: Context | undefined;
  activeContexts: Context[];
  archivedContexts: Context[];
  starredTabs: TabRecord[];
  openTabCount: number;
  archivedTabCount: number;
  isEmpty: boolean;
  dupMarks: ReturnType<typeof duplicateMarks>;
  redundant: number;
  portMap: Record<number, string>;
  portSuggestions: { port: number; name: string }[];
  domainSuggestions: ReturnType<typeof sameDomainSuggestions>;
} {
  const { contexts, tabs, flags, portMappings, now, ignoredPorts, ignoredDomains } = args;

  const tabsById = useMemo(() => {
    const m = new Map<string, TabRecord>();
    for (const t of tabs) m.set(t.id, t);
    return m;
  }, [tabs]);

  // 陈旧标签(开启提示时):从各任务里「抽出」集中到底部下沉簇,单处呈现避免重复
  const staleRecords = useMemo(
    () => (flags.staleHints ? staleTabs(tabs, now, flags.staleDays) : []),
    [tabs, flags.staleHints, flags.staleDays, now],
  );
  const staleIds = useMemo(() => new Set(staleRecords.map((t) => t.id)), [staleRecords]);

  const tabsOf = (ctx: Context): TabRecord[] =>
    ctx.tabOrder
      .map((id) => tabsById.get(id))
      .filter(
        (t): t is TabRecord => t != null && (ctx.status === 'archived' || !staleIds.has(t.id)),
      )
      // 重点标签浮到组顶(稳定排序,保留组内原有相对顺序)
      .sort((a, b) => (a.starred ? 0 : 1) - (b.starred ? 0 : 1));

  const inbox = contexts.find((c) => c.id === INBOX_ID);
  const activeContexts = contexts
    .filter((c) => c.status === 'active' && c.id !== INBOX_ID)
    .toSorted((a, b) => b.lastActiveAt - a.lastActiveAt);
  const archivedContexts = contexts
    .filter((c) => c.status === 'archived')
    .toSorted((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  const starredTabs = useMemo(() => tabs.filter((t) => t.starred && t.chromeTabId != null), [tabs]);

  const openTabCount = tabs.filter((t) => t.chromeTabId != null).length;
  const archivedTabCount = archivedContexts.reduce((n, c) => n + c.tabOrder.length, 0);
  // 完全空:无标签、无命名簇、无归档 → 展示空状态插画
  const isEmpty = tabs.length === 0 && activeContexts.length === 0 && archivedContexts.length === 0;
  const dupMarks = useMemo(() => duplicateMarks(tabs), [tabs]);
  const redundant = useMemo(() => redundantCount(tabs), [tabs]);
  const portMap = useMemo(() => buildPortMap(portMappings), [portMappings]);
  // 打开中、未绑定、未忽略的 localhost 端口 → 建议绑定(每端口取首个标签标题做建议名)
  const portSuggestions = useMemo(() => {
    const byPort = new Map<number, string>();
    for (const t of tabs) {
      if (t.chromeTabId == null) continue;
      const p = localhostPort(t.url);
      if (p == null || portMap[p] != null || ignoredPorts.has(p) || byPort.has(p)) continue;
      byPort.set(p, suggestProjectName(t.title, p));
    }
    return [...byPort.entries()].map(([port, name]) => ({ port, name }));
  }, [tabs, portMap, ignoredPorts]);

  // 同域升格建议(F-07):自动聚簇开启时,未分类里同域标签够阈值 → 建议成簇(去掉已忽略的域)
  const domainSuggestions = useMemo(() => {
    if (!flags.autoCluster) return [];
    const looseTabs = tabs.filter((t) => t.contextId === INBOX_ID);
    const names = new Set(
      contexts.filter((c) => c.status === 'active' && c.id !== INBOX_ID).map((c) => c.name),
    );
    return sameDomainSuggestions(looseTabs, names, flags.sameDomainPromoteSize).filter(
      (s) => !ignoredDomains.has(s.domain),
    );
  }, [tabs, contexts, flags.autoCluster, flags.sameDomainPromoteSize, ignoredDomains]);

  return {
    tabsById,
    staleRecords,
    staleIds,
    tabsOf,
    inbox,
    activeContexts,
    archivedContexts,
    starredTabs,
    openTabCount,
    archivedTabCount,
    isEmpty,
    dupMarks,
    redundant,
    portMap,
    portSuggestions,
    domainSuggestions,
  };
}
