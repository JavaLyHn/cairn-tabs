import type { Flags } from '@/shared/types';

interface Props {
  flags: Flags;
  onToggleAutoCluster: (enabled: boolean) => void;
  onToggleStaleHints: (enabled: boolean) => void;
  onToggleAutoDiscard: (enabled: boolean) => void;
  onToggleDiscardSkipsLocalhost: (enabled: boolean) => void;
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

function ToggleRow({
  title,
  desc,
  on,
  onToggle,
}: {
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
    >
      <div className="flex-1">
        <div className="text-[12.5px]">{title}</div>
        <div className="text-[11px] opacity-50 leading-snug mt-0.5">{desc}</div>
      </div>
      <div className="pt-0.5">
        <Toggle on={on} />
      </div>
    </button>
  );
}

export function SettingsPanel({
  flags,
  onToggleAutoCluster,
  onToggleStaleHints,
  onToggleAutoDiscard,
  onToggleDiscardSkipsLocalhost,
  onExportAll,
  onClose,
}: Props) {
  return (
    <div className="absolute inset-0 z-30" onClick={onClose}>
      <div
        className="absolute right-2 top-1 w-72 max-h-[90%] overflow-y-auto rounded-lg shadow-xl
                   bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 text-[11px] uppercase tracking-wide opacity-40 border-b border-black/10 dark:border-white/10">
          设置
        </div>

        <ToggleRow
          title="自动聚簇"
          desc="自动把相关新标签归入任务、并在标签栏建组。关闭后新标签只进「未分类」,由你手动整理。"
          on={flags.autoCluster}
          onToggle={() => onToggleAutoCluster(!flags.autoCluster)}
        />

        <div className="border-t border-black/10 dark:border-white/10">
          <ToggleRow
            title={`陈旧提示 · ${flags.staleDays} 天`}
            desc="超过阈值天数未访问的标签下沉到底部,给一个「全部归档」入口。只展示,不主动动你的标签。"
            on={flags.staleHints}
            onToggle={() => onToggleStaleHints(!flags.staleHints)}
          />
        </div>

        <div className="border-t border-black/10 dark:border-white/10">
          <ToggleRow
            title={`自动挂起 · ${flags.discardAfterMinutes} 分钟`}
            desc="闲置超过阈值的标签释放内存(标签保留,点击自动重载)。默认关闭 —— 想省内存再打开。"
            on={flags.autoDiscard}
            onToggle={() => onToggleAutoDiscard(!flags.autoDiscard)}
          />
          {flags.autoDiscard && (
            <div className="border-t border-black/5 dark:border-white/5">
              <ToggleRow
                title="localhost 不挂起"
                desc="保护 dev server 页面 —— 本地开发地址永不被自动挂起,避免丢失页面状态。"
                on={flags.discardSkipsLocalhost}
                onToggle={() => onToggleDiscardSkipsLocalhost(!flags.discardSkipsLocalhost)}
              />
            </div>
          )}
        </div>

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
