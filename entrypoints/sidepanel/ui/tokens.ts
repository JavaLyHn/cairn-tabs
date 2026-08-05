// 全局交互样式的单一来源。顶栏、任务菜单、对话框与设置页共用同一套参数,
// 避免各处各写一份 hover 底色与圆角(此前曾出现 6 种 hover 写法)。

/** 统一的悬停底色。 */
export const HOVER_BG = 'hover:bg-black/[0.055] dark:hover:bg-white/[0.085]';

/** 幽灵按钮:无边框、悬停加浅底。图标 + 文字或纯文字均适用。 */
export const GHOST_BTN =
  'shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] transition-colors ' +
  `opacity-65 hover:opacity-100 disabled:opacity-40 ${HOVER_BG}`;

/** 行内次要操作(移除、取消这组…):比 GHOST_BTN 更小更淡。 */
export const MINI_BTN =
  'shrink-0 px-1.5 py-0.5 rounded-lg text-[11px] transition-colors ' +
  `opacity-50 hover:opacity-100 ${HOVER_BG}`;

/** 填充式输入框:默认浅底无边框,聚焦才描边。 */
export const FIELD =
  'w-full px-2.5 py-1.5 rounded-lg outline-none transition-colors ' +
  'bg-black/[0.045] dark:bg-white/[0.07] border border-transparent focus:border-accent/50';

/** 实心主操作按钮(单色系统:accent 即前景色,故文字用 on-accent)。 */
export const PRIMARY_BTN =
  'shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-opacity ' +
  'bg-accent text-on-accent hover:opacity-90 disabled:opacity-40';
