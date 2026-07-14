import type { TabRecord } from '@/shared/types';
import { hostname } from '../util';

interface Props {
  tab: TabRecord;
  isDuplicate?: boolean;
  onActivate: () => void;
  onClose: () => void;
}

export function TabRow({ tab, isDuplicate, onActivate, onClose }: Props) {
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
      {isDuplicate && (
        <span
          className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-500"
          title="重复标签(合并时会被关闭)"
        >
          重复
        </span>
      )}
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
