// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { SettingsPanel } from '@/entrypoints/sidepanel/components/SettingsPanel';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';
import { DEFAULT_FLAGS } from '@/shared/types';
import type { AIStatus } from '@/shared/ai';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
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
    onClose: noop,
    ...over,
  };
}

describe('AISection 保存反馈', () => {
  it('保存成功 → 绿色反馈', async () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <SettingsPanel {...props({ onSaveAi: async () => {} })} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));
    const el = await screen.findByText('已保存');
    expect(el.className).toContain('emerald');
  });

  it('保存失败 → 红色反馈', async () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <SettingsPanel
          {...props({
            onSaveAi: async () => {
              throw new Error('boom');
            },
          })}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));
    const el = await screen.findByText('boom');
    expect(el.className).toContain('red');
  });

  it('成功提示 ~2.5s 后自动消失,失败不消失', async () => {
    vi.useFakeTimers();
    // 成功:自动消失
    const ok = render(
      <I18nProvider initialLocale="zh-CN">
        <SettingsPanel {...props({ onSaveAi: async () => {} })} />
      </I18nProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));
    });
    expect(screen.getByText('已保存')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(screen.queryByText('已保存')).toBeNull();
    ok.unmount();

    // 失败:不消失
    render(
      <I18nProvider initialLocale="zh-CN">
        <SettingsPanel
          {...props({
            onSaveAi: async () => {
              throw new Error('bad');
            },
          })}
        />
      </I18nProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));
    });
    expect(screen.getByText('bad')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(screen.getByText('bad')).toBeTruthy(); // 失败保留
  });
});
