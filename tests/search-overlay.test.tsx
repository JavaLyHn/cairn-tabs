// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SearchOverlay } from '@/entrypoints/sidepanel/components/SearchOverlay';
import { usePanelStore } from '@/entrypoints/sidepanel/store';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';
import { DEFAULT_FLAGS, INBOX_ID, type Context, type TabRecord } from '@/shared/types';

afterEach(() => {
  cleanup();
  usePanelStore.setState({ contexts: [], tabs: [] });
});

const NOW = 1_700_000_000_000;

function ctx(id: string, name: string): Context {
  return {
    id,
    name,
    origin: id === INBOX_ID ? 'auto' : 'manual',
    status: 'active',
    color: 'blue',
    createdAt: NOW,
    lastActiveAt: NOW,
    tabOrder: [],
  };
}
function tab(id: string, over: Partial<TabRecord> = {}): TabRecord {
  return {
    id,
    contextId: 'c1',
    url: `https://example.com/${id}`,
    title: id,
    chromeTabId: 1, // 打开中
    firstOpenedAt: NOW,
    lastActiveAt: NOW,
    ...over,
  };
}

function seed(
  tabs: TabRecord[],
  contexts: Context[] = [ctx(INBOX_ID, '未分类'), ctx('c1', '任务甲')],
) {
  usePanelStore.setState({ ...usePanelStore.getState(), contexts, tabs, flags: DEFAULT_FLAGS });
}

const noop = () => {};

describe('SearchOverlay 启动器空态', () => {
  it('未输入时展示打开中的标签(最近在前),★ 重点置顶', () => {
    seed([
      tab('older', { title: '较早', lastActiveAt: NOW - 10_000 }),
      tab('newer', { title: '最近', lastActiveAt: NOW }),
      tab('star', { title: '重点页', lastActiveAt: NOW - 99_999, starred: true }),
    ]);
    render(
      <I18nProvider initialLocale="zh-CN">
        <SearchOverlay onClose={noop} onActivate={noop} onRestoreContext={noop} />
      </I18nProvider>,
    );

    expect(screen.getByText('最近 · ★ 重点')).toBeTruthy();
    const rows = screen.getAllByText(/^(重点页|最近|较早)$/).map((el) => el.textContent);
    // 重点置顶,其余按 lastActiveAt 倒序
    expect(rows).toEqual(['重点页', '最近', '较早']);
  });

  it('已归档标签(无 chromeTabId)不进空态列表', () => {
    seed([
      tab('open', { title: '打开的' }),
      tab('archived', { title: '归档的', chromeTabId: undefined }),
    ]);
    render(
      <I18nProvider initialLocale="zh-CN">
        <SearchOverlay onClose={noop} onActivate={noop} onRestoreContext={noop} />
      </I18nProvider>,
    );
    expect(screen.queryByText('打开的')).toBeTruthy();
    expect(screen.queryByText('归档的')).toBeNull();
  });

  it('点击空态某行 → onActivate(该标签 id) 且关闭', () => {
    seed([tab('t1', { title: '直达我' })]);
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="zh-CN">
        <SearchOverlay onClose={onClose} onActivate={onActivate} onRestoreContext={noop} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('直达我'));
    expect(onActivate).toHaveBeenCalledWith('t1');
    expect(onClose).toHaveBeenCalled();
  });

  it('无打开标签时不渲染列表容器(盒子保持紧凑),但保留输入框与快捷键提示', () => {
    seed([]);
    render(
      <I18nProvider initialLocale="zh-CN">
        <SearchOverlay onClose={noop} onActivate={noop} onRestoreContext={noop} />
      </I18nProvider>,
    );
    expect(screen.getByPlaceholderText('搜索打开或已归档的标签…')).toBeTruthy();
    expect(screen.getByText(/↑↓ 选择/)).toBeTruthy();
    expect(screen.queryByText('最近 · ★ 重点')).toBeNull();
  });
});
