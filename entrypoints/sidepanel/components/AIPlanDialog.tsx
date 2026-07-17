import { useState, useRef } from 'react';
import type { TabRecord } from '@/shared/types';
import type { AIPlan } from '@/shared/ai';
import { useDialog } from '../hooks/useDialog';
import { Favicon } from './Favicon';
import { useT } from '../i18n';

interface Props {
  plan: AIPlan;
  tabs: TabRecord[]; // 计划涉及的标签,供渲染标题/favicon + 取 contextId 判断是否变更
  taskNames: Record<string, string>; // contextId → 任务名
  sourceNames?: Record<string, string>; // tabId → 原组名(仅"整理全部"时传,显示"从哪搬来")
  onApply: (plan: AIPlan) => void;
  onClose: () => void;
}

// 一行标签。moved:移动进来的(绿色左条 + 「原 X →」);dim:无变更(灰暗只读)。
function TabItem({
  tab,
  source,
  moved,
  dim,
  onRemove,
}: {
  tab: TabRecord;
  source?: string;
  moved?: boolean;
  dim?: boolean;
  onRemove?: () => void;
}) {
  const { t } = useT();
  return (
    <div
      className={`group/r flex items-center gap-2 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5
                  ${moved ? 'border-l-2 border-accent bg-accent/5 pl-1.5' : ''} ${dim ? 'opacity-50' : ''}`}
    >
      <Favicon url={tab.url} title={tab.title} faviconUrl={tab.faviconUrl} />
      <span className="flex-1 truncate text-[12.5px]">{tab.title}</span>
      {moved && source && (
        <span className="shrink-0 text-[10.5px] text-accent/70">
          {t('aiPlan.tabSource', { source })} →
        </span>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="hidden group-hover/r:block text-[11px] opacity-50 hover:opacity-100"
          title={t('aiPlan.removeTabTitle')}
        >
          {t('aiPlan.removeTab')}
        </button>
      )}
    </div>
  );
}

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
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, onClose);

  const [groups, setGroups] = useState<LocalGroup[]>(
    plan.newGroups.map((g, i) => ({ ...g, tabIds: [...g.tabIds], _id: 'g' + i })),
  );
  const [assign, setAssign] = useState<LocalAssign[]>(
    plan.assign.map((a) => ({ ...a, tabIds: [...a.tabIds] })),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (taskId: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(taskId)) n.delete(taskId);
      else n.add(taskId);
      return n;
    });

  const renameGroup = (i: number, name: string) =>
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, name } : g)));
  const dropFromGroup = (i: number, tabId: string) =>
    setGroups((gs) =>
      gs.map((g, j) => (j === i ? { ...g, tabIds: g.tabIds.filter((x) => x !== tabId) } : g)),
    );
  const dropFromAssign = (i: number, tabId: string) =>
    setAssign((as) =>
      as.map((a, j) => (j === i ? { ...a, tabIds: a.tabIds.filter((x) => x !== tabId) } : a)),
    );
  const removeGroup = (i: number) => setGroups((gs) => gs.filter((_, j) => j !== i));
  const removeAssign = (i: number) => setAssign((as) => as.filter((_, j) => j !== i));

  // 是否移动:并入组里标签的当前组 ≠ 目标任务。
  const movedIn = (taskId: string, tabIds: string[]) =>
    tabIds.filter((id) => (byId.get(id)?.contextId ?? '') !== taskId);
  const sameIn = (taskId: string, tabIds: string[]) =>
    tabIds.filter((id) => (byId.get(id)?.contextId ?? '') === taskId);

  const unclear = plan.unclear ?? [];
  const liveGroups = groups.filter((g) => g.name.trim() && g.tabIds.length);
  // finalPlan:新建组保持;并入组只留移动项、丢弃无移动的组;unclear 透传。
  const finalPlan: AIPlan = {
    newGroups: liveGroups.map(({ name, tabIds }) => ({ name, tabIds })),
    assign: assign
      .map((a) => ({ taskId: a.taskId, tabIds: movedIn(a.taskId, a.tabIds) }))
      .filter((a) => a.tabIds.length),
    ...(unclear.length ? { unclear } : {}),
  };

  const movedCount =
    finalPlan.newGroups.reduce((n, g) => n + g.tabIds.length, 0) +
    finalPlan.assign.reduce((n, a) => n + a.tabIds.length, 0);
  const newGroupCount = finalPlan.newGroups.length;
  const unchangedCount = assign.reduce((n, a) => n + sameIn(a.taskId, a.tabIds).length, 0);
  const unclearCount = unclear.length;
  const noChanges = movedCount === 0 && unclearCount === 0;
  const summaryTotal = movedCount + newGroupCount + unchangedCount + unclearCount;

  // 有移动的并入组(无移动的整组不显示)
  const assignRows = assign
    .map((a, i) => ({ a, i, moved: movedIn(a.taskId, a.tabIds), same: sameIn(a.taskId, a.tabIds) }))
    .filter((x) => x.moved.length > 0);

  const chip = 'shrink-0 px-2 py-0.5 rounded-full text-[11px]';

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
          {/* 变更摘要 */}
          {summaryTotal > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {movedCount > 0 && (
                <span className={`${chip} bg-accent/15 text-accent font-medium`}>
                  {t('aiPlan.summary.moved', { n: movedCount })}
                </span>
              )}
              {newGroupCount > 0 && (
                <span className={`${chip} bg-accent/15 text-accent font-medium`}>
                  {t('aiPlan.summary.newGroups', { n: newGroupCount })}
                </span>
              )}
              {unchangedCount > 0 && (
                <span className={`${chip} bg-black/5 dark:bg-white/10 opacity-70`}>
                  {t('aiPlan.summary.unchanged', { n: unchangedCount })}
                </span>
              )}
              {unclearCount > 0 && (
                <span className={`${chip} bg-amber-500/15 text-amber-600 dark:text-amber-500`}>
                  {t('aiPlan.summary.unclear', { n: unclearCount })}
                </span>
              )}
            </div>
          )}

          {liveGroups.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-40 mb-1">
                {t('aiPlan.newGroups')}
              </div>
              {groups.map((g, i) =>
                g.name.trim() && g.tabIds.length ? (
                  <div
                    key={g._id}
                    className="mb-2 rounded-lg border border-black/10 dark:border-white/10 p-1.5"
                  >
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
                    {g.tabIds.map((id) => {
                      const tab = byId.get(id);
                      if (!tab) return null;
                      return (
                        <TabItem
                          key={id}
                          tab={tab}
                          moved
                          source={sourceNames?.[id]}
                          onRemove={() => dropFromGroup(i, id)}
                        />
                      );
                    })}
                  </div>
                ) : null,
              )}
            </div>
          )}

          {assignRows.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-40 mb-1">
                {t('aiPlan.assign')}
              </div>
              {assignRows.map(({ a, i, moved, same }) => (
                <div
                  key={a.taskId}
                  className="mb-2 rounded-lg border border-black/10 dark:border-white/10 p-1.5"
                >
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
                  {moved.map((id) => {
                    const tab = byId.get(id);
                    if (!tab) return null;
                    return (
                      <TabItem
                        key={id}
                        tab={tab}
                        moved
                        source={sourceNames?.[id]}
                        onRemove={() => dropFromAssign(i, id)}
                      />
                    );
                  })}
                  {same.length > 0 && (
                    <>
                      <button
                        onClick={() => toggle(a.taskId)}
                        className="flex items-center gap-1.5 px-2 py-1 text-[11px] opacity-55 hover:opacity-80"
                      >
                        <span className="font-mono">{expanded.has(a.taskId) ? '▾' : '▸'}</span>
                        {t('aiPlan.unchangedFold', { n: same.length })}
                      </button>
                      {expanded.has(a.taskId) &&
                        same.map((id) => {
                          const tab = byId.get(id);
                          if (!tab) return null;
                          return <TabItem key={id} tab={tab} dim />;
                        })}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {unclear.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-40 mb-1">
                {t('aiPlan.unclear')}
              </div>
              <div className="rounded-lg border border-black/10 dark:border-white/10 p-1.5">
                {unclear.map((u) => {
                  const tab = byId.get(u.tabId);
                  if (!tab) return null;
                  return (
                    <div key={u.tabId} className="flex items-center gap-2 px-2 py-1">
                      <Favicon url={tab.url} title={tab.title} faviconUrl={tab.faviconUrl} />
                      <span className="flex-1 truncate text-[12.5px] opacity-70">{tab.title}</span>
                      {u.reason && (
                        <span
                          className="shrink-0 max-w-[45%] truncate text-[10.5px] opacity-40"
                          title={u.reason}
                        >
                          {u.reason}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {noChanges && (
            <div className="py-6 text-center text-[12.5px] opacity-45">{t('aiPlan.noChanges')}</div>
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
            disabled={noChanges}
            className="px-2.5 py-1 rounded-md text-[12px] bg-accent text-white hover:opacity-90 disabled:opacity-40"
          >
            {movedCount > 0 ? t('aiPlan.applyN', { n: movedCount }) : t('aiPlan.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
