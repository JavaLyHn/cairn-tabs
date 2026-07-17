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

const ai: AIStatus = { provider: 'anthropic', hasKey: true, model: 'x' };
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
    onSaveAi: async () => {},
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
      <ThemeProvider initialMode="auto" initialAccent="teal">
        <SettingsPanel {...props()} />
      </ThemeProvider>
    </I18nProvider>,
  );
}

const accent = () => document.documentElement.style.getPropertyValue('--color-accent');

describe('外观设置', () => {
  it('渲染主题分段控件与七个强调色预设', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: '跟随系统' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '浅色' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '深色' })).toBeTruthy();
    for (const name of ['青绿', '蓝', '靛', '紫', '玫红', '琥珀', '石墨']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('初始应用 teal 强调色', () => {
    renderPanel();
    expect(accent()).toBe('#1d9e75');
  });

  it('点「深色」→ data-theme 变 dark', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '深色' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('点强调色预设 → --color-accent 立即切换', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '玫红' }));
    expect(accent()).toBe('#f43f5e');
  });

  it('输入合法自定义 hex → 应用;「自定义」高亮', () => {
    renderPanel();
    const hex = screen.getByPlaceholderText('#1d9e75');
    fireEvent.change(hex, { target: { value: '#123456' } });
    expect(accent()).toBe('#123456');
    // 非预设 hex → 「自定义」文字用强调色标出
    const custom = screen.getByText('自定义');
    expect(custom.className).toContain('text-accent');
  });

  it('非法 hex 输入被忽略(不改强调色)', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '蓝' }));
    expect(accent()).toBe('#3b82f6');
    const hex = screen.getByPlaceholderText('#1d9e75');
    fireEvent.change(hex, { target: { value: '#zz' } });
    expect(accent()).toBe('#3b82f6'); // 保持不变
  });
});
