interface Props {
  openTabs: number;
  activeContexts: number;
  redundant: number;
  onMerge: () => void;
}

export function StatsBar({ openTabs, activeContexts, redundant, onMerge }: Props) {
  return (
    <div className="flex items-center gap-4 px-3 py-1.5 text-[11.5px] opacity-60 hairline border-b border-black/10 dark:border-white/10">
      <span>
        <span className="font-mono">{openTabs}</span> 标签
      </span>
      <span>
        <span className="font-mono">{activeContexts}</span> 任务
      </span>
      {redundant > 0 && (
        <button
          onClick={onMerge}
          className="ml-auto flex items-center gap-1 text-amber-600 dark:text-amber-500 hover:underline opacity-100"
          title="关闭重复标签,每组保留最近活跃的"
        >
          <span className="font-mono">{redundant}</span> 重复 · 合并
        </button>
      )}
    </div>
  );
}
