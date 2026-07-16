import { useState, useRef } from 'react';
import type { TabRecord } from '@/shared/types';
import type { AIPlan } from '@/shared/ai';
import { useDialog } from '../hooks/useDialog';
import { Favicon } from './Favicon';
import { useT } from '../i18n';

interface Props {
  plan: AIPlan;
  tabs: TabRecord[]; // 未分类零散标签,供渲染标题/favicon
  taskNames: Record<string, string>; // contextId → 任务名
  sourceNames?: Record<string, string>; // tabId → 原组名(仅"整理全部"时传,显示"从哪搬来")
  onApply: (plan: AIPlan) => void;
  onClose: () => void;
}

// Fix 1: module-scope component so it's a stable type across renders
function TabItem({
  tab,
  source,
  onRemove,
}: {
  tab: TabRecord;
  source?: string;
  onRemove: () => void;
}) {
  const { t } = useT();
  return (
    <div className="group/r flex items-center gap-2 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
      <Favicon url={tab.url} title={tab.title} faviconUrl={tab.faviconUrl} />
      <span className="flex-1 truncate text-[12.5px]">{tab.title}</span>
      {source && (
        <span className="shrink-0 text-[10.5px] opacity-40">
          {t('aiPlan.tabSource', { source })}
        </span>
      )}
      <button
        onClick={onRemove}
        className="hidden group-hover/r:block text-[11px] opacity-50 hover:opacity-100"
        title={t('aiPlan.removeTabTitle')}
      >
        {t('aiPlan.removeTab')}
      </button>
    </div>
  );
}

// Fix 3: local state shape for groups includes a stable _id
interface LocalGroup {
  name: string;
  tabIds: string[];
  _id: string;
}

interface LocalAssign {
  taskId: string;
  tabIds: string[];
}

export function AIPlanDialog({ plan, tabs, taskNames, sourceNames, onApply, onClose }: Props) {
  const { t } = useT();
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, onClose);

  // Fix 3: stable _id added at init time; assign uses taskId as key
  const [groups, setGroups] = useState<LocalGroup[]>(
    plan.newGroups.map((g, i) => ({ ...g, tabIds: [...g.tabIds], _id: 'g' + i })),
  );
  const [assign, setAssign] = useState<LocalAssign[]>(
    plan.assign.map((a) => ({ ...a, tabIds: [...a.tabIds] })),
  );

  const renameGroup = (i: number, name: string) =>
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, name } : g)));
  const dropFromGroup = (i: number, tabId: string) =>
    setGroups((gs) =>
      gs.map((g, j) => (j === i ? { ...g, tabIds: g.tabIds.filter((t) => t !== tabId) } : g)),
    );
  const dropFromAssign = (i: number, tabId: string) =>
    setAssign((as) =>
      as.map((a, j) => (j === i ? { ...a, tabIds: a.tabIds.filter((t) => t !== tabId) } : a)),
    );

  // Fix 2: whole-group / whole-assign cancel
  const removeGroup = (i: number) => setGroups((gs) => gs.filter((_, j) => j !== i));
  const removeAssign = (i: number) => setAssign((as) => as.filter((_, j) => j !== i));

  // Fix 3: finalPlan strips _id — only { name, tabIds } / { taskId, tabIds } go out
  const finalPlan: AIPlan = {
    newGroups: groups
      .filter((g) => g.name.trim() && g.tabIds.length)
      .map(({ name, tabIds }) => ({ name, tabIds })),
    assign: assign.filter((a) => a.tabIds.length).map(({ taskId, tabIds }) => ({ taskId, tabIds })),
  };
  const empty = finalPlan.newGroups.length === 0 && finalPlan.assign.length === 0;

  return (
    <div className="absolute inset-0 z-30 flex justify-center bg-black/30" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('aiPlan.ariaLabel')}
        tabIndex={-1}
        className="mt-6 w-[92%] max-h-[82%] flex flex-col rounded-xl overflow-hidden shadow-2xl
                   bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 text-[12px] opacity-70 border-b border-black/10 dark:border-white/10">
          {t('aiPlan.header')}
        </div>

        <div className="flex-1 overflow-auto px-3 py-2 space-y-3">
          {groups.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-40 mb-1">
                {t('aiPlan.newGroups')}
              </div>
              {/* Fix 3: use _id as key */}
              {groups.map((g, i) => (
                <div
                  key={g._id}
                  className="mb-2 rounded-lg border border-black/10 dark:border-white/10 p-1.5"
                >
                  {/* Fix 2: header row with editable name + 取消这组 button */}
                  <div className="flex items-center gap-1 mb-1">
                    <input
                      value={g.name}
                      onChange={(e) => renameGroup(i, e.target.value)}
                      aria-label={t('aiPlan.newGroups')}
                      className="flex-1 bg-transparent outline-none border-b border-accent/40 focus:border-accent
                                 text-[13px] font-medium px-1 py-0.5"
                    />
                    <button
                      onClick={() => removeGroup(i)}
                      className="text-[11px] opacity-50 hover:opacity-100 px-1 shrink-0"
                      title={t('aiPlan.cancelGroup')}
                    >
                      {t('aiPlan.cancelGroup')}
                    </button>
                  </div>
                  {/* Fix 1: resolve tab via byId and render TabItem */}
                  {g.tabIds.map((id) => {
                    const t = byId.get(id);
                    if (!t) return null;
                    return (
                      <TabItem
                        key={id}
                        tab={t}
                        source={sourceNames?.[id]}
                        onRemove={() => dropFromGroup(i, id)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {assign.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-40 mb-1">
                {t('aiPlan.assign')}
              </div>
              {/* Fix 3: use taskId as key */}
              {assign.map((a, i) => (
                <div
                  key={a.taskId}
                  className="mb-2 rounded-lg border border-black/10 dark:border-white/10 p-1.5"
                >
                  {/* Fix 2: header row with task name + 取消 button */}
                  <div className="flex items-center gap-1 mb-1">
                    <div className="flex-1 text-[13px] font-medium px-1 py-0.5 opacity-80">
                      → {taskNames[a.taskId] ?? t('aiPlan.taskFallback')}
                    </div>
                    <button
                      onClick={() => removeAssign(i)}
                      className="text-[11px] opacity-50 hover:opacity-100 px-1 shrink-0"
                      title={t('aiPlan.cancelAssign')}
                    >
                      {t('aiPlan.cancelAssign')}
                    </button>
                  </div>
                  {/* Fix 1: resolve tab via byId and render TabItem */}
                  {a.tabIds.map((id) => {
                    const t = byId.get(id);
                    if (!t) return null;
                    return (
                      <TabItem
                        key={id}
                        tab={t}
                        source={sourceNames?.[id]}
                        onRemove={() => dropFromAssign(i, id)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-black/10 dark:border-white/10">
          <button
            onClick={onClose}
            className="px-2.5 py-1 rounded-md text-[12px] opacity-60 hover:opacity-100"
          >
            {t('aiPlan.cancel')}
          </button>
          <button
            onClick={() => onApply(finalPlan)}
            disabled={empty}
            className="px-2.5 py-1 rounded-md text-[12px] bg-accent text-white hover:opacity-90 disabled:opacity-40"
          >
            {t('aiPlan.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
