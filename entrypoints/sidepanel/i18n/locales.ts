// 支持的界面语言与初始语言推断(见 spec Phase 1a)。

export type Locale = 'en' | 'zh-CN' | 'ja' | 'ko';

export const SUPPORTED: Locale[] = ['en', 'zh-CN', 'ja', 'ko'];

/** 语言在切换器里以各自母语显示。 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  ja: '日本語',
  ko: '한국어',
};

/** chrome.storage.local 里存界面语言偏好的键(纯 UI 偏好,不入 SW 快照)。 */
export const LOCALE_STORAGE_KEY = 'uiLocale';

/** 依浏览器界面语言就近映射到支持的语种;未知回退 en。 */
export function resolveInitialLocale(): Locale {
  let ui = 'en';
  try {
    ui = (chrome.i18n?.getUILanguage?.() ?? 'en').toLowerCase();
  } catch {
    ui = 'en';
  }
  if (ui.startsWith('zh')) return 'zh-CN';
  if (ui.startsWith('ja')) return 'ja';
  if (ui.startsWith('ko')) return 'ko';
  return 'en';
}
