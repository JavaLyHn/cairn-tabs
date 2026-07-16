// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ExportDialog } from '@/entrypoints/sidepanel/components/ExportDialog';
import type { Context, TabRecord } from '@/shared/types';

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
      <ExportDialog
        context={fakeContext}
        tabs={fakeTabs}
        exportedAt={0}
        onFlash={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dialog role 与 aria-label="导出任务"', () => {
    render(
      <ExportDialog
        context={fakeContext}
        tabs={fakeTabs}
        exportedAt={0}
        onFlash={() => {}}
        onClose={() => {}}
      />,
    );
    const d = screen.getByRole('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('导出任务');
  });
});
