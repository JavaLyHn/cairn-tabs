import { useRef, useState } from 'react';
import type { Context, TabRecord } from '@/shared/types';
import { INBOX_ID } from '@/shared/types';
import { TabRow } from './TabRow';
import { domainSummary, colorHex } from '../util';

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
  onAiSuggestName?: () => Promise<string | null>; // AI 命名:返回建议名(不自动应用)
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
  onAiSuggestName,
}: Props) {
  const [collapsed, setCollapsed] = useState(variant === 'archived');
  const [dragOver, setDragOver] = useState(false);
  const [aiNaming, setAiNaming] = useState(false);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isInbox = context.id === INBOX_ID;
  const canDrop = variant !== 'archived';

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
        className="group/head flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
        onClick={() => {
          if (!editing) setCollapsed((c) => !c);
        }}
      >
        {/* 命名簇左侧 2px 边条,颜色 = 其原生分组颜色(双向同步的视觉体现) */}
        {!isInbox && (
          <div
            className="w-0.5 self-stretch rounded"
            style={{ backgroundColor: colorHex(context.color), opacity: variant === 'archived' ? 0.4 : 1 }}
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
              defaultValue={context.name}
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
                title="AI 命名(据任务里的标签建议)"
                disabled={aiNaming}
                // mousedown 不让 input 失焦(否则会触发 commit 提前退出编辑)
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setAiNaming(true);
                  const name = await onAiSuggestName();
                  setAiNaming(false);
                  if (name && inputRef.current) {
                    inputRef.current.value = name;
                    inputRef.current.focus();
                    inputRef.current.select();
                  }
                }}
                className="shrink-0 text-[11px] text-accent hover:underline disabled:opacity-40"
              >
                {aiNaming ? '…' : '✦'}
              </button>
            )}
          </div>
        ) : (
          <span className={`flex-1 truncate font-medium ${variant === 'archived' ? 'opacity-60' : ''}`}>
            {context.name}
          </span>
        )}

        <span className="font-mono text-[11px] opacity-40 shrink-0">{tabs.length}</span>

        {/* hover 操作(点击不触发折叠) */}
        <div
          className="hidden group-hover/head:flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {variant === 'archived' ? (
            <>
              <button
                onClick={onRestore}
                className="text-[11px] text-accent hover:underline"
                title="恢复任务"
              >
                恢复
              </button>
              <button
                onClick={onExport}
                className="text-[11px] opacity-60 hover:opacity-100"
                title="导出为 Markdown(复制到剪贴板)"
              >
                导出
              </button>
              <button
                onClick={onDelete}
                className="text-[11px] opacity-40 hover:opacity-100 hover:text-red-500"
                title="删除任务(彻底移除)"
              >
                删
              </button>
            </>
          ) : (
            <>
              {isInbox && aiEnabled && tabs.length > 0 && (
                <button
                  onClick={onAiOrganize}
                  disabled={aiBusy}
                  className="text-[11px] text-accent hover:underline disabled:opacity-60 disabled:no-underline"
                  title="用 AI 把零散标签分组"
                >
                  {aiBusy ? '✦ 分析中…' : '✦ AI 整理'}
                </button>
              )}
              {isInbox && tabs.length > 0 && (
                <button
                  onClick={onArchiveAll}
                  className="text-[11px] opacity-60 hover:opacity-100"
                  title="收纳全部零散标签(存为一个暂存任务)"
                >
                  收纳全部
                </button>
              )}
              {!isInbox && (
                <button
                  onClick={onStartEdit}
                  className="text-[11px] opacity-60 hover:opacity-100"
                  title="改名"
                >
                  改名
                </button>
              )}
              {!isInbox && (
                <button
                  onClick={onExport}
                  className="text-[11px] opacity-60 hover:opacity-100"
                  title="导出为 Markdown(复制到剪贴板)"
                >
                  导出
                </button>
              )}
              {!isInbox && (
                <button
                  onClick={onArchive}
                  className="text-[11px] opacity-60 hover:opacity-100"
                  title="收纳(归档并关闭)"
                >
                  收纳
                </button>
              )}
              {!isInbox && (
                <button
                  onClick={onDelete}
                  className="text-[11px] opacity-40 hover:opacity-100 hover:text-red-500"
                  title="删除任务(标签退回未分类)"
                >
                  删
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
            <div className="px-2 py-1 text-[11.5px] opacity-30">拖标签到这里</div>
          ) : (
            tabs.map((t) => (
              <TabRow
                key={t.id}
                tab={t}
                dupState={dupMarks.get(t.id)}
                portMap={portMap}
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
