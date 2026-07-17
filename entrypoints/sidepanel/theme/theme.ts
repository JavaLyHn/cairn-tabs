// 外观偏好:主题模式 + 强调色。纯 UI 偏好,存 chrome.storage.local(与界面语言同机制,
// 不入 SW 快照、不碰 DB)。纯函数部分可单测。见 spec 2026-07-17。

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type AccentId = 'teal' | 'blue' | 'indigo' | 'violet' | 'rose' | 'amber' | 'slate';

/** 强调色预设(明暗两模式均验证过对比度)。teal 为既有默认。 */
export const ACCENTS: { id: AccentId; hex: string }[] = [
  { id: 'teal', hex: '#1d9e75' },
  { id: 'blue', hex: '#3b82f6' },
  { id: 'indigo', hex: '#6366f1' },
  { id: 'violet', hex: '#8b5cf6' },
  { id: 'rose', hex: '#f43f5e' },
  { id: 'amber', hex: '#d97706' },
  { id: 'slate', hex: '#64748b' },
];

export const DEFAULT_ACCENT: AccentId = 'teal';
export const DEFAULT_ACCENT_HEX = '#1d9e75';
export const DEFAULT_MODE: ThemeMode = 'auto';

export const THEME_MODE_KEY = 'uiThemeMode';
export const ACCENT_KEY = 'uiAccent';

const MODES: ThemeMode[] = ['auto', 'light', 'dark'];
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHex(s: string): boolean {
  return HEX_RE.test(s.trim());
}

export function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === 'string' && MODES.includes(v as ThemeMode);
}

/** 强调色偏好可为预设 id 或以 # 开头的自定义 hex。解析为实际 hex,任何异常回退默认。 */
export function resolveAccentHex(pref: string | undefined): string {
  if (!pref) return DEFAULT_ACCENT_HEX;
  const p = pref.trim();
  if (p.startsWith('#')) return isValidHex(p) ? p.toLowerCase() : DEFAULT_ACCENT_HEX;
  return ACCENTS.find((a) => a.id === p)?.hex ?? DEFAULT_ACCENT_HEX;
}

/** 偏好命中的预设 id(自定义 hex 则为 null,供 UI 判断是否显示「自定义」选中态)。 */
export function accentPresetId(pref: string | undefined): AccentId | null {
  if (!pref) return DEFAULT_ACCENT;
  const p = pref.trim();
  if (p.startsWith('#')) {
    const hit = ACCENTS.find((a) => a.hex.toLowerCase() === p.toLowerCase());
    return hit ? hit.id : null;
  }
  return ACCENTS.find((a) => a.id === p)?.id ?? null;
}

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return systemDark ? 'dark' : 'light';
}

// ── DOM 应用(在 :root/documentElement 上,Tailwind 的 var(--color-accent) 与 dark: 变体随之生效) ──

export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export function applyAccent(hex: string): void {
  document.documentElement.style.setProperty('--color-accent', hex);
}

export function systemPrefersDark(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

// ── 持久化(chrome.storage.local) ──

export async function loadAppearance(): Promise<{ mode: ThemeMode; accent: string }> {
  try {
    const r = await chrome.storage.local.get([THEME_MODE_KEY, ACCENT_KEY]);
    const mode = isThemeMode(r[THEME_MODE_KEY]) ? (r[THEME_MODE_KEY] as ThemeMode) : DEFAULT_MODE;
    const accent = typeof r[ACCENT_KEY] === 'string' ? (r[ACCENT_KEY] as string) : DEFAULT_ACCENT;
    return { mode, accent };
  } catch {
    return { mode: DEFAULT_MODE, accent: DEFAULT_ACCENT };
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  void chrome.storage.local.set({ [THEME_MODE_KEY]: mode });
}

export function saveAccent(pref: string): void {
  void chrome.storage.local.set({ [ACCENT_KEY]: pref });
}
