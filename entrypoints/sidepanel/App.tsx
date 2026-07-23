import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { INBOX_ID, type Context } from '@/shared/types';
import type { Event } from '@/shared/messaging';
import { AIPlanDialog } from './components/AIPlanDialog';
import { formatReclaimed } from '@/shared/discard';
import { exportAllJSON } from '@/shared/export';
import { parseImport } from '@/shared/import';
import { usePanelStore, dispatch } from './store';
import { useFlash } from './hooks/useFlash';
import { useAiActions } from './hooks/useAiActions';
import { useDraftNaming } from './hooks/useDraftNaming';
import { useDerived } from './hooks/useDerived';
import { useUpdateNotice } from './hooks/useUpdateNotice';
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
import { Signature } from './components/Signature';
import { downloadText } from './util';
import { useT } from './i18n';

/** 活跃任务的排序签名(用于判断顺序是否变化,决定是否播放过渡)。 */
function activeOrderSig(contexts: Context[]): string {
  return contexts
    .filter((c) => c.status === 'active' && c.id !== INBOX_ID)
    .toSorted((a, b) => b.lastActiveAt - a.lastActiveAt)
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
  const toggleSearch = usePanelStore((s) => s.toggleSearch);
  // 同一次 ⌘⇧K 可能经多条通道到达(DOM keydown / 后台命令的 OPEN_SEARCH / 冷启动 pendingSearch),
  // 250ms 内只切换一次,避免"刚切换关掉又被另一条通道重开"。
  const lastSearchKeyAt = useRef(0);
  const toggleSearchOnce = useCallback(() => {
    const t = Date.now();
    if (t - lastSearchKeyAt.current < 250) return;
    lastSearchKeyAt.current = t;
    toggleSearch();
  }, [toggleSearch]);

  const { editingId, setEditingId, createContext, commitName, cancelEdit } = useDraftNaming();

  // 本次会话内被忽略的端口建议
  const [ignoredPorts, setIgnoredPorts] = useState<Set<number>>(new Set());
  // 本次会话内被忽略的同域升格建议
  const [ignoredDomains, setIgnoredDomains] = useState<Set<string>>(new Set());
  const activeOrderRef = useRef('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [allCollapsed, setAllCollapsed] = useState(false); // 一键折叠开关(false=展开)
  const [exportTarget, setExportTarget] = useState<{ id: string; at: number } | null>(null);
  const { flash, showFlash } = useFlash();
  const { t } = useT();

  // 更新感知:版本变化后首次打开面板,弹「已更新到 vX.Y.Z」(纯本地比对,不联网)
  useUpdateNotice((v) => showFlash(t('update.updated', { version: v })));

  const {
    aiBusy,
    aiPlan,
    setAiPlan,
    aiOrganize,
    aiOrganizeAll,
    applyAiPlan,
    unclearReasons,
    aiSuggestName,
    saveAi,
    testAi,
  } = useAiActions({ showFlash, setUndo });

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
        const startVT = (
          document as Document & {
            startViewTransition?: (cb: () => void) => {
              ready?: Promise<unknown>;
              finished?: Promise<unknown>;
            };
          }
        ).startViewTransition;
        // 仅在面板可见时播过渡:隐藏时启动会被中止,其 ready/finished 以
        // InvalidStateError(Transition was aborted…)拒绝;连续快照打断上一次过渡亦然。
        // 无论如何 DOM 都会更新(updateCallback 照常跑),这里只吞掉那些拒绝,避免 Uncaught (in promise)。
        if (
          orderChanged &&
          startVT &&
          !prefersReducedMotion() &&
          document.visibilityState === 'visible'
        ) {
          const vt = startVT.call(document, () => flushSync(apply));
          vt?.ready?.catch(() => {});
          vt?.finished?.catch(() => {});
        } else {
          apply();
        }
      } else if (ev?.type === 'OPEN_SEARCH') {
        // 后台快捷键命令走这条(登记了 ⌘⇧K 时 Chrome 拦截按键、DOM keydown 收不到)→ 切换,再按一次即关。
        toggleSearchOnce();
        // 已实时处理,清掉冷启动兜底标志,避免下次开面板残留导致误开搜索
        void chrome.storage.session.remove('pendingSearch');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    void dispatch({ type: 'REQUEST_SNAPSHOT' });
    void chrome.storage.session.get('pendingSearch').then((r) => {
      if (r.pendingSearch) {
        // 冷启动(面板刚被快捷键拉起):明确打开搜索;记时刻以便去重紧随其后的 OPEN_SEARCH
        lastSearchKeyAt.current = Date.now();
        openSearch();
        void chrome.storage.session.remove('pendingSearch');
      }
    });
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [applySnapshot, openSearch, toggleSearchOnce]);

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

  // 面板聚焦、且 ⌘⇧K 未登记为扩展命令时,按键会走到 DOM:本地切换搜索(登记了则走上面的 OPEN_SEARCH)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleSearchOnce();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSearchOnce]);

  // 陈旧按「天」判定,时间取到分钟即可 —— 让 staleRecords 的 useMemo 真正生效(每分钟至多重算一次)
  const now = Math.floor(Date.now() / 60_000) * 60_000;

  const {
    staleRecords,
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
  } = useDerived({ contexts, tabs, flags, portMappings, now, ignoredPorts, ignoredDomains });

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
  const del = (contextId: string) => dispatch({ type: 'DELETE_CONTEXT', contextId });
  const moveTab = (tabRecordId: string, toContextId: string) =>
    dispatch({ type: 'MOVE_TAB', tabRecordId, toContextId });
  const activate = (tabRecordId: string) => dispatch({ type: 'ACTIVATE_TAB', tabRecordId });
  const closeTab = (tabRecordId: string) => dispatch({ type: 'CLOSE_TAB', tabRecordId });
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
    showFlash(t('app.exportedAll'));
  };
  const doImport = async (file: File) => {
    const res = parseImport(await file.text());
    if (!res.ok) {
      showFlash(t(`import.error.${res.reason}`));
      return;
    }
    const ev = await dispatch({
      type: 'IMPORT_DATA',
      contexts: res.data.contexts,
      tabs: res.data.tabs,
    });
    setSettingsOpen(false);
    if (ev?.type === 'IMPORTED' && (ev.contexts > 0 || ev.tabs > 0)) {
      showFlash(t('import.done', { contexts: ev.contexts, tabs: ev.tabs }));
    } else {
      showFlash(t('import.nothing'));
    }
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
    onDropTab: async (tabId: string) => {
      // 拖进已归档任务时 SW 会归档该标签并返回 UNDOABLE;弹带任务名的撤销 toast
      const ev = await moveTab(tabId, ctx.id);
      if (ev?.type === 'UNDOABLE') {
        setUndo({ action: ev.action, token: ev.token, ttlMs: ev.ttlMs, name: ctx.name });
      }
    },
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
          title={t('app.searchTitle')}
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
          <span className="flex-1 opacity-60">{t('app.searchPlaceholder')}</span>
          <span className="font-mono text-[11px] opacity-45">⌘⇧K</span>
        </button>
        <button
          onClick={createContext}
          className="shrink-0 px-2 py-1.5 rounded-md text-[12px] opacity-70 hover:opacity-100
                     hover:bg-black/5 dark:hover:bg-white/10"
          title={t('app.newContextTitle')}
          aria-label={t('app.newContextTitle')}
        >
          {t('app.newContext')}
        </button>
        {ai.hasKey && (
          <button
            onClick={aiOrganizeAll}
            disabled={aiBusy}
            className="shrink-0 px-2 py-1.5 rounded-md text-[12px] text-accent hover:bg-accent/10
                       disabled:opacity-50"
            title={t('app.aiOrganizeAllTitle')}
          >
            {aiBusy ? t('app.aiOrganizeAllBusy') : t('app.aiOrganizeAll')}
          </button>
        )}
        <button
          onClick={() => setAllCollapsed((v) => !v)}
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md opacity-60 hover:opacity-100
                     hover:bg-black/5 dark:hover:bg-white/10"
          title={allCollapsed ? t('app.expandAll') : t('app.collapseAll')}
          aria-label={allCollapsed ? t('app.expandAll') : t('app.collapseAll')}
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
            {allCollapsed ? (
              <>
                <path d="M7 13l5 5 5-5" />
                <path d="M7 6l5 5 5-5" />
              </>
            ) : (
              <>
                <path d="M7 11l5-5 5 5" />
                <path d="M7 18l5-5 5 5" />
              </>
            )}
          </svg>
        </button>
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md opacity-60 hover:opacity-100
                     hover:bg-black/5 dark:hover:bg-white/10"
          title={t('app.settings')}
          aria-label={t('app.settings')}
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
          onToggleStar={toggleStar}
        />

        {activeContexts.map((c) => (
          <ContextGroup key={c.id} variant="active" collapseAll={allCollapsed} {...groupProps(c)} />
        ))}

        {!isEmpty && inbox && (
          <ContextGroup
            key={inbox.id}
            variant="inbox"
            collapseAll={allCollapsed}
            unclearReasons={unclearReasons}
            {...groupProps(inbox)}
          />
        )}

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
            <div className="px-2 pb-1 text-[11px] uppercase tracking-wide opacity-40">
              {t('app.archivedSection')}
            </div>
            {archivedContexts.map((c) => (
              <ContextGroup key={c.id} variant="archived" {...groupProps(c)} />
            ))}
          </div>
        )}
      </div>

      {/* 底部状态栏:归档量 + 累计回收内存(F-11) + 作者署名水印 */}
      <footer className="flex items-center gap-2 px-3 py-1.5 text-[11px] hairline border-t border-black/10 dark:border-white/10">
        <span className="opacity-50">
          {t('app.footer.archived')} <span className="font-mono">{archivedContexts.length}</span>{' '}
          {t('app.footer.tasks')} · <span className="font-mono">{archivedTabCount}</span>{' '}
          {t('app.footer.tabs')}
          {discardedBytes > 0 && (
            <>
              {' · '}
              {t('app.footer.reclaimed')}{' '}
              <span className="font-mono">{formatReclaimed(discardedBytes)}</span>
              <span className="ml-1 opacity-70">{t('app.footer.reclaimedEstimate')}</span>
            </>
          )}
        </span>
        <Signature className="ml-auto shrink-0" />
      </footer>

      {undo && (
        <UndoToast
          label={
            undo.action === 'reorg'
              ? t('ai.flash.organizedAll')
              : undo.action === 'archive-tab'
                ? t('undo.archivedInto', { name: undo.name ?? '' })
                : t('undo.label')
          }
          ttlMs={undo.ttlMs}
          onUndo={doUndo}
          onDismiss={clearUndo}
        />
      )}

      {flash && (
        <div
          role="status"
          aria-live="polite"
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
          {t('app.ai.analyzing')}
          <button
            type="button"
            onClick={() => dispatch({ type: 'CANCEL_AI' })}
            aria-label={t('app.ai.cancelAriaLabel')}
            className="ml-1 px-1.5 py-0.5 rounded text-[11px] underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            {t('app.ai.cancel')}
          </button>
        </div>
      )}

      {aiPlan && (
        <AIPlanDialog
          plan={aiPlan.plan}
          tabs={aiPlan.tabs}
          taskNames={Object.fromEntries(contexts.map((c) => [c.id, c.name]))}
          sourceNames={
            aiPlan.scope === 'all'
              ? Object.fromEntries(
                  aiPlan.tabs.map((tab) => [
                    tab.id,
                    contexts.find((c) => c.id === tab.contextId)?.name ?? t('app.unclassified'),
                  ]),
                )
              : undefined
          }
          onApply={(plan) => applyAiPlan(plan, { global: aiPlan.scope === 'all' })}
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
          onImport={doImport}
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
