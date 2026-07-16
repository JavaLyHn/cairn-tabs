import { useEffect } from 'react';

interface Props {
  label: string;
  onUndo: () => void;
  onDismiss: () => void;
  ttlMs: number;
}

export function UndoToast({ label, onUndo, onDismiss, ttlMs }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, ttlMs);
    return () => clearTimeout(t);
  }, [ttlMs, onDismiss]);

  return (
    <div
      className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3
                    px-3 py-2 rounded-lg bg-neutral-900 text-white text-[12px] shadow-lg
                    dark:bg-neutral-100 dark:text-neutral-900"
    >
      <span>{label}</span>
      <button onClick={onUndo} className="text-accent font-medium hover:underline">
        撤销
      </button>
    </div>
  );
}
