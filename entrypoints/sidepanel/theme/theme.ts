// 外观偏好:仅主题模式。设计语言为单色,强调色由 CSS 随 data-theme 反相,不可配置。
// 纯 UI 偏好,存 chrome.storage.local(与界面语言同机制,不入 SW 快照、不碰 DB)。

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const DEFAULT_MODE: ThemeMode = 'auto';
export const THEME_MODE_KEY = 'uiThemeMode';

const MODES = new Set<ThemeMode>(['auto', 'light', 'dark']);

export function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === 'string' && MODES.has(v as ThemeMode);
}

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return systemDark ? 'dark' : 'light';
}

// ── DOM 应用(在 :root/documentElement 上,Tailwind 的 dark: 变体随之生效) ──

export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export function systemPrefersDark(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

// ── 持久化(chrome.storage.local) ──

export async function loadAppearance(): Promise<{ mode: ThemeMode }> {
  try {
    const r = await chrome.storage.local.get([THEME_MODE_KEY]);
    return {
      mode: isThemeMode(r[THEME_MODE_KEY]) ? (r[THEME_MODE_KEY] as ThemeMode) : DEFAULT_MODE,
    };
  } catch {
    return { mode: DEFAULT_MODE };
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  void chrome.storage.local.set({ [THEME_MODE_KEY]: mode });
}
