import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { INBOX_ID, type Context, type TabRecord } from '@/shared/types';
import type { Event } from '@/shared/messaging';
import { redundantIds } from '@/shared/dedup';
import { buildPortMap, localhostPort, suggestProjectName } from '@/shared/localhost';
import { usePanelStore, dispatch } from './store';
import { StatsBar } from './components/StatsBar';
import { ContextGroup } from './components/ContextGroup';
import { SearchOverlay } from './components/SearchOverlay';
import { UndoToast } from './components/UndoToast';
import { PortBindSuggestions } from './components/PortBindSuggestions';
import { EmptyState } from './components/EmptyState';

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
  const undo = usePanelStore((s) => s.undo);
  const searchOpen = usePanelStore((s) => s.searchOpen);
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
  const activeOrderRef = useRef('');

  // 订阅 SW 广播 + 首屏拉取 + ⌘⇧K 挂载态
  useEffect(() => {
    const listener = (msg: unknown) => {
      const ev = msg as Event;
      if (ev?.type === 'STATE_SNAPSHOT') {
        const sig = activeOrderSig(ev.contexts);
        const orderChanged = activeOrderRef.current !== '' && sig !== activeOrderRef.current;
        activeOrderRef.current = sig;
        const apply = () => applySnapshot(ev.contexts, ev.tabs, ev.portMappings);
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

  const tabsOf = (ctx: Context): TabRecord[] =>
    ctx.tabOrder.map((id) => tabsById.get(id)).filter((t): t is TabRecord => t != null);

  const inbox = contexts.find((c) => c.id === INBOX_ID);
  const activeContexts = contexts
    .filter((c) => c.status === 'active' && c.id !== INBOX_ID)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  const archivedContexts = contexts
    .filter((c) => c.status === 'archived')
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  const openTabCount = tabs.filter((t) => t.chromeTabId != null).length;
  const archivedTabCount = archivedContexts.reduce((n, c) => n + c.tabOrder.length, 0);
  // 完全空:无标签、无命名簇、无归档 → 展示空状态插画
  const isEmpty = tabs.length === 0 && activeContexts.length === 0 && archivedContexts.length === 0;
  const duplicateIds = useMemo(() => redundantIds(tabs), [tabs]);
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

  // ---- 命令 ----
  const archive = async (contextId: string) => {
    const ev = await dispatch({ type: 'ARCHIVE_CONTEXT', contextId });
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
  const doUndo = async () => {
    if (undo) await dispatch({ type: 'UNDO', token: undo.token });
    clearUndo();
  };

  const groupProps = (ctx: Context) => ({
    context: ctx,
    tabs: tabsOf(ctx),
    duplicateIds,
    portMap,
    viewTransitionName: `ctx-${ctx.id}`,
    editing: editingId === ctx.id,
    onStartEdit: () => setEditingId(ctx.id),
    onCommitName: (name: string) => commitName(ctx, name),
    onCancelEdit: () => cancelEdit(ctx),
    onArchive: () => archive(ctx.id),
    onRestore: () => restore(ctx.id),
    onDelete: () => del(ctx.id),
    onDropTab: (tabId: string) => moveTab(tabId, ctx.id),
    onActivateTab: (tabId: string) => activate(tabId),
    onCloseTab: (tabId: string) => closeTab(tabId),
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
      </header>

      <StatsBar
        openTabs={openTabCount}
        activeContexts={activeContexts.length}
        redundant={duplicateIds.size}
        onMerge={mergeDuplicates}
      />

      <PortBindSuggestions suggestions={portSuggestions} onBind={bindPort} onIgnore={ignorePort} />

      {/* 主列表 */}
      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {isEmpty && <EmptyState onNew={createContext} />}
        {activeContexts.map((c) => (
          <ContextGroup key={c.id} variant="active" {...groupProps(c)} />
        ))}

        {!isEmpty && inbox && <ContextGroup key={inbox.id} variant="inbox" {...groupProps(inbox)} />}

        {archivedContexts.length > 0 && (
          <div className="mt-3 pt-2 border-t border-black/10 dark:border-white/10">
            <div className="px-2 pb-1 text-[11px] uppercase tracking-wide opacity-40">已归档</div>
            {archivedContexts.map((c) => (
              <ContextGroup key={c.id} variant="archived" {...groupProps(c)} />
            ))}
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <footer className="px-3 py-1.5 text-[11px] opacity-50 hairline border-t border-black/10 dark:border-white/10">
        归档 <span className="font-mono">{archivedContexts.length}</span> 任务 ·{' '}
        <span className="font-mono">{archivedTabCount}</span> 标签
      </footer>

      {undo && (
        <UndoToast
          label="已收纳"
          ttlMs={undo.ttlMs}
          onUndo={doUndo}
          onDismiss={clearUndo}
        />
      )}

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
