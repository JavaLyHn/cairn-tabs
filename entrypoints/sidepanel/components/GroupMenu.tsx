import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CONTEXT_PALETTE, type ContextColor } from '@/shared/types';
import { colorHex } from '../util';
import { useT } from '../i18n';

interface Props {
  name: string;
  color: ContextColor;
  archived: boolean;
  onRename: (name: string) => void;
  onSetColor: (color: ContextColor) => void;
  onExport: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onAiPrune?: () => void; // AI 整理本组:把不属于的标签踢回未分类
  onAiSuggestName?: () => Promise<string | null>; // AI 命名:返回建议名,预填进改名框
  onAiCancel?: () => void; // 命名进行中点击中止(复用 CANCEL_AI)
  aiBusy?: boolean;
  onClose: () => void;
}

/** 菜单项:图标 + 文字。danger 用于破坏性操作(单色系统里唯一保留的彩色)。 */
function Item({
  icon,
  onClick,
  danger,
  disabled,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[12.5px]
                  transition-colors disabled:opacity-40
                  hover:bg-black/[0.055] dark:hover:bg-white/[0.085]
                  ${danger ? 'text-danger' : ''}`}
    >
      <span className={`shrink-0 ${danger ? '' : 'opacity-55'}`}>{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}

/** 统一的线框图标外壳,保证描边粗细与尺寸一致。 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-[15px] h-[15px] block"
    >
      {children}
    </svg>
  );
}

/**
 * 任务的「更多」菜单:改名 + 换色 + 操作项。
 * 对齐 Chrome 原生标签分组的菜单心智 —— 名称与颜色是分组自身的属性,直接在菜单里改;
 * 其余是对整个分组的动作。颜色写回后经 syncGroupColor 推到原生分组。
 */
export function GroupMenu({
  name,
  color,
  archived,
  onRename,
  onSetColor,
  onExport,
  onArchive,
  onRestore,
  onDelete,
  onAiPrune,
  onAiSuggestName,
  onAiCancel,
  aiBusy,
  onClose,
}: Props) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(name);
  const [aiNaming, setAiNaming] = useState(false);

  // 点击面板外或按 Esc 关闭
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const commitName = () => {
    const v = draft.trim();
    if (v && v !== name) onRename(v);
  };

  /** 跑一次 AI 命名 → 建议名预填进改名框(不自动提交,用户回车确认)。 */
  const runAiNaming = async () => {
    if (!onAiSuggestName) return;
    setAiNaming(true);
    try {
      const suggested = await onAiSuggestName();
      if (suggested) setDraft(suggested);
    } finally {
      setAiNaming(false); // 成功/失败/中止都复位,避免卡在「取消」态
    }
  };

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  // 文案自带 ✦ 前缀,这里已有图标,去掉避免重复
  const plain = (s: string) => s.replace('✦', '').trim();

  return (
    <div
      ref={ref}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      className="absolute right-1 top-9 z-30 w-[228px] p-1.5 rounded-2xl
                 bg-white dark:bg-neutral-900
                 border border-black/8 dark:border-white/12
                 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.28),0_2px_8px_-2px_rgb(0_0_0/0.12)]"
    >
      <div className="px-0.5 pt-0.5 pb-1.5">
        <div className="flex items-center gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitName();
                onClose();
              }
            }}
            aria-label={t('context.rename')}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-[13px] font-medium rounded-lg outline-none
                       bg-black/[0.045] dark:bg-white/[0.07]
                       border border-transparent transition-colors
                       focus:border-accent/50 focus:bg-white dark:focus:bg-neutral-900"
          />
          {onAiSuggestName && !archived && (
            <button
              aria-label={
                aiNaming ? t('context.aiNaming.cancelAriaLabel') : t('context.aiNaming.ariaLabel')
              }
              title={aiNaming ? t('context.aiNaming.cancelTitle') : t('context.aiNaming.title')}
              // mousedown 不让 input 失焦(否则会触发 commit 提前收起菜单)
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (aiNaming) {
                  onAiCancel?.(); // 进行中 → 中止;promise 以 null 结束,不回填
                  return;
                }
                void runAiNaming();
              }}
              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors
                         opacity-55 hover:opacity-100 hover:bg-black/[0.055] dark:hover:bg-white/[0.085]"
            >
              {aiNaming ? (
                <span className="text-[11px] leading-none">✕</span>
              ) : (
                <Icon>
                  <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
                  <path d="M18.5 15.5 19.4 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5Z" />
                </Icon>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 mt-2 px-0.5">
          {CONTEXT_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => onSetColor(c)}
              aria-label={c}
              aria-pressed={c === color}
              title={c}
              className="relative w-5 h-5 rounded-full flex items-center justify-center
                         transition-transform hover:scale-110"
            >
              <span
                style={{ backgroundColor: colorHex(c) }}
                className="w-[15px] h-[15px] rounded-full block"
              />
              {c === color && (
                <span className="absolute inset-0 rounded-full ring-[1.5px] ring-black/45 dark:ring-white/60" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-black/[0.07] dark:bg-white/[0.09] mx-1" />

      <div className="pt-1">
        {onAiPrune && !archived && (
          <Item
            icon={
              <Icon>
                <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
                <path d="M18.5 15.5 19.4 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5Z" />
              </Icon>
            }
            onClick={run(onAiPrune)}
            disabled={aiBusy}
          >
            {plain(aiBusy ? t('context.ai.organizeBusy') : t('context.ai.organize'))}
          </Item>
        )}
        <Item
          icon={
            <Icon>
              <path d="M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </Icon>
          }
          onClick={run(onExport)}
        >
          {plain(t('context.export'))}
        </Item>
        {archived ? (
          <Item
            icon={
              <Icon>
                <path d="M3 10a9 9 0 1 1 2.6 6.4" />
                <path d="M3 5v5h5" />
              </Icon>
            }
            onClick={run(onRestore)}
          >
            {plain(t('context.restore'))}
          </Item>
        ) : (
          <Item
            icon={
              <Icon>
                <path d="M3 6h18v3H3zM5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
              </Icon>
            }
            onClick={run(onArchive)}
          >
            {plain(t('context.archive'))}
          </Item>
        )}
      </div>

      <div className="h-px bg-black/[0.07] dark:bg-white/[0.09] mx-1 my-1" />

      <Item
        icon={
          <Icon>
            <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M10 11v6M14 11v6" />
          </Icon>
        }
        onClick={run(onDelete)}
        danger
      >
        {plain(t('context.delete'))}
      </Item>
    </div>
  );
}
