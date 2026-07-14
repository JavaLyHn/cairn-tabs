import { useEffect, useMemo, useState } from 'react';
import { INBOX_ID, type Context, type TabRecord } from '@/shared/types';
import type { Event } from '@/shared/messaging';
import { redundantIds } from '@/shared/dedup';
import { usePanelStore, dispatch } from './store';
import { StatsBar } from './components/StatsBar';
import { ContextGroup } from './components/ContextGroup';
import { SearchOverlay } from './components/SearchOverlay';
import { UndoToast } from './components/UndoToast';

export default function App() {
  const contexts = usePanelStore((s) => s.contexts);
  const tabs = usePanelStore((s) => s.tabs);
  const undo = usePanelStore((s) => s.undo);
  const searchOpen = usePanelStore((s) => s.searchOpen);
  const applySnapshot = usePanelStore((s) => s.applySnapshot);
  const setUndo = usePanelStore((s) => s.setUndo);
  const clearUndo = usePanelStore((s) => s.clearUndo);
  const openSearch = usePanelStore((s) => s.openSearch);
  const closeSearch = usePanelStore((s) => s.closeSearch);

  // 正在改名的簇 id(受控:新建后自动进入、双击或点「改名」进入)
  const [editingId, setEditingId] = useState<string | null>(null);

  // 订阅 SW 广播 + 首屏拉取 + ⌘⇧K 挂载态
  useEffect(() => {
    const listener = (msg: unknown) => {
      const ev = msg as Event;
      if (ev?.type === 'STATE_SNAPSHOT') applySnapshot(ev.contexts, ev.tabs);
      else if (ev?.type === 'OPEN_SEARCH') openSearch();
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
  const duplicateIds = useMemo(() => redundantIds(tabs), [tabs]);

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
    if (ev?.type === 'CONTEXT_CREATED') setEditingId(ev.contextId);
  };
  const mergeDuplicates = () => dispatch({ type: 'MERGE_DUPLICATES' });
  const doUndo = async () => {
    if (undo) await dispatch({ type: 'UNDO', token: undo.token });
    clearUndo();
  };

  const groupProps = (ctx: Context) => ({
    context: ctx,
    tabs: tabsOf(ctx),
    duplicateIds,
    editing: editingId === ctx.id,
    onStartEdit: () => setEditingId(ctx.id),
    onEndEdit: () => setEditingId((cur) => (cur === ctx.id ? null : cur)),
    onArchive: () => archive(ctx.id),
    onRestore: () => restore(ctx.id),
    onRename: (name: string) => rename(ctx.id, name),
    onDelete: () => del(ctx.id),
    onDropTab: (tabId: string) => moveTab(tabId, ctx.id),
    onActivateTab: (tabId: string) => activate(tabId),
    onCloseTab: (tabId: string) => closeTab(tabId),
  });

  return (
    <div className="relative flex flex-col h-full">
      {/* 头部 */}
      <header className="flex items-center gap-2 px-3 py-2 hairline border-b border-black/10 dark:border-white/10">
        <span className="font-semibold flex-1">Cairn Tabs</span>
        <button
          onClick={createContext}
          className="text-[12px] opacity-60 hover:opacity-100"
          title="新建上下文"
        >
          + 新建
        </button>
        <button
          onClick={openSearch}
          className="text-[12px] opacity-60 hover:opacity-100 font-mono"
          title="搜索 (⌘⇧K)"
        >
          ⌘⇧K
        </button>
      </header>

      <StatsBar
        openTabs={openTabCount}
        activeContexts={activeContexts.length}
        redundant={duplicateIds.size}
        onMerge={mergeDuplicates}
      />

      {/* 主列表 */}
      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {activeContexts.map((c) => (
          <ContextGroup key={c.id} variant="active" {...groupProps(c)} />
        ))}

        {inbox && <ContextGroup key={inbox.id} variant="inbox" {...groupProps(inbox)} />}

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
        归档 <span className="font-mono">{archivedContexts.length}</span> 簇 ·{' '}
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
