import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Context, TabRecord } from '@/shared/types';
import { INBOX_ID } from '@/shared/types';
import { TabRow } from './TabRow';
import { DRAFT_CONTEXT_NAME } from '@/shared/messaging';
import { colorHex } from '../util';
import { FIELD } from '../ui/tokens';
import { GroupMenu } from './GroupMenu';
import { useT } from '../i18n';

/** 带文字的头部按钮:与顶栏「新建任务 / AI 整理」同一套参数。 */
const TEXT_BTN =
  'shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11.5px] transition-colors ' +
  'opacity-65 hover:opacity-100 hover:bg-black/[0.055] dark:hover:bg-white/[0.085] ' +
  'disabled:opacity-40';

/** 线框图标外壳,描边与尺寸对齐菜单与顶栏。 */
function HeadIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-[14px] h-[14px] shrink-0 block"
    >
      {children}
    </svg>
  );
}

/** 文案自带的 ✦ 前缀由图标承担,渲染时去掉。 */
const stripMark = (s: string) => s.replace(/^[+✦]\s*/, '');

/** 头部 hover 图标按钮:等宽方形命中区,悬停加浅底。 */
const ICON_BTN =
  'w-6 h-6 rounded-lg flex items-center justify-center opacity-55 hover:opacity-100 ' +
  'hover:bg-black/[0.055] dark:hover:bg-white/[0.085]';

interface Props {
  context: Context;
  tabs: TabRecord[]; // 已按 tabOrder 排好
  variant: 'active' | 'inbox' | 'archived';
  dupMarks: Map<string, 'keeper' | 'redundant'>;
  portMap: Record<number, string>;
  viewTransitionName?: string;
  editing: boolean;
  onCommitName: (name: string) => void; // 回车/失焦:确认命名(空草稿会被放弃)
  onCancelEdit: () => void; // Esc:取消(空草稿会被删除)
  onArchive: () => void;
  onArchiveAll: () => void; // 未分类:收纳全部零散标签
  onNewTab: () => void; // 在本任务内新建标签页
  onSetColor: (color: import('@/shared/types').ContextColor) => void;
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
  onAiCancel?: () => void; // 命名进行中点击中止(复用 CANCEL_AI)
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
  onCommitName,
  onCancelEdit,
  onArchive,
  onArchiveAll,
  onNewTab,
  onSetColor,
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
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);

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
      className={`relative mb-1 rounded-lg ${menuOpen ? 'z-30' : ''} ${dragOver ? 'ring-2 ring-accent/60' : ''}`}
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
        className="group/head flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none
                   rounded-lg transition-colors backdrop-blur-sm
                   hover:bg-black/[0.055] dark:hover:bg-white/[0.075]"
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
        {/* 组标识:圆形色块,底色 = 其原生分组颜色(双向同步的视觉体现)。
            未分类不建原生分组,用中性灰保持队形。 */}
        <span
          className={`w-[18px] h-[18px] shrink-0 rounded-full flex items-center justify-center
                      ${isInbox ? 'bg-black/10 dark:bg-white/15' : ''}`}
          style={
            isInbox
              ? undefined
              : {
                  backgroundColor: colorHex(context.color),
                  opacity: variant === 'archived' ? 0.4 : 1,
                }
          }
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-2.5 h-2.5 ${isInbox ? 'opacity-45' : 'text-white'}`}
          >
            <path d="m12 2 9 5-9 5-9-5 9-5Z" />
            <path d="m3 12 9 5 9-5" />
            <path d="m3 17 9 5 9-5" />
          </svg>
        </span>

        {editing ? (
          <div
            className="flex-1 flex items-center gap-1 min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
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
              className={`${FIELD} flex-1 min-w-0 text-[13.5px] font-semibold focus-visible:outline-none`}
            />
          </div>
        ) : (
          <span
            className={`flex-1 truncate font-semibold text-[13.5px] ${variant === 'archived' ? 'opacity-60' : ''}`}
          >
            {displayName}
          </span>
        )}

        {/* hover 操作(点击不触发折叠)。始终占位、仅切换透明度 ——
            用 hidden→flex 会让按钮凭空插入而挤动整行。 */}
        <div
          className="flex items-center gap-1 shrink-0 opacity-0 pointer-events-none
                     transition-opacity duration-150
                     group-hover/head:opacity-100 group-hover/head:pointer-events-auto
                     group-focus-within/head:opacity-100 group-focus-within/head:pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 未分类没有改名/换色/删除语义,保留它特有的两个批量动作,不收进菜单 */}
          {isInbox ? (
            <>
              {aiEnabled && tabs.length > 0 && (
                <button
                  onClick={onAiOrganize}
                  disabled={aiBusy}
                  aria-label={aiBusy ? t('context.ai.organizeBusy') : t('context.ai.organize')}
                  className={TEXT_BTN}
                  title={t('context.ai.organizeTitle')}
                >
                  <HeadIcon>
                    <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
                    <path d="M18.5 15.5 19.4 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5Z" />
                  </HeadIcon>
                  {stripMark(aiBusy ? t('context.ai.organizeBusy') : t('context.ai.organize'))}
                </button>
              )}
              {tabs.length > 0 && (
                <button
                  onClick={onArchiveAll}
                  aria-label={t('context.archiveAll')}
                  className={TEXT_BTN}
                  title={t('context.archiveAllTitle')}
                >
                  <HeadIcon>
                    <path d="M3 6h18v3H3zM5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
                  </HeadIcon>
                  {stripMark(t('context.archiveAll'))}
                </button>
              )}
            </>
          ) : (
            <>
              {variant !== 'archived' && (
                <button
                  onClick={onNewTab}
                  aria-label={t('context.newTab')}
                  title={t('context.newTabTitle')}
                  className={ICON_BTN}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    className="w-3.5 h-3.5"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={t('context.more')}
                aria-haspopup="menu"
                title={t('context.more')}
                className={ICON_BTN}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
                </svg>
              </button>
            </>
          )}
        </div>

        <span className="font-mono text-[11px] opacity-40 shrink-0">{tabs.length}</span>

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-3.5 h-3.5 shrink-0 opacity-35 transition-transform ${collapsed ? 'rotate-180' : ''}`}
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
      </div>

      {menuOpen && !isInbox && (
        <GroupMenu
          name={displayName}
          color={context.color}
          archived={variant === 'archived'}
          onRename={(v) => onCommitName(v)}
          onSetColor={onSetColor}
          onExport={onExport}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          onAiPrune={
            // AI 整理只动「可动标签」(活着、非★重点、非人工锁定);全无可动则无从整理,不给入口
            !editing &&
            aiEnabled &&
            onAiPrune &&
            tabs.some((tab) => tab.chromeTabId != null && !tab.starred && !tab.pinned)
              ? onAiPrune
              : undefined
          }
          onAiSuggestName={aiEnabled ? onAiSuggestName : undefined}
          onAiCancel={onAiCancel}
          aiBusy={aiBusy}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {/* 展开态标签列表 */}
      {!collapsed && (
        <div
          className={`ml-4 pl-3 pr-1 pb-1 border-l-2 ${
            isInbox ? 'border-black/10 dark:border-white/15' : ''
          }`}
          style={
            isInbox
              ? undefined
              : { borderColor: colorHex(context.color), opacity: variant === 'archived' ? 0.5 : 1 }
          }
        >
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
