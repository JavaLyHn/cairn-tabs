import { useEffect, useMemo, useRef, useState } from 'react';
import type { SearchResult } from '@/shared/types';
import { dispatch, usePanelStore } from '../store';
import { hostname } from '../util';
import { useDialog } from '../hooks/useDialog';
import { Favicon } from './Favicon';
import { useT } from '../i18n';

interface Props {
  onClose: () => void;
  onActivate: (tabRecordId: string) => void;
  onRestoreContext: (contextId: string) => void;
}

const QUICK_LIMIT = 8;

export function SearchOverlay({ onClose, onActivate, onRestoreContext }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, onClose, { esc: false });

  const contexts = usePanelStore((s) => s.contexts);
  const tabs = usePanelStore((s) => s.tabs);

  // 空态「启动器」:未输入时展示打开中的标签,★ 重点优先、再按最近活跃 —— 让 ⌘⇧K 空手也能一键直达
  const quick = useMemo<SearchResult[]>(() => {
    const nameOf = new Map(contexts.map((c) => [c.id, c.name]));
    const ranked = tabs
      .filter((t) => t.chromeTabId != null) // 仅打开中的;已归档靠搜索
      .toSorted((a, b) => {
        const s = (b.starred ? 1 : 0) - (a.starred ? 1 : 0);
        return s !== 0 ? s : b.lastActiveAt - a.lastActiveAt;
      });
    return ranked.slice(0, QUICK_LIMIT).map((tab) => ({
      tab,
      contextId: tab.contextId,
      contextName: nameOf.get(tab.contextId) ?? t('search.unclassified'),
      archived: false,
    }));
  }, [contexts, tabs, t]);

  const q = query.trim();
  const items = q ? results : quick;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 防抖查询(见设计文档 §7.4)
  useEffect(() => {
    if (!q) {
      setResults([]);
      setSelected(0);
      return;
    }
    const timer = setTimeout(async () => {
      const ev = await dispatch({ type: 'SEARCH', query: q });
      if (ev?.type === 'SEARCH_RESULTS') {
        setResults(ev.results);
        setSelected(0);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [q]);

  // 列表变短时把高亮夹回范围内
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(items.length - 1, 0)));
  }, [items.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = items[selected];
      if (!r) return;
      if (e.metaKey || e.ctrlKey) onRestoreContext(r.contextId);
      else onActivate(r.tab.id);
      onClose();
    }
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('search.ariaLabel')}
      tabIndex={-1}
      className="absolute inset-0 z-20 flex justify-center items-center bg-black/30 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-[92%] max-h-[70%] flex flex-col rounded-xl overflow-hidden shadow-2xl
                   bg-white dark:bg-neutral-900 hairline border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          className="px-4 py-3 bg-transparent outline-none text-[14px]
                     border-b border-black/10 dark:border-white/10"
        />
        {(items.length > 0 || q) && (
          <div role="listbox" className="overflow-y-auto py-1">
            {!q && quick.length > 0 && (
              <div className="px-4 pt-1 pb-0.5 text-[10.5px] uppercase tracking-wide opacity-35">
                {t('search.recentHeader')}
              </div>
            )}
            {q && results.length === 0 && (
              <div className="px-4 py-3 opacity-40 text-[12px]">{t('search.noResults')}</div>
            )}
            {items.map((r, i) => (
              <div
                key={r.tab.id}
                role="option"
                aria-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onClick={() => {
                  onActivate(r.tab.id);
                  onClose();
                }}
                className={`flex items-center gap-2 px-4 py-1.5 cursor-pointer
                            ${i === selected ? 'bg-accent/15' : ''} ${r.archived ? 'opacity-55' : ''}`}
              >
                <Favicon url={r.tab.url} title={r.tab.title} faviconUrl={r.tab.faviconUrl} />
                {r.tab.starred && <span className="shrink-0 text-amber-500 text-[11px]">★</span>}
                <span className="flex-1 truncate">{r.tab.title}</span>
                <span className="font-mono text-[11px] opacity-40 shrink-0">
                  {hostname(r.tab.url)}
                </span>
                <span className="shrink-0 text-[10.5px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 opacity-70">
                  {r.contextName}
                  {r.archived ? t('search.archivedSuffix') : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="px-4 py-1.5 text-[10.5px] opacity-40 border-t border-black/10 dark:border-white/10 font-mono">
          {t('search.hint')}
        </div>
      </div>
    </div>
  );
}
