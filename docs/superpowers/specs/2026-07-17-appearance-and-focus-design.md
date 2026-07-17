# 外观设置 + 焦点环修复 — 设计

日期: 2026-07-17
状态: 已批准,待实现

## 背景 / 动机

两件事,一次做:

1. **焦点绿框回归**:Phase 1 a11y 加了全局 `:focus-visible` 描边(强调色)。设置弹窗关闭时 `useDialog`
   会把焦点**程序化**还给齿轮触发按钮;Chromium 把程序化聚焦当键盘聚焦处理,于是 `:focus-visible`
   绿环亮起并**停留**在齿轮上,直到用户点别处。鼠标用户看到一个甩不掉的绿框。
2. **外观可定制**:当前强调色硬编码单一 teal(`#1d9e75`),明暗只跟随系统。用户要能改主题模式和强调色。

## 目标

- 关闭弹窗后,鼠标用户不再看到残留焦点环;键盘用户仍正确回焦(不牺牲无障碍)。
- 设置里新增「外观」分组:主题模式(跟随系统 / 浅色 / 深色)+ 强调色(7 预设 + 自定义 hex)。
- 即时全局生效、持久化、零闪帧。

## 非目标

- 不改任务分组色(`colorHex`)—— 它与 Chrome 原生分组一一对应,是双向同步的视觉体现,必须不变。
- 不做密度 / 字体 / 圆角等其它外观项(YAGNI)。
- 自定义 hex 不加对比度校验(用户选了「自由」这一档,预设已保证对比度)。

## 方案

### A. 焦点环修复(`hooks/useDialog.ts`)

在 effect 打开时记录触发元素**是否处于 `:focus-visible`**(即是否由键盘聚焦);仅当是键盘时,关闭
才回焦:

```ts
const prev = document.activeElement as HTMLElement | null;
let restoreFocus = false;
try {
  restoreFocus = !!prev && typeof prev.matches === 'function' && prev.matches(':focus-visible');
} catch {
  restoreFocus = false; // jsdom 等不支持该伪类时安全降级
}
// …
return () => {
  window.removeEventListener('keydown', onKey);
  if (restoreFocus) prev?.focus?.();
};
```

- 鼠标点开:触发按钮非 `:focus-visible` → 关闭不回焦 → 无残留绿框。
- 键盘(Tab+Enter/Space)打开:触发按钮为 `:focus-visible` → 关闭回焦(符合无障碍)。
- 一处改动,惠及所有用 `useDialog` 的弹窗(设置 / 导出 / AI / 搜索)。
- 现有 `use-dialog.test.tsx` 不断言关闭回焦,不受影响;`matches` 加 try/catch 防 jsdom 抛错。

### B. 外观机制

**强调色**:运行时把 `--color-accent` 写到 `document.documentElement` 内联样式。Tailwind v4 的
`bg-accent`/`text-accent`/`ring-accent`/`border-accent` 及 `:focus-visible` 描边全部走
`var(--color-accent)` → 一改全亮,零组件改动。`@theme` 里的 teal 仍是默认兜底。

**主题模式**:把 Tailwind `dark:` 变体从「跟随 `prefers-color-scheme`」改为「跟随
`<html data-theme="dark">`」;`body` 背景与 `color-scheme` 同步。运行时把「解析后的 light|dark」
写到 `data-theme`(跟随系统时解析系统值并监听变化)。

`style.css`:
```css
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));
/* 显式主题 */
[data-theme='dark'] body { background:#17181a; color:#e4e4e7; }
[data-theme='light'] body { background:#fff; color:#1a1a1a; }
/* JS 未接管前(空 index.html)按系统兜底,防冷启动闪白 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) body { background:#17181a; color:#e4e4e7; }
}
```
组件永远在 `data-theme` 就位后才首帧(见持久化),故不会有组件级明暗闪帧。

### C. 逻辑与持久化(`theme/theme.ts`,纯函数 + storage)

