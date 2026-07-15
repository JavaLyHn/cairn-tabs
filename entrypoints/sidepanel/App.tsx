import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { INBOX_ID, type Context, type TabRecord } from '@/shared/types';
import type { Event } from '@/shared/messaging';
import { AIPlanDialog } from './components/AIPlanDialog';
import type { AIPlan } from '@/shared/ai';
import type { AIProviderId } from '@/shared/ai';
import { permissionOriginFor } from '@/core/ai/provider';
import { duplicateMarks, redundantCount } from '@/shared/dedup';
import { buildPortMap, localhostPort, suggestProjectName } from '@/shared/localhost';
import { sameDomainSuggestions } from '@/core/clustering/engine';
import { staleTabs } from '@/shared/stale';
import { formatReclaimed } from '@/shared/discard';
import { exportAllJSON } from '@/shared/export';
import { usePanelStore, dispatch } from './store';
import { StatsBar } from './components/StatsBar';
import { ContextGroup } from './components/ContextGroup';
import { StaleGroup } from './components/StaleGroup';
import { StarredSection } from './components/StarredSection';
import { SearchOverlay } from './components/SearchOverlay';
import { UndoToast } from './components/UndoToast';
import { PortBindSuggestions } from './components/PortBindSuggestions';
import { DomainPromoteSuggestions } from './components/DomainPromoteSuggestions';
import { EmptyState } from './components/EmptyState';
import { SettingsPanel } from './components/SettingsPanel';
import { ExportDialog } from './components/ExportDialog';
import { downloadText } from './util';

