import { useCallback, useEffect, useRef, useState } from 'react';
import type { Context, TabRecord } from '@/shared/types';
import { INBOX_ID } from '@/shared/types';
import { TabRow } from './TabRow';
import { DRAFT_CONTEXT_NAME } from '@/shared/messaging';
import { domainSummary, colorHex } from '../util';
import { useT } from '../i18n';

interface Props {
  context: Context;
  tabs: TabRecord[]; // 已按 tabOrder 排好
  variant: 'active' | 'inbox' | 'archived';
  dupMarks: Map<string, 'keeper' | 'redundant'>;
  portMap: Record<number, string>;
  viewTransitionName?: string;
  editing: boolean;
  onStartEdit: () => void;
  onCommitName: (name: string) => void; // 回车/失焦:确认命名(空草稿会被放弃)
  onCancelEdit: () => void; // Esc:取消(空草稿会被删除)
  onArchive: () => void;
  onArchiveAll: () => void; // 未分类:收纳全部零散标签
  onRestore: () => void;
  onExport: () => void; // 导出为 Markdown(复制到剪贴板)
  onDelete: () => void;
  onDropTab: (tabRecordId: string) => void;
  onActivateTab: (tabRecordId: string) => void;
  onCloseTab: (tabRecordId: string) => void;
  onToggleStar?: (tabRecordId: string, starred: boolean) => void;
  aiEnabled?: boolean;
  aiBusy?: boolean; // AI 整理进行中 → 按钮显示「分析中…」并禁用
  onAiOrganize?: () => void;
  onAiPrune?: () => void; // 命名任务:AI 整理本组(踢出不属于的到未分类)
  onAiSuggestName?: () => Promise<string | null>; // AI 命名:返回建议名(不自动应用)
  onAiCancel?: () => void; // 进行中点「✦ 取消」中止(复用 CANCEL_AI)
  collapseAll?: boolean; // 传了则折叠态随一键开关同步(归档组不传 → 不受影响)
  unclearReasons?: Record<string, string>; // tabId→理由:AI 整理拿不准、留原位的标签(仅未分类传)
}

