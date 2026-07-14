// 同域升格建议(F-07):未分类里同域标签够阈值 → 一条「成簇 / 忽略」建议。
// 交互与 PortBindSuggestions 一致:非侵入,用户确认才落地。

interface Suggestion {
  domain: string;
  tabIds: string[];
}

interface Props {
  suggestions: Suggestion[];
  onPromote: (domain: string, tabIds: string[]) => void;
  onIgnore: (domain: string) => void;
}

export function DomainPromoteSuggestions({ suggestions, onPromote, onIgnore }: Props) {
  if (suggestions.length === 0) return null;
  return (
    <div className="px-2 py-1 border-b border-black/10 dark:border-white/10 bg-accent/[0.06]">
      {suggestions.map((s) => (
        <div key={s.domain} className="flex items-center gap-2 px-1 py-0.5 text-[12px]">
          <span className="opacity-60">同站</span>
          <span className="font-mono text-[11px] opacity-70 shrink-0">{s.domain}</span>
          <span className="opacity-45 shrink-0">· {s.tabIds.length} 个</span>
          <span className="flex-1" />
          <button
            onClick={() => onPromote(s.domain, s.tabIds)}
            className="shrink-0 text-accent text-[11px] hover:underline"
          >
            成簇
          </button>
          <button
            onClick={() => onIgnore(s.domain)}
            className="shrink-0 opacity-40 hover:opacity-80 text-[11px]"
          >
            忽略
          </button>
        </div>
      ))}
    </div>
  );
}
