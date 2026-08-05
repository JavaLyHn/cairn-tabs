// 外观运行时:ThemeProvider + useTheme。主题模式是纯 UI 偏好,存 chrome.storage.local
// (与界面语言同机制,不入 SW 快照)。强调色为单色系统,由 CSS 随 data-theme 反相。

import {
  useMemo,
  useCallback,
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { logDebug } from '@/shared/log';
import {
  type ThemeMode,
  DEFAULT_MODE,
  loadAppearance,
  saveThemeMode,
  applyTheme,
  resolveTheme,
  systemPrefersDark,
} from './theme';

export interface ThemeValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({
  children,
  initialMode,
}: {
  children: ReactNode;
  /** 测试用:固定初值并跳过 storage 读取,使断言可复现。 */
  initialMode?: ThemeMode;
}): ReactNode {
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? DEFAULT_MODE);
  const fixed = initialMode !== undefined;

  // 挂载:用持久化偏好覆盖(测试固定初值时跳过)
  useEffect(() => {
    if (fixed) return;
    loadAppearance()
      .then(({ mode: m }) => setModeState(m))
      .catch((e) => logDebug('theme.load', e));
  }, [fixed]);

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

  const setMode = useCallback((m: ThemeMode): void => {
    setModeState(m);
    saveThemeMode(m);
  }, []);

  // 模式不变时保持同一引用,避免消费者无谓重渲染
  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** 兜底:无 Provider 时回退默认、setter 无操作、不抛错(只包 I18nProvider 的既有组件测试安全)。 */
const FALLBACK: ThemeValue = {
  mode: DEFAULT_MODE,
  setMode: () => {},
};

export function useTheme(): ThemeValue {
  return useContext(ThemeContext) ?? FALLBACK;
}