export function ContextGroup({
  context,
  tabs,
  variant,
  dupMarks,
  portMap,
  viewTransitionName,
  editing,
  onStartEdit,
  onCommitName,
  onCancelEdit,
  onArchive,
  onArchiveAll,
  onRestore,
  onExport,
  onDelete,
  onDropTab,
  onActivateTab,
  onCloseTab,
  onToggleStar,
  aiEnabled,
  aiBusy,
  onAiOrganize,
  onAiPrune,
  onAiSuggestName,
  onAiCancel,
  collapseAll,
  unclearReasons,
}: Props) {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(variant === 'archived');
  // 一键展开/折叠:App 传 collapseAll 时随之同步;归档组不传 → guard 使其不受影响
  useEffect(() => {
    if (collapseAll !== undefined) setCollapsed(collapseAll);
  }, [collapseAll]);
  const [dragOver, setDragOver] = useState(false);
  const [aiNaming, setAiNaming] = useState(false);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingAiRef = useRef(false); // 操作行「✦ AI」点击 → 进入编辑态后自动跑一次 AI 命名

  // 跑一次 AI 命名 → 把建议名预填进输入框(不自动提交,用户回车确认)。编辑态内按钮与自动触发共用。
  const runAiNaming = useCallback(async () => {
    if (!onAiSuggestName) return;
    setAiNaming(true);
    try {
      const name = await onAiSuggestName();
      if (name && inputRef.current) {
        inputRef.current.value = name;
        inputRef.current.focus();
        inputRef.current.select();
      }
    } finally {
      setAiNaming(false); // 无论成功/失败/异常都复位,避免按钮卡在「✦ 取消」
    }
  }, [onAiSuggestName]);

  // 进入编辑态且带 pending(来自操作行「✦ AI」)→ 自动跑一次 AI 命名
  useEffect(() => {
    if (editing && pendingAiRef.current) {
      pendingAiRef.current = false;
      void runAiNaming();
    }
  }, [editing, runAiNaming]);

  const isInbox = context.id === INBOX_ID;
  // 所有分组(含已归档)都可接收拖拽:拖进已归档任务 = 把开着的标签直接归档进去(SW 侧处理)
  const canDrop = true;

  // 显示名本地化:未分类(名存于 DB)与「新任务」草稿哨兵按当前语言显示;其余用原名
  const displayName = isInbox
    ? t('context.inboxName')
    : context.name === DRAFT_CONTEXT_NAME
      ? t('draft.defaultName')
      : context.name;

  const toggleCollapsed = () => {
    if (!editing) setCollapsed((c) => !c);
  };

  return (
    <div
      className={`mb-1 rounded-md ${dragOver ? 'ring-2 ring-accent/60' : ''}`}
      style={viewTransitionName ? { viewTransitionName } : undefined}
      onDragOver={
        canDrop
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={() => setDragOver(false)}
      onDrop={
        canDrop
          ? (e) => {
              e.preventDefault();
              setDragOver(false);
              const id = e.dataTransfer.getData('text/cairn-tab-record');
              if (id) onDropTab(id);
            }
          : undefined
      }
    >
      {/* 簇头部:整行单击折叠/展开(编辑中除外) */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        className="group/head flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
        onClick={toggleCollapsed}
        onKeyDown={(e) => {
          if (editing) return; // 编辑中:键盘事件从改名输入框冒泡上来,别拦(否则空格打不进任务名)
          if (e.key === 'Enter') {
            toggleCollapsed();
          } else if (e.key === ' ') {
            e.preventDefault();
            toggleCollapsed();
          }
        }}
      >
        {/* 命名簇左侧 2px 边条,颜色 = 其原生分组颜色(双向同步的视觉体现) */}
        {!isInbox && (
          <div
            className="w-0.5 self-stretch rounded"
            style={{
              backgroundColor: colorHex(context.color),
              opacity: variant === 'archived' ? 0.4 : 1,
            }}
          />
        )}

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

        {editing ? (
          <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              autoFocus
              defaultValue={displayName}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => {
                if (cancelledRef.current) {
                  cancelledRef.current = false;
                  onCancelEdit();
                } else {
                  onCommitName(e.target.value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  cancelledRef.current = true;
                  e.currentTarget.blur();
                }
              }}
              className="flex-1 min-w-0 bg-transparent outline-none border-b border-accent"
            />
            {aiEnabled && !isInbox && onAiSuggestName && (
              <button
                aria-label={
                  aiNaming ? t('context.aiNaming.cancelAriaLabel') : t('context.aiNaming.ariaLabel')
                }
                title={aiNaming ? t('context.aiNaming.cancelTitle') : t('context.aiNaming.title')}
                // mousedown 不让 input 失焦(否则会触发 commit 提前退出编辑)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (aiNaming) {
                    onAiCancel?.(); // 进行中 → 中止;promise 以 null 结束,不回填
                    return;
                  }
                  void runAiNaming();
                }}
                className="shrink-0 text-[11px] text-accent hover:underline"
              >
                {aiNaming ? t('context.aiNaming.cancelButton') : t('context.aiNaming.button')}
              </button>
            )}
          </div>
        ) : (
          <span
            className={`flex-1 truncate font-medium ${variant === 'archived' ? 'opacity-60' : ''}`}
          >
            {displayName}
          </span>
        )}

        <span className="font-mono text-[11px] opacity-40 shrink-0">{tabs.length}</span>

        {/* hover 操作(点击不触发折叠) */}
        <div
          className="hidden group-hover/head:flex group-focus-within/head:flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {variant === 'archived' ? (
            <>
              <button
                onClick={onRestore}
                aria-label={t('context.restore')}
                className="text-[11px] text-accent hover:underline"
                title={t('context.restoreTitle')}
              >
                {t('context.restore')}
              </button>
              <button
                onClick={onExport}
                aria-label={t('context.export')}
                className="text-[11px] opacity-60 hover:opacity-100"
                title={t('context.exportTitle')}
              >
                {t('context.export')}
              </button>
              <button
                onClick={onDelete}
                aria-label={t('context.delete')}
                className="text-[11px] opacity-40 hover:opacity-100 hover:text-red-500"
                title={t('context.archivedDeleteTitle')}
              >
                {t('context.delete')}
              </button>
            </>
          ) : (
            <>
              {isInbox && aiEnabled && tabs.length > 0 && (
                <button
                  onClick={onAiOrganize}
                  disabled={aiBusy}
                  aria-label={aiBusy ? t('context.ai.organizeBusy') : t('context.ai.organize')}
                  className="text-[11px] text-accent hover:underline disabled:opacity-60 disabled:no-underline"
                  title={t('context.ai.organizeTitle')}
                >
                  {aiBusy ? t('context.ai.organizeBusy') : t('context.ai.organize')}
                </button>
              )}
              {isInbox && tabs.length > 0 && (
                <button
                  onClick={onArchiveAll}
                  aria-label={t('context.archiveAll')}
                  className="text-[11px] opacity-60 hover:opacity-100"
                  title={t('context.archiveAllTitle')}
                >
                  {t('context.archiveAll')}
                </button>
              )}
              {!isInbox &&
                !editing &&
                aiEnabled &&
                onAiPrune &&
                tabs.some((tab) => tab.chromeTabId != null && !tab.starred && !tab.pinned) && (
                  <button
                    onClick={onAiPrune}
                    disabled={aiBusy}
                    aria-label={aiBusy ? t('context.ai.organizeBusy') : t('context.ai.organize')}
                    className="text-[11px] text-accent hover:underline disabled:opacity-60 disabled:no-underline"
                    title={t('context.ai.pruneTitle')}
                  >
                    {aiBusy ? t('context.ai.organizeBusy') : t('context.ai.organize')}
                  </button>
                )}
              {!isInbox && !editing && aiEnabled && onAiSuggestName && tabs.length > 0 && (
                <button
                  onClick={() => {
                    pendingAiRef.current = true; // 进入编辑态后自动跑 AI 命名(见 effect)
                    onStartEdit();
                  }}
                  aria-label={t('context.aiRename')}
                  className="text-[11px] text-accent hover:underline"
                  title={t('context.aiRenameTitle')}
                >
                  {t('context.aiNaming.button')}
                </button>
              )}
              {!isInbox && (
                <button
                  onClick={onStartEdit}
                  aria-label={t('context.rename')}
                  className="text-[11px] opacity-60 hover:opacity-100"
                  title={t('context.renameTitle')}
                >
                  {t('context.rename')}
                </button>
              )}
              {!isInbox && (
                <button
                  onClick={onExport}
                  aria-label={t('context.export')}
                  className="text-[11px] opacity-60 hover:opacity-100"
                  title={t('context.exportTitle')}
                >
                  {t('context.export')}
                </button>
              )}
              {!isInbox && (
                <button
                  onClick={onArchive}
                  aria-label={t('context.archive')}
                  className="text-[11px] opacity-60 hover:opacity-100"
                  title={t('context.archiveTitle')}
                >
                  {t('context.archive')}
                </button>
              )}
              {!isInbox && (
                <button
                  onClick={onDelete}
                  aria-label={t('context.delete')}
                  className="text-[11px] opacity-40 hover:opacity-100 hover:text-red-500"
                  title={t('context.deleteTitle')}
                >
                  {t('context.delete')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 折叠态显示域名摘要 */}
      {collapsed && tabs.length > 0 && (
        <div className="px-2 pb-1.5 pl-7 font-mono text-[11px] opacity-40 truncate">
          {domainSummary(tabs)}
        </div>
      )}

      {/* 展开态标签列表 */}
      {!collapsed && (
        <div className="pl-5 pr-1 pb-1">
          {tabs.length === 0 ? (
            <div className="px-2 py-1 text-[11.5px] opacity-30">{t('context.dropHint')}</div>
          ) : (
            tabs.map((t) => (
              <TabRow
                key={t.id}
                tab={t}
                dupState={dupMarks.get(t.id)}
                portMap={portMap}
                unclearReason={unclearReasons?.[t.id]}
                onActivate={() => onActivateTab(t.id)}
                onClose={() => onCloseTab(t.id)}
                onToggleStar={
                  variant !== 'archived' && onToggleStar
                    ? () => onToggleStar(t.id, !t.starred)
                    : undefined
                }
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
