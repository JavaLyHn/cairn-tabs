// i18n 运行时:Provider + useT。文案目录 en 为类型源,其余三语强制对齐(见 spec Phase 1a)。
// 界面语言是纯 UI 偏好,存 chrome.storage.local(不入 SW 快照,切换零闪帧)。

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { en, type Messages, type MessageKey } from './en';
import { zhCN } from './zh-CN';
import { ja } from './ja';
import { ko } from './ko';
import { type Locale, SUPPORTED, LOCALE_STORAGE_KEY, resolveInitialLocale } from './locales';
import { logDebug } from '@/shared/log';

export type { Messages, MessageKey } from './en';

const CATALOGS: Record<Locale, Messages> = { en, 'zh-CN': zhCN, ja, ko };

/** 把 "{name}" 占位替换为 params.name;缺参则原样保留占位。 */
function format(tpl: string, params?: Record<string, string | number>): string {
  if (!params) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

export interface I18nValue {
  locale: Locale;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  setLocale: (next: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

/** 独立的 t 函数(供无 Provider 兜底与内部复用)。 */
function makeT(locale: Locale) {
  const catalog = CATALOGS[locale] ?? en;
  return (key: MessageKey, params?: Record<string, string | number>): string =>
    format(catalog[key] ?? en[key] ?? String(key), params);
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  /** 测试用:指定初始语言并跳过 storage 读取,使断言可复现。 */
  initialLocale?: Locale;
}): ReactNode {
  // 初值先按浏览器界面语言推断(避免首帧空白),挂载后再用持久化偏好覆盖
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? resolveInitialLocale());

  useEffect(() => {
    if (initialLocale) return; // 测试固定语言:不读 storage
    chrome.storage.local
      .get(LOCALE_STORAGE_KEY)
      .then((r) => {
        const saved = r[LOCALE_STORAGE_KEY];
        if (typeof saved === 'string' && SUPPORTED.includes(saved as Locale)) {
          setLocaleState(saved as Locale);
        }
      })
      .catch((e) => logDebug('i18n.loadLocale', e));
  }, [initialLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (next: Locale): void => {
    setLocaleState(next);
    void chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: next });
  };

  const t = makeT(locale);

  return <I18nContext.Provider value={{ locale, t, setLocale }}>{children}</I18nContext.Provider>;
}

/** 兜底值:无 Provider 时回退英文、不抛错(测试直接渲染组件、误用时都安全)。 */
const FALLBACK: I18nValue = { locale: 'en', t: makeT('en'), setLocale: () => {} };

export function useT(): I18nValue {
  return useContext(I18nContext) ?? FALLBACK;
}
