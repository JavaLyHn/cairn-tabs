// 顶部「★ 重点」区:横跨所有任务的加星标签,快速直达(镜像;标签仍留原任务)。
import type { TabRecord } from '@/shared/types';
import { TabRow } from './TabRow';

interface Props {
  tabs: TabRecord[];
  portMap: Record<number, string>;
  onActivateTab: (tabRecordId: string) => void;
  onCloseTab: (tabRecordId: string) => void;
  onToggleStar: (tabRecordId: string, starred: boolean) => void;
}

export function StarredSection({ tabs, portMap, onActivateTab, onCloseTab, onToggleStar }: Props) {
  if (tabs.length === 0) return null;
  return (
    <div className="mb-1 rounded-md bg-amber-400/[0.06]">
      <div className="flex items-center gap-2 px-2 py-1.5 select-none">
        <span className="text-amber-400 text-[13px] leading-none">★</span>
        <span className="flex-1 font-medium text-[12.5px]">重点</span>
        <span className="font-mono text-[11px] opacity-40 shrink-0">{tabs.length}</span>
      </div>
      <div className="pl-5 pr-1 pb-1">
        {tabs.map((t) => (
          <TabRow
            key={t.id}
            tab={t}
            portMap={portMap}
            onActivate={() => onActivateTab(t.id)}
            onClose={() => onCloseTab(t.id)}
            onToggleStar={() => onToggleStar(t.id, !t.starred)}
          />
        ))}
      </div>
    </div>
  );
}
