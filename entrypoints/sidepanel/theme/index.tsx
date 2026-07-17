// 外观运行时:ThemeProvider + useTheme。主题模式与强调色是纯 UI 偏好,存 chrome.storage.local
// (与界面语言同机制,不入 SW 快照)。见 spec 2026-07-17。

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { logDebug } from '@/shared/log';
import {
  type ThemeMode,
  DEFAULT_MODE,
  DEFAULT_ACCENT,
  loadAppearance,
  saveThemeMode,
  saveAccent,
  applyTheme,
  applyAccent,
  resolveTheme,
  resolveAccentHex,
  systemPrefersDark,
} from './theme';

export interface ThemeValue {
  mode: ThemeMode;
  accent: string; // 预设 id 或 #hex
  setMode: (m: ThemeMode) => void;
  setAccent: (pref: string) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({
  children,
  initialMode,
  initialAccent,
}: {
  children: ReactNode;
  /** 测试用:固定初值并跳过 storage 读取,使断言可复现。 */
  initialMode?: ThemeMode;
  initialAccent?: string;
}): ReactNode {
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? DEFAULT_MODE);
  const [accent, setAccentState] = useState<string>(initialAccent ?? DEFAULT_ACCENT);
  const fixed = initialMode !== undefined || initialAccent !== undefined;

  // 挂载:用持久化偏好覆盖(测试固定初值时跳过)
  useEffect(() => {
    if (fixed) return;
    loadAppearance()
      .then(({ mode: m, accent: a }) => {
        setModeState(m);
        setAccentState(a);
      })
      .catch((e) => logDebug('theme.load', e));
  }, [fixed]);

  // 应用强调色
  useEffect(() => {
    applyAccent(resolveAccentHex(accent));
  }, [accent]);

  // 应用主题;auto 时监听系统明暗变化
  useEffect(() => {
    applyTheme(resolveTheme(mode, systemPrefersDark()));
    if (mode !== 'auto') return;
    let mql: MediaQueryList;
    try {
      mql = matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => applyTheme(resolveTheme('auto', mql.matches));
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = (m: ThemeMode): void => {
    setModeState(m);
    saveThemeMode(m);
  };
  const setAccent = (pref: string): void => {
    setAccentState(pref);
    saveAccent(pref);
  };

  return (
    <ThemeContext.Provider value={{ mode, accent, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** 兜底:无 Provider 时回退默认、setter 无操作、不抛错(只包 I18nProvider 的既有组件测试安全)。 */
const FALLBACK: ThemeValue = {
  mode: DEFAULT_MODE,
  accent: DEFAULT_ACCENT,
  setMode: () => {},
  setAccent: () => {},
};

export function useTheme(): ThemeValue {
  return useContext(ThemeContext) ?? FALLBACK;
}
