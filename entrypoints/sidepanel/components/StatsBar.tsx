interface Props {
  openTabs: number;
  activeContexts: number;
}

export function StatsBar({ openTabs, activeContexts }: Props) {
  return (
    <div className="flex items-center gap-4 px-3 py-1.5 text-[11.5px] opacity-60 hairline border-b border-black/10 dark:border-white/10">
      <span>
        <span className="font-mono">{openTabs}</span> 标签
      </span>
      <span>
        <span className="font-mono">{activeContexts}</span> 上下文
      </span>
    </div>
  );
}
