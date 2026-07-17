import { APP_NAME } from '@/shared/meta';

interface Props {
  className?: string;
}

/**
 * 自有品牌字标:内联叠石图标 + Cairn Tabs 文字。
 * 图标背后一圈青绿光晕「呼吸」明灭(见 spec 2026-07-17-brandmark-breathe);
 * 强调色走 var(--color-accent),随外观 / 深浅主题变化;动效经 prefers-reduced-motion 守卫。
 * 用于空状态页(而非 Chrome 侧栏标题栏 —— 那是浏览器 chrome,扩展不可控)。
 */
export function BrandMark({ className }: Props) {
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className ?? ''}`}>
      <span className="brand-breathe relative inline-flex">
        <svg
          width="26"
          height="26"
          viewBox="0 0 128 128"
          className="relative block text-accent"
          aria-hidden="true"
        >
          <rect x="42" y="24" width="44" height="20" rx="10" fill="currentColor" />
          <rect x="31" y="52" width="66" height="22" rx="11" fill="currentColor" />
          <rect x="20" y="82" width="88" height="24" rx="12" fill="currentColor" />
        </svg>
      </span>
      <span className="text-[17px] font-bold tracking-tight">{APP_NAME}</span>
    </span>
  );
}
