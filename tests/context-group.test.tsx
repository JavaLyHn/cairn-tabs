// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ContextGroup } from '@/entrypoints/sidepanel/components/ContextGroup';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';
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
    render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...baseProps({ onAiCancel })} />
      </I18nProvider>,
    );

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

describe('ContextGroup a11y — 折叠头键盘可达', () => {
  const tab = {
    id: 'x1',
    contextId: 'c1',
    url: 'https://a.com',
    title: 'A标签',
    chromeTabId: 1,
    firstOpenedAt: 0,
    lastActiveAt: 0,
  };
  it('头部为可聚焦 button + aria-expanded,Enter 键切换折叠', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...baseProps({ editing: false, tabs: [tab] })} />
      </I18nProvider>,
    );
    const header = screen.getByRole('button', { expanded: true });
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(screen.getByText('A标签')).toBeTruthy();
    fireEvent.keyDown(header, { key: 'Enter' });
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy();
    expect(screen.queryByText('A标签')).toBeNull();
  });
});

describe('ContextGroup 一键折叠', () => {
  const t = {
    id: 'x1',
    contextId: 'c1',
    url: 'https://a.com',
    title: 'A标签',
    chromeTabId: 1,
    firstOpenedAt: 0,
    lastActiveAt: 0,
  };
  it('collapseAll 控制:false 显示标签、true 隐藏', () => {
    const props = baseProps({ editing: false, tabs: [t] });
    const { rerender } = render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...props} collapseAll={false} />
      </I18nProvider>,
    );
    expect(screen.getByText('A标签')).toBeTruthy();
    rerender(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...props} collapseAll={true} />
      </I18nProvider>,
    );
    expect(screen.queryByText('A标签')).toBeNull();
  });
});
