import { useEffect } from 'react';
import { useT } from '../i18n';

interface Props {
  label: string;
  onUndo: () => void;
  onDismiss: () => void;
  ttlMs: number;
}

export function UndoToast({ label, onUndo, onDismiss, ttlMs }: Props) {
  const { t } = useT();
  useEffect(() => {
    const t = setTimeout(onDismiss, ttlMs);
    return () => clearTimeout(t);
  }, [ttlMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3
                    px-3 py-2 rounded-lg bg-neutral-900 text-white text-[12px] shadow-lg
                    dark:bg-neutral-100 dark:text-neutral-900"
    >
      <span>{label}</span>
      <button onClick={onUndo} className="text-accent font-medium hover:underline">
        {t('undo.action')}
      </button>
    </div>
  );
}
