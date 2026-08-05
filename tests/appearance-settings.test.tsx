// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FakeChrome } from './fake-chrome';
import { SettingsPanel } from '@/entrypoints/sidepanel/components/SettingsPanel';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';
import { ThemeProvider } from '@/entrypoints/sidepanel/theme';
import { DEFAULT_FLAGS } from '@/shared/types';
import type { AIStatus } from '@/shared/ai';

beforeEach(() => new FakeChrome().install());
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.cssText = '';
});

const ai: AIStatus = { profiles: [], activeId: null, ready: false };
const noop = () => {};

function props(over: Record<string, unknown> = {}) {
  return {
    flags: DEFAULT_FLAGS,
    ai,
    onToggleAutoCluster: noop,
    onSetSameDomainSize: noop,
    onToggleStaleHints: noop,
    onSetStaleDays: noop,
    onToggleAutoDiscard: noop,
    onSetDiscardAfterMinutes: noop,
    onToggleDiscardSkipsLocalhost: noop,
    onSaveProfile: async () => undefined,
    onDeleteProfile: async () => {},
    onActivateProfile: async () => {},
    onTestAi: async () => ({ ok: true, detail: 'ok' }),
    onExportAll: noop,
    onImport: noop,
    onClose: noop,
    ...over,
  };
}

function renderPanel() {
  return render(
    <I18nProvider initialLocale="zh-CN">
      <ThemeProvider initialMode="auto">
        <SettingsPanel {...props()} />
      </ThemeProvider>
    </I18nProvider>,
  );
}

const accent = () => document.documentElement.style.getPropertyValue('--color-accent');

describe('外观设置', () => {
  it('只渲染主题分段控件 —— 单色设计语言下强调色不再可配置', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: '跟随系统' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '浅色' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '深色' })).toBeTruthy();
    for (const name of ['青绿', '蓝', '靛', '紫', '玫红', '琥珀', '石墨']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('点「深色」→ data-theme 变 dark', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '深色' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('强调色不再由 JS 注入 —— 只由 CSS 随 data-theme 反相', () => {
    renderPanel();
    // 内联样式里不得出现 --color-accent:一旦回到 JS 注入,明暗反相就会被写死的值盖住
    expect(accent()).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '深色' }));
    expect(accent()).toBe('');
  });
});
