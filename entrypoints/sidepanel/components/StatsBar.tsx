import { useT } from '../i18n';

interface Props {
  openTabs: number;
  activeContexts: number;
  stale: number;
  redundant: number;
  onMerge: () => void;
}

export function StatsBar({ openTabs, activeContexts, stale, redundant, onMerge }: Props) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-4 px-3 py-1.5 text-[11.5px] opacity-60 hairline border-b border-black/10 dark:border-white/10">
      <span>
        <span className="font-mono">{openTabs}</span>
        {t('stats.tabs', { n: openTabs }).slice(String(openTabs).length)}
      </span>
      <span>
        <span className="font-mono">{activeContexts}</span>
        {t('stats.tasks', { n: activeContexts }).slice(String(activeContexts).length)}
      </span>
      {stale > 0 && (
        <span title={t('stats.staleTitle')}>
          <span className="font-mono">{stale}</span>
          {t('stats.stale', { n: stale }).slice(String(stale).length)}
        </span>
      )}
      {redundant > 0 && (
        <button
          onClick={onMerge}
          className="ml-auto flex items-center gap-1 text-amber-600 dark:text-amber-500 hover:underline opacity-100"
          title={t('stats.duplicatesTitle')}
          aria-label={t('stats.duplicatesTitle')}
        >
          <span className="font-mono">{redundant}</span>
          {t('stats.duplicates', { n: redundant }).slice(String(redundant).length)}
        </button>
      )}
    </div>
  );
}
