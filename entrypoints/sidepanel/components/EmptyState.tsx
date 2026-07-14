interface Props {
  onNew: () => void;
}

/** 侧边栏空状态:没有任何标签/上下文时展示 logo + 引导。 */
export function EmptyState({ onNew }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-10 text-center gap-3">
      <img
        src={chrome.runtime.getURL('icon/128.png')}
        alt=""
        className="w-14 h-14 opacity-90 select-none"
        draggable={false}
      />
      <div className="text-[13px] font-medium">还没有标签</div>
      <p className="text-[11.5px] opacity-55 leading-relaxed max-w-[220px]">
        打开一些网页,它们会出现在这里。相关的标签会自动聚成任务,你也可以手动新建任务来整理。
      </p>
      <button
        onClick={onNew}
        className="mt-1 px-3 py-1 rounded-md text-[12px] text-accent hover:bg-accent/10"
      >
        + 新建任务
      </button>
      <div className="text-[11px] opacity-35 font-mono mt-1">⌘⇧K 搜索</div>
    </div>
  );
}