- `ThemeMode = 'auto' | 'light' | 'dark'`;`AccentId = 'teal'|'blue'|'indigo'|'violet'|'rose'|'amber'|'slate'`。
- `ACCENTS: { id: AccentId; hex: string }[]`,`DEFAULT_ACCENT_HEX = '#1d9e75'`。
- 强调色偏好存单一字符串:预设 id **或** `#hex`(以 `#` 开头即自定义)。
- `isValidHex(s)`:`/^#([0-9a-f]{3}|[0-9a-f]{6})$/i`。
- `resolveAccentHex(pref): string`:`#` 开头且合法 → 原值;否则查预设;查不到 → 默认。
- `resolveTheme(mode, systemDark): 'light' | 'dark'`:auto → 看 systemDark;否则原值。
- `applyTheme(resolved)`:设 `documentElement.dataset.theme` + `style.colorScheme`。
- `applyAccent(hex)`:设 `documentElement.style` 的 `--color-accent`。
- storage 键 `uiThemeMode` / `uiAccent`,存 `chrome.storage.local`,**与界面语言同机制**,不入 SW 快照、不碰 DB(架构不变量:纯 UI 偏好例外,已有 `uiLocale` 先例)。
- `loadAppearance(): Promise<{ mode, accent }>`;`saveThemeMode` / `saveAccent`。

### D. Provider(`theme/index.tsx`)

- `ThemeProvider`(props 可选 `initialMode`/`initialAccent` 供测试固定、跳过 storage,仿 `I18nProvider`)。
  - 挂载读 storage → applyTheme/applyAccent;`mode==='auto'` 时监听 `matchMedia('(prefers-color-scheme: dark)')` 变化重解析。
  - 提供 `{ mode, setMode, accent, setAccent }`;setter 立即 apply + 写 storage。
- `useTheme()`:无 Provider 时回退默认(no-op setters),**不抛错**(仿 `useT` 的 FALLBACK,保证
  只包 I18nProvider 的既有组件测试不炸)。

### E. `main.tsx`

挂载前 `await loadAppearance()` 并 `applyTheme`/`applyAccent`,再 `createRoot().render`,消除主题闪帧。
用 `<ThemeProvider initial…>` 包住 `<App/>`(在 `<I18nProvider>` 内层)。

### F. 设置 UI(`SettingsPanel.tsx`)

「外观」`<Group>` 置于「语言」之上:
- 主题模式:三按钮分段控件(跟随系统 / 浅色 / 深色),当前档高亮(强调色底)。
- 强调色:7 个圆点 swatch(选中显对钩/白心 + 强调色描边),每个带本地化 `aria-label`(色名)。
- 自定义:`<input type="color">` + `#hex` 文本框;合法即 apply,非法忽略。

### G. i18n(4 语,en 为类型源,强制对齐)

新增键:`settings.group.appearance`、`settings.appearance.theme.{title,desc,auto,light,dark}`、
`settings.appearance.accent.{title,desc,custom,customAria}`、`settings.appearance.accent.name.{teal,blue,indigo,violet,rose,amber,slate}`。

## 强调色预设(明暗均验证)

teal `#1d9e75`(默认) · blue `#3b82f6` · indigo `#6366f1` · violet `#8b5cf6` ·
rose `#f43f5e` · amber `#d97706` · slate `#64748b`。

## 测试

- `tests/theme.test.ts`:`isValidHex`、`resolveAccentHex`(预设 / 合法自定义 / 非法→默认 / 未知→默认)、
  `resolveTheme`(auto+系统明/暗、强制 light/dark)。
- `tests/appearance-settings.test.tsx`:`ThemeProvider initial…` 下渲染 `SettingsPanel`,点主题按钮 /
  强调色 swatch → 断言 `documentElement` 的 `data-theme` / `--color-accent` 变化。
- 回归:现有 `settings-panel.test.tsx`(仅 I18nProvider)靠 `useTheme` FALLBACK 继续通过。

## 风险 / 取舍

- 自定义 hex 可能低对比度 —— 明确接受(用户选此档)。
- `:focus-visible` matches 在极老环境不支持 —— try/catch 降级为「不回焦」,生产 Chrome/Edge 均支持。
- 冷启动首帧:`await loadAppearance()` 增加极小延迟换取零闪帧,可接受。
