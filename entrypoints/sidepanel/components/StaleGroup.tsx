import { useState } from 'react';
import type { TabRecord } from '@/shared/types';
import { daysSince } from '@/shared/stale';
import { TabRow } from './TabRow';

interface Props {
  tabs: TabRecord[]; // 陈旧标签,最久未访问在前
  portMap: Record<number, string>;
  now: number;
  onArchiveAll: () => void;
  onActivateTab: (tabRecordId: string) => void;
  onCloseTab: (tabRecordId: string) => void;
}

/** 陈旧标签下沉簇(F-10):降饱和度、沉到列表底部,带「全部归档」。不弹通知。 */
export function StaleGroup({ tabs, portMap, now, onArchiveAll, onActivateTab, onCloseTab }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  if (tabs.length === 0) return null;

  return (
    <div className="mt-3 pt-2 border-t border-dashed border-black/15 dark:border-white/15 opacity-70">
      <div
        className="group/head flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 shrink-0 opacity-45 transition-transform ${collapsed ? '' : 'rotate-90'}`}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>

        {/* 陈旧图标(时钟) */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5 shrink-0 opacity-45"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>

        <span className="flex-1 truncate text-[12.5px] font-medium opacity-70">陈旧 · 7 天未访问</span>
        <span className="font-mono text-[11px] opacity-40 shrink-0">{tabs.length}</span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onArchiveAll();
          }}
          className="shrink-0 text-[11px] px-1.5 py-0.5 rounded opacity-70 hover:opacity-100
                     hover:bg-black/5 dark:hover:bg-white/10"
          title="把全部陈旧标签整批收纳(可撤销)"
        >
          全部归档
        </button>
      </div>

      {!collapsed && (
        <div className="pl-5 pr-1 pb-1">
          {tabs.map((t) => (
            <TabRow
              key={t.id}
              tab={t}
              portMap={portMap}
              ageLabel={`${daysSince(t.lastActiveAt, now)} 天前`}
              onActivate={() => onActivateTab(t.id)}
              onClose={() => onCloseTab(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
