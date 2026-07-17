import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './theme';
import {
  loadAppearance,
  applyTheme,
  applyAccent,
  resolveTheme,
  resolveAccentHex,
  systemPrefersDark,
} from './theme/theme';
import './style.css';

// 挂载前先读并应用外观偏好,消除主题/强调色闪帧,再渲染(把已读到的值作为初值传入)。
loadAppearance()
  .catch(() => ({ mode: 'auto' as const, accent: 'teal' }))
  .then(({ mode, accent }) => {
    applyTheme(resolveTheme(mode, systemPrefersDark()));
    applyAccent(resolveAccentHex(accent));
    createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <I18nProvider>
          <ThemeProvider initialMode={mode} initialAccent={accent}>
            <App />
          </ThemeProvider>
        </I18nProvider>
      </React.StrictMode>,
    );
  });
