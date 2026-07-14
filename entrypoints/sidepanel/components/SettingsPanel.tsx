interface Props {
  autoCluster: boolean;
  onToggleAutoCluster: (enabled: boolean) => void;
  onExportAll: () => void;
  onClose: () => void;
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors
                  ${on ? 'bg-accent' : 'bg-black/20 dark:bg-white/25'}`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white transition-transform
                    ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`}
      />
    </span>
  );
}

export function SettingsPanel({ autoCluster, onToggleAutoCluster, onExportAll, onClose }: Props) {
  return (
    <div className="absolute inset-0 z-30" onClick={onClose}>
      <div
        className="absolute right-2 top-1 w-64 rounded-lg shadow-xl overflow-hidden
                   bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 text-[11px] uppercase tracking-wide opacity-40 border-b border-black/10 dark:border-white/10">
          设置
        </div>
        <button
          onClick={() => onToggleAutoCluster(!autoCluster)}
          className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
        >
          <div className="flex-1">
            <div className="text-[12.5px]">自动聚簇</div>
            <div className="text-[11px] opacity-50 leading-snug mt-0.5">
              自动把相关新标签归入任务、并在标签栏建组。关闭后新标签只进「未分类」,由你手动整理。
            </div>
          </div>
          <div className="pt-0.5">
            <Toggle on={autoCluster} />
          </div>
        </button>

        <div className="border-t border-black/10 dark:border-white/10">
          <button
            onClick={onExportAll}
            className="w-full text-left px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="text-[12.5px]">导出全部数据 (JSON)</div>
            <div className="text-[11px] opacity-50 leading-snug mt-0.5">
              下载所有任务与标签的备份文件,用于迁移或存档。
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
