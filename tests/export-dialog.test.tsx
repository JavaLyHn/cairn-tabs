// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ExportDialog } from '@/entrypoints/sidepanel/components/ExportDialog';
import type { Context, TabRecord } from '@/shared/types';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';

afterEach(cleanup);

const fakeContext: Context = {
  id: 'ctx-1',
  name: '测试任务',
  origin: 'manual',
  status: 'active',
  color: 'blue',
  createdAt: 0,
  lastActiveAt: 0,
  tabOrder: [],
};

const fakeTabs: TabRecord[] = [];

describe('ExportDialog', () => {
  it('按 Esc → onClose', () => {
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="zh-CN">
        <ExportDialog
          context={fakeContext}
          tabs={fakeTabs}
          exportedAt={0}
          onFlash={() => {}}
          onClose={onClose}
        />
      </I18nProvider>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dialog role 与 aria-label="导出任务"', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <ExportDialog
          context={fakeContext}
          tabs={fakeTabs}
          exportedAt={0}
          onFlash={() => {}}
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    const d = screen.getByRole('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('导出任务');
  });
});
