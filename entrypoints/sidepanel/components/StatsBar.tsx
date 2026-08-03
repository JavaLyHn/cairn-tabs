import { useT } from '../i18n';

interface Props {
  openTabs: number;
  activeContexts: number;
  stale: number;
  redundant: number;
  onMerge: () => void;
}

/**
 * 渲染「带数字的统计文案」,数字用等宽字体。
 * 按数字在**译文里的实际位置**切分 —— 不能假定它在句首:
 * en「17 tabs」数字在前,ko「탭 17개」数字在中间。
 * (旧实现用 slice(数字长度) 截头部,韩文会渲染成 "17"+"17개" = "1717개"。)
 */
function CountText({ n, text }: { n: number; text: string }) {
  const s = String(n);
  const i = text.indexOf(s);
  if (i < 0) return <>{text}</>; // 译文没带数字:原样输出
  return (
    <>
      {text.slice(0, i)}
      <span className="font-mono">{s}</span>
      {text.slice(i + s.length)}
    </>
  );
}

export function StatsBar({ openTabs, activeContexts, stale, redundant, onMerge }: Props) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-4 px-3 py-1.5 text-[11.5px] opacity-60 hairline border-b border-black/10 dark:border-white/10">
      <span>
        <CountText n={openTabs} text={t('stats.tabs', { n: openTabs })} />
      </span>
      <span>
        <CountText n={activeContexts} text={t('stats.tasks', { n: activeContexts })} />
      </span>
      {stale > 0 && (
        <span title={t('stats.staleTitle')}>
          <CountText n={stale} text={t('stats.stale', { n: stale })} />
        </span>
      )}
      {redundant > 0 && (
        <button
          onClick={onMerge}
          className="ml-auto flex items-center gap-1 text-amber-600 dark:text-amber-500 hover:underline opacity-100"
          title={t('stats.duplicatesTitle')}
          aria-label={t('stats.duplicatesTitle')}
        >
          <CountText n={redundant} text={t('stats.duplicates', { n: redundant })} />
        </button>
      )}
    </div>
  );
}
