import type { TabRecord } from '@/shared/types';
import { hostname } from '../util';
import { localhostPort, projectFor } from '@/shared/localhost';

interface Props {
  tab: TabRecord;
  dupState?: 'keeper' | 'redundant';
  portMap: Record<number, string>;
  onActivate: () => void;
  onClose: () => void;
}

export function TabRow({ tab, dupState, portMap, onActivate, onClose }: Props) {
  const port = localhostPort(tab.url);
  const project = port != null ? projectFor(tab.url, portMap) : null;
  const displayTitle = project ?? tab.title;
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
      <span className="flex-1 truncate">{displayTitle}</span>
      {port != null && (
        <span className="font-mono text-[11px] opacity-45 shrink-0" title={tab.title}>
          :{port}
        </span>
      )}
      {dupState === 'redundant' && (
        <span
          className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-500"
          title="重复标签(合并时会被关闭)"
        >
          重复
        </span>
      )}
      {dupState === 'keeper' && (
        <span
          className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-accent/15 text-accent"
          title="重复组中最新打开的,合并时保留这个"
        >
          重复·留
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
