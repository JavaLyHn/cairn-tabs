// 同站归类建议(F-07):未分类里同域标签够阈值 → 一条「归类 / 忽略」建议。
// 交互与 PortBindSuggestions 一致:非侵入,用户确认才落地。

import { useT } from '../i18n';

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
  const { t } = useT();
  if (suggestions.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="px-2 py-1 border-b border-black/10 dark:border-white/10 bg-accent/[0.06]"
    >
      {suggestions.map((s) => (
        <div key={s.domain} className="flex items-center gap-2 px-1 py-0.5 text-[12px]">
          <span className="opacity-60">{t('domain.sameSite')}</span>
          <span className="font-mono text-[11px] opacity-70 shrink-0">{s.domain}</span>
          <span className="opacity-45 shrink-0">{t('domain.tabs', { n: s.tabIds.length })}</span>
          <span className="flex-1" />
          <button
            onClick={() => onPromote(s.domain, s.tabIds)}
            aria-label={t('domain.cluster') + ' ' + s.domain}
            className="shrink-0 text-accent text-[11px] hover:underline"
          >
            {t('domain.cluster')}
          </button>
          <button
            onClick={() => onIgnore(s.domain)}
            aria-label={t('domain.ignore') + ' ' + s.domain}
            className="shrink-0 opacity-40 hover:opacity-80 text-[11px]"
          >
            {t('domain.ignore')}
          </button>
        </div>
      ))}
    </div>
  );
}
