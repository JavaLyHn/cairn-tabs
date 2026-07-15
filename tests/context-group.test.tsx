// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ContextGroup } from '@/entrypoints/sidepanel/components/ContextGroup';
import type { Context } from '@/shared/types';

afterEach(cleanup);

const ctx: Context = {
  id: 'c1',
  name: '任务A',
  origin: 'manual',
  status: 'active',
  color: 'blue',
  createdAt: 0,
  lastActiveAt: 0,
  tabOrder: [],
};
const noop = () => {};

function baseProps(over: Record<string, unknown> = {}) {
  return {
    context: ctx,
    tabs: [],
    variant: 'active' as const,
    dupMarks: new Map(),
    portMap: {},
    editing: true,
    onStartEdit: noop,
    onCommitName: noop,
    onCancelEdit: noop,
    onArchive: noop,
    onArchiveAll: noop,
    onRestore: noop,
    onExport: noop,
    onDelete: noop,
    onDropTab: noop,
    onActivateTab: noop,
    onCloseTab: noop,
    aiEnabled: true,
    onAiSuggestName: () => new Promise<string | null>(() => {}), // 永不 resolve → 停在进行中
    ...over,
  };
}

describe('ContextGroup AI 改名取消', () => {
  it('进行中按钮变「✦ 取消」且可点,点击触发 onAiCancel', async () => {
    const onAiCancel = vi.fn();
    render(<ContextGroup {...baseProps({ onAiCancel })} />);

    const start = screen.getByRole('button', { name: 'AI 命名' });
    expect(start.textContent).toContain('✦ AI');

    fireEvent.click(start); // 开始建议(promise 不结束 → 进行中)
    const cancelBtn = await screen.findByRole('button', { name: '取消 AI 命名' });
    expect(cancelBtn.textContent).toContain('✦ 取消');
    expect((cancelBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(cancelBtn); // 再点 → 取消
    expect(onAiCancel).toHaveBeenCalledTimes(1);
  });
});
