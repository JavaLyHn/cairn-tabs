import { useState } from 'react';
import type { Context, TabRecord } from '@/shared/types';
import { INBOX_ID } from '@/shared/types';
import { TabRow } from './TabRow';
import { domainSummary, colorHex } from '../util';

interface Props {
  context: Context;
  tabs: TabRecord[]; // 已按 tabOrder 排好
  variant: 'active' | 'inbox' | 'archived';
  duplicateIds: Set<string>;
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onDropTab: (tabRecordId: string) => void;
  onActivateTab: (tabRecordId: string) => void;
  onCloseTab: (tabRecordId: string) => void;
}

export function ContextGroup({
  context,
  tabs,
  variant,
  duplicateIds,
  editing,
  onStartEdit,
  onEndEdit,
  onArchive,
  onRestore,
  onRename,
  onDelete,
  onDropTab,
  onActivateTab,
  onCloseTab,
}: Props) {
  const [collapsed, setCollapsed] = useState(variant === 'archived');
  const [dragOver, setDragOver] = useState(false);

  const isInbox = context.id === INBOX_ID;
  const canDrop = variant !== 'archived';

  return (
    <div
      className={`mb-1 rounded-md ${dragOver ? 'ring-2 ring-accent/60' : ''}`}
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
      {/* 簇头部 */}
      <div className="group/head flex items-center gap-2 px-2 py-1.5">
        {/* 命名簇左侧 2px 边条,颜色 = 其原生分组颜色(双向同步的视觉体现) */}
        {!isInbox && (
          <div
            className="w-0.5 self-stretch rounded"
            style={{ backgroundColor: colorHex(context.color), opacity: variant === 'archived' ? 0.4 : 1 }}
          />
        )}

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="opacity-40 hover:opacity-80 w-3 shrink-0 text-[10px]"
          title={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? '▸' : '▾'}
        </button>

        {editing ? (
          <input
            autoFocus
            defaultValue={context.name}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              onRename(e.target.value);
              onEndEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') onEndEdit();
            }}
            className="flex-1 bg-transparent outline-none border-b border-accent"
          />
        ) : (
          <span
            className={`flex-1 truncate font-medium ${variant === 'archived' ? 'opacity-60' : ''}`}
            onDoubleClick={() => !isInbox && onStartEdit()}
            title={isInbox ? undefined : '双击改名'}
          >
            {context.name}
          </span>
        )}

        <span className="font-mono text-[11px] opacity-40 shrink-0">{tabs.length}</span>

        {/* hover 操作 */}
        <div className="hidden group-hover/head:flex items-center gap-1 shrink-0">
          {variant === 'archived' ? (
            <>
              <button
                onClick={onRestore}
                className="text-[11px] text-accent hover:underline"
                title="恢复整簇"
              >
                恢复
              </button>
              <button
                onClick={onDelete}
                className="text-[11px] opacity-40 hover:opacity-100 hover:text-red-500"
                title="删除归档簇(彻底移除)"
              >
                删
              </button>
            </>
          ) : (
            <>
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
                  title="删除簇(标签退回未分类)"
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
                isDuplicate={duplicateIds.has(t.id)}
                onActivate={() => onActivateTab(t.id)}
                onClose={() => onCloseTab(t.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
