// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '@/entrypoints/sidepanel/components/SettingsPanel';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';
import { DEFAULT_FLAGS } from '@/shared/types';
import type { AIStatus } from '@/shared/ai';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const emptyAi: AIStatus = { profiles: [], activeId: null, ready: false };
const noop = () => {};

function props(over: Record<string, unknown> = {}) {
  return {
    flags: DEFAULT_FLAGS,
    ai: emptyAi,
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

function renderPanel(over: Record<string, unknown> = {}) {
  return render(
    <I18nProvider initialLocale="zh-CN">
      <SettingsPanel {...props(over)} />
    </I18nProvider>,
  );
}

describe('SettingsPanel 接入多份 AI 配置', () => {
  it('AI 区渲染:空态显示引导语(证明 AiProfilesSection 已接入)', () => {
    renderPanel();
    expect(screen.getByText(/还没有 AI 配置/)).toBeTruthy();
  });

  it('新增编辑器保存成功 → 关闭编辑器、回到列表', async () => {
    renderPanel({ onSaveProfile: async () => undefined });
    fireEvent.click(screen.getByText('+ 新增配置'));
    fireEvent.change(screen.getByLabelText(/API key/i), { target: { value: 'sk-x' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));
    // 成功后回到列表:编辑器的 key 输入消失,「+ 新增配置」重新出现
    expect(await screen.findByText('+ 新增配置')).toBeTruthy();
    expect(screen.queryByLabelText(/API key/i)).toBeNull();
  });

  it('新增编辑器保存失败 → 红色反馈,停留在编辑器', async () => {
    renderPanel({
      onSaveProfile: async () => {
        throw new Error('boom');
      },
    });
    fireEvent.click(screen.getByText('+ 新增配置'));
    fireEvent.change(screen.getByLabelText(/API key/i), { target: { value: 'sk-x' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));
    const el = await screen.findByText('boom');
    expect(el.className).toContain('red');
  });
});