/** 活跃任务的排序签名(用于判断顺序是否变化,决定是否播放过渡)。 */
function activeOrderSig(contexts: Context[]): string {
  return contexts
    .filter((c) => c.status === 'active' && c.id !== INBOX_ID)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    .map((c) => c.id)
    .join(',');
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function App() {
  const contexts = usePanelStore((s) => s.contexts);
  const tabs = usePanelStore((s) => s.tabs);
  const portMappings = usePanelStore((s) => s.portMappings);
  const flags = usePanelStore((s) => s.flags);
  const discardedBytes = usePanelStore((s) => s.discardedBytes);
  const undo = usePanelStore((s) => s.undo);
  const searchOpen = usePanelStore((s) => s.searchOpen);
  const ai = usePanelStore((s) => s.ai);
  const applySnapshot = usePanelStore((s) => s.applySnapshot);
  const setUndo = usePanelStore((s) => s.setUndo);
  const clearUndo = usePanelStore((s) => s.clearUndo);
  const openSearch = usePanelStore((s) => s.openSearch);
  const closeSearch = usePanelStore((s) => s.closeSearch);

  // 正在改名的簇 id(受控:新建后自动进入、双击或点「改名」进入)
  const [editingId, setEditingId] = useState<string | null>(null);
  // 刚新建、尚未确认的草稿簇 id(未命名且无标签时被放弃则删除)
  const [draftId, setDraftId] = useState<string | null>(null);
  // 本次会话内被忽略的端口建议
  const [ignoredPorts, setIgnoredPorts] = useState<Set<number>>(new Set());
  // 本次会话内被忽略的同域升格建议
  const [ignoredDomains, setIgnoredDomains] = useState<Set<string>>(new Set());
  const activeOrderRef = useRef('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<{ id: string; at: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1800);
  };

  const [aiPlan, setAiPlan] = useState<{ plan: AIPlan; tabs: TabRecord[] } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const aiOrganize = async () => {
    if (aiBusy) return;
    setAiBusy(true); // 持久「分析中」指示见下方 pill(AI 调用可能超过 flash 的 1.8s)
    const ev = await dispatch({ type: 'AI_ORGANIZE_INBOX' });
    setAiBusy(false);
    if (ev?.type === 'AI_PLAN') setAiPlan({ plan: ev.plan, tabs: ev.tabs });
    else if (ev?.type === 'AI_ERROR') {
      const msg: Record<string, string> = {
        no_key: '请先在设置里填 AI API key',
        permission: '未授权访问 API 域名',
        network: 'AI 调用失败,请稍后重试',
        parse: 'AI 没能给出可用的分组建议,已保持原样',
        empty: '未分类里没有可整理的标签',
        cancelled: '已取消 AI 整理',
      };
      showFlash(msg[ev.reason] ?? 'AI 调用失败');
    }
  };
  const applyAiPlan = (plan: AIPlan) => {
    dispatch({ type: 'APPLY_AI_PLAN', plan });
    setAiPlan(null);
    showFlash('已应用 AI 整理');
  };
  const aiSuggestName = async (contextId: string): Promise<string | null> => {
    try {
      const ev = await dispatch({ type: 'AI_SUGGEST_NAME', contextId });
      if (ev?.type === 'AI_NAME') return ev.name;
      if (ev?.type === 'AI_ERROR') {
        const msg: Record<string, string> = {
          no_key: '请先在设置里填 AI API key',
          empty: '这个任务里没有标签可参考',
          network: 'AI 调用失败,请稍后重试',
          parse: 'AI 没给出可用的名字',
          permission: '未授权访问 API 域名',
          cancelled: '已取消',
        };
        showFlash(msg[ev.reason] ?? 'AI 调用失败');
      }
    } catch {
      showFlash('AI 调用失败,请稍后重试'); // 如 SW 未就绪导致 sendMessage 失败
    }
    return null;
  };

  // 订阅 SW 广播 + 首屏拉取 + ⌘⇧K 挂载态
  useEffect(() => {
    const listener = (msg: unknown) => {
      const ev = msg as Event;
      if (ev?.type === 'STATE_SNAPSHOT') {
        const sig = activeOrderSig(ev.contexts);
        const orderChanged = activeOrderRef.current !== '' && sig !== activeOrderRef.current;
        activeOrderRef.current = sig;
        const apply = () =>
          applySnapshot(ev.contexts, ev.tabs, ev.portMappings, ev.flags, ev.discardedBytes, ev.ai);
        // 仅当任务顺序变化时播放视图过渡(任务被激活会上移到顶部),让重排平滑
        const startVT = (document as Document & {
          startViewTransition?: (cb: () => void) => unknown;
        }).startViewTransition;
        if (orderChanged && startVT && !prefersReducedMotion()) {
          startVT.call(document, () => flushSync(apply));
        } else {
          apply();
        }
      } else if (ev?.type === 'OPEN_SEARCH') openSearch();
    };
    chrome.runtime.onMessage.addListener(listener);
    void dispatch({ type: 'REQUEST_SNAPSHOT' });
    void chrome.storage.session.get('pendingSearch').then((r) => {
      if (r.pendingSearch) {
        openSearch();
        void chrome.storage.session.remove('pendingSearch');
      }
    });
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [applySnapshot, openSearch]);

  // 面板重新可见/聚焦时拉一次最新快照,自愈任何漏收的广播(保证「及时更新」)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void dispatch({ type: 'REQUEST_SNAPSHOT' });
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // 面板聚焦时本地兜底 ⌘⇧K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  const tabsById = useMemo(() => {
    const m = new Map<string, TabRecord>();
    for (const t of tabs) m.set(t.id, t);
    return m;
  }, [tabs]);

  const now = Date.now();
  // 陈旧标签(开启提示时):从各任务里「抽出」集中到底部下沉簇,单处呈现避免重复
  const staleRecords = useMemo(
    () => (flags.staleHints ? staleTabs(tabs, now, flags.staleDays) : []),
    [tabs, flags.staleHints, flags.staleDays, now],
  );
  const staleIds = useMemo(() => new Set(staleRecords.map((t) => t.id)), [staleRecords]);

  const tabsOf = (ctx: Context): TabRecord[] =>
    ctx.tabOrder
      .map((id) => tabsById.get(id))
      .filter((t): t is TabRecord => t != null && (ctx.status === 'archived' || !staleIds.has(t.id)))
      // 重点标签浮到组顶(稳定排序,保留组内原有相对顺序)
      .sort((a, b) => (a.starred ? 0 : 1) - (b.starred ? 0 : 1));

  const inbox = contexts.find((c) => c.id === INBOX_ID);
  const activeContexts = contexts
    .filter((c) => c.status === 'active' && c.id !== INBOX_ID)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  const archivedContexts = contexts
    .filter((c) => c.status === 'archived')
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  const starredTabs = useMemo(
    () => tabs.filter((t) => t.starred && t.chromeTabId != null),
    [tabs],
  );

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

  // ---- 命令 ----
  const archive = async (contextId: string) => {
    const ev = await dispatch({ type: 'ARCHIVE_CONTEXT', contextId });
    if (ev?.type === 'UNDOABLE') setUndo({ action: ev.action, token: ev.token, ttlMs: ev.ttlMs });
  };
  const archiveInbox = async () => {
    const ev = await dispatch({ type: 'ARCHIVE_INBOX' });
    if (ev?.type === 'UNDOABLE') setUndo({ action: ev.action, token: ev.token, ttlMs: ev.ttlMs });
  };
  const restore = (contextId: string) => dispatch({ type: 'RESTORE_CONTEXT', contextId });
  const rename = (contextId: string, name: string) =>
    dispatch({ type: 'RENAME_CONTEXT', contextId, name });
  const del = (contextId: string) => dispatch({ type: 'DELETE_CONTEXT', contextId });
  const moveTab = (tabRecordId: string, toContextId: string) =>
    dispatch({ type: 'MOVE_TAB', tabRecordId, toContextId });
  const activate = (tabRecordId: string) => dispatch({ type: 'ACTIVATE_TAB', tabRecordId });
  const closeTab = (tabRecordId: string) => dispatch({ type: 'CLOSE_TAB', tabRecordId });
  const createContext = async () => {
    // 至多一个「新任务」草稿:SW 复用已存在的,返回其 id;新建后直接进入改名
    const ev = await dispatch({ type: 'CREATE_CONTEXT', name: '新任务' });
    if (ev?.type === 'CONTEXT_CREATED') {
      setDraftId(ev.contextId);
      setEditingId(ev.contextId);
    }
  };

  /** 结束改名:命名有效则保留改名;若是被放弃的空草稿则删除。 */
  const commitName = (c: Context, value: string) => {
    const name = value.trim();
    const meaningful = name !== '' && name !== '新任务';
    if (meaningful) {
      rename(c.id, name);
      if (draftId === c.id) setDraftId(null); // 已确认,不再是草稿
    } else if (draftId === c.id && c.tabOrder.length === 0) {
      del(c.id); // 空草稿未命名 → 放弃删除
      setDraftId(null);
    }
    setEditingId(null);
  };

  /** Esc 取消:空草稿直接删除,否则仅退出编辑。 */
  const cancelEdit = (c: Context) => {
    if (draftId === c.id && c.tabOrder.length === 0) {
      del(c.id);
      setDraftId(null);
    }
    setEditingId(null);
  };
  const mergeDuplicates = () => dispatch({ type: 'MERGE_DUPLICATES' });
  const bindPort = (port: number, project: string) => {
    if (project.trim()) dispatch({ type: 'SET_PORT_MAPPING', port, project });
  };
  const ignorePort = (port: number) => setIgnoredPorts((s) => new Set(s).add(port));
  const promoteDomain = (domain: string, tabIds: string[]) =>
    dispatch({ type: 'PROMOTE_SAME_DOMAIN', domain, tabIds });
  const ignoreDomain = (domain: string) => setIgnoredDomains((s) => new Set(s).add(domain));
  const toggleStar = (tabRecordId: string, starred: boolean) =>
    dispatch({ type: 'SET_TAB_STARRED', tabRecordId, starred });
  const setSameDomainSize = (size: number) =>
    dispatch({ type: 'SET_SAME_DOMAIN_PROMOTE_SIZE', size });
  const toggleAutoCluster = (enabled: boolean) => dispatch({ type: 'SET_AUTO_CLUSTER', enabled });
  const toggleStaleHints = (enabled: boolean) => dispatch({ type: 'SET_STALE_HINTS', enabled });
  const setStaleDays = (days: number) => dispatch({ type: 'SET_STALE_DAYS', days });
  const toggleAutoDiscard = (enabled: boolean) => dispatch({ type: 'SET_AUTO_DISCARD', enabled });
  const setDiscardAfterMinutes = (minutes: number) =>
    dispatch({ type: 'SET_DISCARD_AFTER_MINUTES', minutes });
  const toggleDiscardSkipsLocalhost = (enabled: boolean) =>
    dispatch({ type: 'SET_DISCARD_SKIP_LOCALHOST', enabled });
  const archiveStale = async () => {
    const ev = await dispatch({ type: 'ARCHIVE_STALE' });
    if (ev?.type === 'UNDOABLE') setUndo({ action: ev.action, token: ev.token, ttlMs: ev.ttlMs });
  };

  const exportAllData = () => {
    const json = exportAllJSON(contexts, tabs, Date.now());
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    downloadText(
      `cairn-tabs-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`,
      json,
      'application/json',
    );
    setSettingsOpen(false);
    showFlash('已导出全部数据 (JSON)');
  };
  const saveAi = async (
    provider: AIProviderId,
    key: string | undefined,
    model: string,
    baseUrl?: string,
  ) => {
    // custom 的授权域名由所填 baseUrl 的 origin 派生;官方两档用固定 host(见 permissionOriginFor)
    const origin = permissionOriginFor(provider, baseUrl);
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error('需要授权访问 API 域名');
    await dispatch({ type: 'SET_AI_SETTINGS', provider, key, model, baseUrl });
  };
  const testAi = async (): Promise<{ ok: boolean; detail: string }> => {
    const ev = await dispatch({ type: 'TEST_AI_CONNECTION' });
    if (ev?.type === 'AI_TEST_RESULT') return { ok: ev.ok, detail: ev.detail };
    return { ok: false, detail: '测试失败' };
  };

  const doUndo = async () => {
    if (undo) await dispatch({ type: 'UNDO', token: undo.token });
    clearUndo();
  };

  const groupProps = (ctx: Context) => ({
    context: ctx,
    tabs: tabsOf(ctx),
    dupMarks,
    portMap,
    viewTransitionName: `ctx-${ctx.id}`,
    editing: editingId === ctx.id,
    onStartEdit: () => setEditingId(ctx.id),
    onCommitName: (name: string) => commitName(ctx, name),
    onCancelEdit: () => cancelEdit(ctx),
    onArchive: () => archive(ctx.id),
    onArchiveAll: archiveInbox,
    onRestore: () => restore(ctx.id),
    onExport: () => setExportTarget({ id: ctx.id, at: Date.now() }),
    onDelete: () => del(ctx.id),
    onDropTab: (tabId: string) => moveTab(tabId, ctx.id),
    onActivateTab: (tabId: string) => activate(tabId),
    onCloseTab: (tabId: string) => closeTab(tabId),
    onToggleStar: toggleStar,
    aiEnabled: ai.hasKey,
    aiBusy,
    onAiOrganize: aiOrganize,
    onAiSuggestName: () => aiSuggestName(ctx.id),
    onAiCancel: () => dispatch({ type: 'CANCEL_AI' }),
  });

  return (
    <div className="relative flex flex-col h-full">
      {/* 头部:搜索入口 + 新建(不再重复 Chrome 侧边栏已显示的应用名) */}
      <header className="flex items-center gap-1.5 px-2 py-2 border-b border-black/10 dark:border-white/10">
        <button
          onClick={openSearch}
          className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left
                     bg-black/[0.05] dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10"
          title="搜索 (⌘⇧K)"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-55 shrink-0"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span className="flex-1 opacity-60">搜索标签…</span>
          <span className="font-mono text-[11px] opacity-45">⌘⇧K</span>
        </button>
        <button
          onClick={createContext}
          className="shrink-0 px-2 py-1.5 rounded-md text-[12px] opacity-70 hover:opacity-100
                     hover:bg-black/5 dark:hover:bg-white/10"
          title="新建任务"
        >
          + 新建
        </button>
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md opacity-60 hover:opacity-100
                     hover:bg-black/5 dark:hover:bg-white/10"
          title="设置"
          aria-label="设置"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      <StatsBar
        openTabs={openTabCount}
        activeContexts={activeContexts.length}
        stale={staleRecords.length}
        redundant={redundant}
        onMerge={mergeDuplicates}
      />

      <PortBindSuggestions suggestions={portSuggestions} onBind={bindPort} onIgnore={ignorePort} />

      <DomainPromoteSuggestions
        suggestions={domainSuggestions}
        onPromote={promoteDomain}
        onIgnore={ignoreDomain}
      />

      {/* 主列表 */}
      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {isEmpty && <EmptyState onNew={createContext} />}

        <StarredSection
          tabs={starredTabs}
          portMap={portMap}
          onActivateTab={activate}
          onCloseTab={closeTab}
          onToggleStar={toggleStar}
        />

        {activeContexts.map((c) => (
          <ContextGroup key={c.id} variant="active" {...groupProps(c)} />
        ))}

        {!isEmpty && inbox && <ContextGroup key={inbox.id} variant="inbox" {...groupProps(inbox)} />}

        {staleRecords.length > 0 && (
          <StaleGroup
            tabs={staleRecords}
            portMap={portMap}
            now={now}
            staleDays={flags.staleDays}
            onArchiveAll={archiveStale}
            onActivateTab={activate}
            onCloseTab={closeTab}
          />
        )}

        {archivedContexts.length > 0 && (
          <div className="mt-3 pt-2 border-t border-black/10 dark:border-white/10">
            <div className="px-2 pb-1 text-[11px] uppercase tracking-wide opacity-40">已归档</div>
            {archivedContexts.map((c) => (
              <ContextGroup key={c.id} variant="archived" {...groupProps(c)} />
            ))}
          </div>
        )}
      </div>

      {/* 底部状态栏:归档量 + 累计回收内存(F-11) */}
      <footer className="px-3 py-1.5 text-[11px] opacity-50 hairline border-t border-black/10 dark:border-white/10">
        归档 <span className="font-mono">{archivedContexts.length}</span> 任务 ·{' '}
        <span className="font-mono">{archivedTabCount}</span> 标签
        {discardedBytes > 0 && (
          <>
            {' · '}回收 <span className="font-mono">{formatReclaimed(discardedBytes)}</span>
            <span className="ml-1 opacity-70">估算</span>
          </>
        )}
      </footer>

      {undo && (
        <UndoToast
          label="已归档"
          ttlMs={undo.ttlMs}
          onUndo={doUndo}
          onDismiss={clearUndo}
        />
      )}

      {flash && (
        <div
          className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg text-[12px] shadow-lg
                     bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          {flash}
        </div>
      )}

      {aiBusy && !flash && (
        <div
          className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg text-[12px] shadow-lg
                     inline-flex items-center gap-2 bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
          ✦ AI 分析中…
          <button
            type="button"
            onClick={() => dispatch({ type: 'CANCEL_AI' })}
            aria-label="取消 AI 整理"
            className="ml-1 px-1.5 py-0.5 rounded text-[11px] underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            取消
          </button>
        </div>
      )}

      {aiPlan && (
        <AIPlanDialog
          plan={aiPlan.plan}
          tabs={aiPlan.tabs}
          taskNames={Object.fromEntries(contexts.map((c) => [c.id, c.name]))}
          onApply={applyAiPlan}
          onClose={() => setAiPlan(null)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          flags={flags}
          ai={ai}
          onSaveAi={saveAi}
          onTestAi={testAi}
          onToggleAutoCluster={toggleAutoCluster}
          onSetSameDomainSize={setSameDomainSize}
          onToggleStaleHints={toggleStaleHints}
          onSetStaleDays={setStaleDays}
          onToggleAutoDiscard={toggleAutoDiscard}
          onSetDiscardAfterMinutes={setDiscardAfterMinutes}
          onToggleDiscardSkipsLocalhost={toggleDiscardSkipsLocalhost}
          onExportAll={exportAllData}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {(() => {
        const ctx = exportTarget ? contexts.find((c) => c.id === exportTarget.id) : null;
        return ctx && exportTarget ? (
          <ExportDialog
            context={ctx}
            tabs={tabsOf(ctx)}
            exportedAt={exportTarget.at}
            onFlash={showFlash}
            onClose={() => setExportTarget(null)}
          />
        ) : null;
      })()}

      {searchOpen && (
        <SearchOverlay
          onClose={closeSearch}
          onActivate={(id) => activate(id)}
          onRestoreContext={(id) => restore(id)}
        />
      )}
    </div>
  );
}
