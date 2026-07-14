import type { TabRecord } from '@/shared/types';
import { hostname } from '../util';

interface Props {
  tab: TabRecord;
  onActivate: () => void;
  onClose: () => void;
}

export function TabRow({ tab, onActivate, onClose }: Props) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/cairn-tab-record', tab.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onActivate}
      className="group/row flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer
                 hover:bg-black/5 dark:hover:bg-white/5 select-none"
      title={tab.url}
    >
      {tab.faviconUrl ? (
        <img src={tab.faviconUrl} alt="" className="w-4 h-4 shrink-0" />
      ) : (
        <div className="w-4 h-4 shrink-0 rounded-sm bg-black/10 dark:bg-white/10" />
      )}
      <span className="flex-1 truncate">{tab.title}</span>
      <span className="hidden group-hover/row:inline font-mono text-[11px] opacity-40 shrink-0">
        {hostname(tab.url)}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="hidden group-hover/row:flex items-center justify-center w-4 h-4 shrink-0
                   rounded opacity-50 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
        title="关闭标签"
      >
        ×
      </button>
    </div>
  );
}
