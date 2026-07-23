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

  it('改名输入框里空格不被折叠头拦截(回归 C1:可输入多词任务名)', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...baseProps({ editing: true })} />
      </I18nProvider>,
    );
    const input = screen.getByRole('textbox');
    // fireEvent 返回 false 表示事件被 preventDefault 取消;空格必须不被取消
    const notCanceled = fireEvent.keyDown(input, { key: ' ' });
    expect(notCanceled).toBe(true);
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

describe('ContextGroup 命名任务 AI 整理(净化)入口', () => {
  const movable = {
    id: 'm1',
    contextId: 'c1',
    url: 'https://a.com',
    title: '可动标签',
    chromeTabId: 1,
    firstOpenedAt: 0,
    lastActiveAt: 0,
  };
  it('命名任务(有可动标签、AI 开)显示「✦ AI 整理」并触发 onAiPrune', () => {
    const onAiPrune = vi.fn();
    render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...baseProps({ editing: false, tabs: [movable], onAiPrune })} />
      </I18nProvider>,
    );
    const btn = screen.getByRole('button', { name: '✦ AI 整理' });
    fireEvent.click(btn);
    expect(onAiPrune).toHaveBeenCalledTimes(1);
  });
  it('全是★重点/无可动标签 → 不显示 AI 整理', () => {
    const starred = { ...movable, starred: true };
    render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...baseProps({ editing: false, tabs: [starred], onAiPrune: () => {} })} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('button', { name: '✦ AI 整理' })).toBeNull();
  });
});

describe('ContextGroup 命名任务直接 AI 改名入口', () => {
  const tab = {
    id: 'x1',
    contextId: 'c1',
    url: 'https://a.com',
    title: 'A标签',
    chromeTabId: 1,
    firstOpenedAt: 0,
    lastActiveAt: 0,
  };
  it('命名任务(非编辑态、有标签、AI 开)显示「✦ AI 改名」,点击进入编辑', () => {
    const onStartEdit = vi.fn();
    render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...baseProps({ editing: false, tabs: [tab], onStartEdit })} />
      </I18nProvider>,
    );
    const btn = screen.getByRole('button', { name: 'AI 改名' });
    fireEvent.click(btn);
    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });
  it('未分类(inbox)不显示 AI 改名', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup
          {...baseProps({
            variant: 'inbox',
            editing: false,
            tabs: [tab],
            context: { ...ctx, id: 'inbox' },
          })}
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole('button', { name: 'AI 改名' })).toBeNull();
  });
});

describe('ContextGroup 归档组可接收拖拽', () => {
  it('archived variant:drop 触发 onDropTab(把开着的标签直接归档进来)', () => {
    const onDropTab = vi.fn();
    const { container } = render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...baseProps({ variant: 'archived', editing: false, onDropTab })} />
      </I18nProvider>,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.drop(root, { dataTransfer: { getData: () => 'x1' } });
    expect(onDropTab).toHaveBeenCalledWith('x1');
  });
});

describe('ContextGroup 不确定标记', () => {
  const t = {
    id: 'x1',
    contextId: 'c1',
    url: 'https://a.com',
    title: 'A标签',
    chromeTabId: 1,
    firstOpenedAt: 0,
    lastActiveAt: 0,
  };
  it('传 unclearReasons → 对应标签显示「?」标记,悬停含理由', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup
          {...baseProps({ editing: false, tabs: [t], unclearReasons: { x1: '看不出主题' } })}
        />
      </I18nProvider>,
    );
    const marker = screen.getByTitle(/看不出主题/);
    expect(marker.textContent).toBe('?');
  });
  it('无 unclearReasons → 不显示标记', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...baseProps({ editing: false, tabs: [t] })} />
      </I18nProvider>,
    );
    expect(screen.queryByText('?')).toBeNull();
  });
  it('unclear 但理由为空 → 仍显示标记(通用提示)', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <ContextGroup {...baseProps({ editing: false, tabs: [t], unclearReasons: { x1: '' } })} />
      </I18nProvider>,
    );
    const marker = screen.getByText('?');
    expect(marker.getAttribute('title')).toBe('AI 拿不准怎么归类,已留原位');
  });
});
