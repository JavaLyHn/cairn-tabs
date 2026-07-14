import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '@/shared/types';
import { dispatch } from '../store';
import { hostname } from '../util';

interface Props {
  onClose: () => void;
  onActivate: (tabRecordId: string) => void;
  onRestoreContext: (contextId: string) => void;
}

export function SearchOverlay({ onClose, onActivate, onRestoreContext }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 防抖查询(见设计文档 §7.4)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSelected(0);
      return;
    }
    const t = setTimeout(async () => {
      const ev = await dispatch({ type: 'SEARCH', query: q });
      if (ev?.type === 'SEARCH_RESULTS') {
        setResults(ev.results);
        setSelected(0);
      }
    }, 60);
    return () => clearTimeout(t);
  }, [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[selected];
      if (!r) return;
      if (e.metaKey || e.ctrlKey) onRestoreContext(r.contextId);
      else onActivate(r.tab.id);
      onClose();
    }
  }

  return (
    <div
      className="absolute inset-0 z-20 flex justify-center bg-black/30 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="mt-6 w-[92%] max-h-[80%] flex flex-col rounded-xl overflow-hidden shadow-2xl
                   bg-white dark:bg-neutral-900 hairline border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="搜索打开或已归档的标签…"
          className="px-4 py-3 bg-transparent outline-none text-[14px]
                     border-b border-black/10 dark:border-white/10"
        />
        <div className="overflow-y-auto py-1">
          {query.trim() && results.length === 0 && (
            <div className="px-4 py-3 opacity-40 text-[12px]">无匹配</div>
          )}
          {results.map((r, i) => (
            <div
              key={r.tab.id}
              onMouseEnter={() => setSelected(i)}
              onClick={() => {
                onActivate(r.tab.id);
                onClose();
              }}
              className={`flex items-center gap-2 px-4 py-1.5 cursor-pointer
                          ${i === selected ? 'bg-accent/15' : ''} ${r.archived ? 'opacity-55' : ''}`}
            >
              {r.tab.faviconUrl ? (
                <img src={r.tab.faviconUrl} alt="" className="w-4 h-4 shrink-0" />
              ) : (
                <div className="w-4 h-4 shrink-0 rounded-sm bg-black/10 dark:bg-white/10" />
              )}
              <span className="flex-1 truncate">{r.tab.title}</span>
              <span className="font-mono text-[11px] opacity-40 shrink-0">{hostname(r.tab.url)}</span>
              <span className="shrink-0 text-[10.5px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 opacity-70">
                {r.contextName}
                {r.archived ? ' · 归档' : ''}
              </span>
            </div>
          ))}
        </div>
        <div className="px-4 py-1.5 text-[10.5px] opacity-40 border-t border-black/10 dark:border-white/10 font-mono">
          ↑↓ 选择 · ↵ 跳转 · ⌘↵ 恢复整簇 · esc 关闭
        </div>
      </div>
    </div>
  );
}
