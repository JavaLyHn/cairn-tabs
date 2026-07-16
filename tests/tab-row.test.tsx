// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TabRow } from '@/entrypoints/sidepanel/components/TabRow';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';
import type { TabRecord } from '@/shared/types';

afterEach(cleanup);

function tab(over: Partial<TabRecord> = {}): TabRecord {
  return {
    id: 't1',
    contextId: 'inbox',
    url: 'https://example.com/a',
    title: 'Example',
    chromeTabId: 1,
    firstOpenedAt: 0,
    lastActiveAt: 0,
    ...over,
  };
}
const noop = () => {};

describe('TabRow', () => {
  it('显示标题', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <TabRow tab={tab()} portMap={{}} onActivate={noop} onClose={noop} />
      </I18nProvider>,
    );
    expect(screen.getByText('Example')).toBeTruthy();
  });

  it('无 favicon → 字母字标兜底(域名首字母)', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <TabRow
          tab={tab({ faviconUrl: undefined })}
          portMap={{}}
          onActivate={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('E')).toBeTruthy(); // example.com → E
  });

  it('GitHub PR → 徽章 + 精简标题', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <TabRow
          tab={tab({ url: 'https://github.com/a/b/pull/7', title: 'Fix · Pull Request #7 · a/b' })}
          portMap={{}}
          onActivate={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('PR #7')).toBeTruthy();
    expect(screen.getByText('Fix')).toBeTruthy(); // 尾部被剥掉
  });

  it('点标题触发 onActivate,点 × 触发 onClose', () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="zh-CN">
        <TabRow tab={tab()} portMap={{}} onActivate={onActivate} onClose={onClose} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('Example'));
    expect(onActivate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle('关闭标签'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('提供 onToggleStar → 星按钮切换(不冒泡到打开)', () => {
    const onToggleStar = vi.fn();
    const onActivate = vi.fn();
    render(
      <I18nProvider initialLocale="zh-CN">
        <TabRow
          tab={tab()}
          portMap={{}}
          onActivate={onActivate}
          onClose={noop}
          onToggleStar={onToggleStar}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTitle('标为重点'));
    expect(onToggleStar).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled(); // stopPropagation
  });

  it('已加星 → 标题为「取消重点」', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <TabRow
          tab={tab({ starred: true })}
          portMap={{}}
          onActivate={noop}
          onClose={noop}
          onToggleStar={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByTitle('取消重点')).toBeTruthy();
  });

  it('关闭按钮有无障碍名称', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <TabRow tab={tab()} portMap={{}} onActivate={noop} onClose={noop} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: '关闭标签' })).toBeTruthy();
  });

  it('重点按钮名称随 starred 切换', () => {
    const { rerender } = render(
      <I18nProvider initialLocale="zh-CN">
        <TabRow
          tab={tab({ starred: false })}
          portMap={{}}
          onActivate={noop}
          onClose={noop}
          onToggleStar={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: '标为重点' })).toBeTruthy();
    rerender(
      <I18nProvider initialLocale="zh-CN">
        <TabRow
          tab={tab({ starred: true })}
          portMap={{}}
          onActivate={noop}
          onClose={noop}
          onToggleStar={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: '取消重点' })).toBeTruthy();
  });

  it('Bitbucket PR → 徽章', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <TabRow
          tab={tab({ url: 'https://bitbucket.org/acme/app/pull-requests/42', title: 'Fix bug' })}
          portMap={{}}
          onActivate={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('PR #42')).toBeTruthy();
  });

  it('Bitbucket 标签渲染清洗后的标题(剥掉 — repo — Bitbucket 尾)', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <TabRow
          tab={tab({
            url: 'https://bitbucket.org/acme/app/pull-requests/42',
            title: 'Fix login bug — app — Bitbucket',
          })}
          portMap={{}}
          onActivate={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('Fix login bug')).toBeTruthy();
    expect(screen.queryByText('Fix login bug — app — Bitbucket')).toBeNull();
  });
});
