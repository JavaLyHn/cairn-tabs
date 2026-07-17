import { useT } from '../i18n';
import { BrandMark } from './BrandMark';

interface Props {
  onNew: () => void;
}

/** 侧边栏空状态:没有任何标签/上下文时展示动效字标 + 引导。 */
export function EmptyState({ onNew }: Props) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-10 text-center gap-3">
      <BrandMark className="mb-1" />
      <div className="text-[13px] font-medium">{t('empty.heading')}</div>
      <p className="text-[11.5px] opacity-55 leading-relaxed max-w-[220px]">{t('empty.body')}</p>
      <button
        onClick={onNew}
        aria-label={t('empty.newTask')}
        className="mt-1 px-3 py-1 rounded-md text-[12px] text-accent hover:bg-accent/10"
      >
        {t('empty.newTask')}
      </button>
      <div className="text-[11px] opacity-35 font-mono mt-1">{t('empty.searchHint')}</div>
    </div>
  );
}
