/*
 * Cairn Tabs — Copyright (C) 2026 LyHn (JavaLyHn).
 * Licensed under AGPL-3.0-only. Derivative works must retain this attribution
 * and be released under the same license. See LICENSE.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './theme';
import { loadAppearance, applyTheme, resolveTheme, systemPrefersDark } from './theme/theme';
import './style.css';

// 挂载前先读并应用外观偏好,消除明暗闪帧,再渲染(把已读到的值作为初值传入)。
loadAppearance()
  .catch(() => ({ mode: 'auto' as const }))
  .then(({ mode }) => {
    applyTheme(resolveTheme(mode, systemPrefersDark()));
    createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <I18nProvider>
          <ThemeProvider initialMode={mode}>
            <App />
          </ThemeProvider>
        </I18nProvider>
      </React.StrictMode>,
    );
  });
