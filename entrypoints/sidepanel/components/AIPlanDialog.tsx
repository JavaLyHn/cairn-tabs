import { useState } from 'react';
import type { TabRecord } from '@/shared/types';
import type { AIPlan } from '@/shared/ai';

interface Props {
  plan: AIPlan;
  tabs: TabRecord[]; // 未分类零散标签,供渲染标题/favicon
  taskNames: Record<string, string>; // contextId → 任务名
  onApply: (plan: AIPlan) => void;
  onClose: () => void;
}

export function AIPlanDialog({ plan, tabs, taskNames, onApply, onClose }: Props) {
  const byId = new Map(tabs.map((t) => [t.id, t]));
  // 本地可编辑副本
  const [groups, setGroups] = useState(plan.newGroups.map((g) => ({ ...g, tabIds: [...g.tabIds] })));
  const [assign, setAssign] = useState(plan.assign.map((a) => ({ ...a, tabIds: [...a.tabIds] })));

  const renameGroup = (i: number, name: string) =>
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, name } : g)));
  const dropFromGroup = (i: number, tabId: string) =>
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, tabIds: g.tabIds.filter((t) => t !== tabId) } : g)));
  const dropFromAssign = (i: number, tabId: string) =>
    setAssign((as) => as.map((a, j) => (j === i ? { ...a, tabIds: a.tabIds.filter((t) => t !== tabId) } : a)));

  const finalPlan: AIPlan = {
    newGroups: groups.filter((g) => g.name.trim() && g.tabIds.length),
    assign: assign.filter((a) => a.tabIds.length),
  };
  const empty = finalPlan.newGroups.length === 0 && finalPlan.assign.length === 0;

  const Tab = ({ id, onRemove }: { id: string; onRemove: () => void }) => {
    const t = byId.get(id);
    if (!t) return null;
    return (
      <div className="group/r flex items-center gap-2 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
        {t.faviconUrl ? (
          <img src={t.faviconUrl} alt="" className="w-4 h-4 shrink-0" />
        ) : (
          <div className="w-4 h-4 shrink-0 rounded-sm bg-black/10 dark:bg-white/10" />
        )}
        <span className="flex-1 truncate text-[12.5px]">{t.title}</span>
        <button
          onClick={onRemove}
          className="hidden group-hover/r:block text-[11px] opacity-50 hover:opacity-100"
          title="不归类这个标签"
        >
          移除
        </button>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-30 flex justify-center bg-black/30" onClick={onClose}>
      <div
        className="mt-6 w-[92%] max-h-[82%] flex flex-col rounded-xl overflow-hidden shadow-2xl
                   bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 text-[12px] opacity-70 border-b border-black/10 dark:border-white/10">
          ✦ AI 整理未分类 · 确认后生效
        </div>

        <div className="flex-1 overflow-auto px-3 py-2 space-y-3">
          {groups.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-40 mb-1">新建任务</div>
              {groups.map((g, i) => (
                <div key={i} className="mb-2 rounded-lg border border-black/10 dark:border-white/10 p-1.5">
                  <input
                    value={g.name}
                    onChange={(e) => renameGroup(i, e.target.value)}
                    className="w-full bg-transparent outline-none border-b border-accent/40 focus:border-accent
                               text-[13px] font-medium px-1 py-0.5 mb-1"
                  />
                  {g.tabIds.map((id) => (
                    <Tab key={id} id={id} onRemove={() => dropFromGroup(i, id)} />
                  ))}
                </div>
              ))}
            </div>
          )}

          {assign.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-40 mb-1">并入已有任务</div>
              {assign.map((a, i) => (
                <div key={i} className="mb-2 rounded-lg border border-black/10 dark:border-white/10 p-1.5">
                  <div className="text-[13px] font-medium px-1 py-0.5 mb-1 opacity-80">→ {taskNames[a.taskId] ?? '任务'}</div>
                  {a.tabIds.map((id) => (
                    <Tab key={id} id={id} onRemove={() => dropFromAssign(i, id)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-black/10 dark:border-white/10">
          <button onClick={onClose} className="px-2.5 py-1 rounded-md text-[12px] opacity-60 hover:opacity-100">
            取消
          </button>
          <button
            onClick={() => onApply(finalPlan)}
            disabled={empty}
            className="px-2.5 py-1 rounded-md text-[12px] bg-accent text-white hover:opacity-90 disabled:opacity-40"
          >
            应用
          </button>
        </div>
      </div>
    </div>
  );
}
