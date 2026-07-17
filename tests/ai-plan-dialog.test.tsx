// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AIPlanDialog } from '@/entrypoints/sidepanel/components/AIPlanDialog';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';
import type { TabRecord } from '@/shared/types';

afterEach(cleanup);

const NOW = 1_700_000_000_000;
function tab(id: string, title: string): TabRecord {
  return {
    id,
    contextId: 'x',
    url: `https://e.com/${id}`,
    title,
    chromeTabId: 1,
    firstOpenedAt: NOW,
    lastActiveAt: NOW,
  };
}
const noop = () => {};

describe('AIPlanDialog 来源组显示', () => {
  it('传 sourceNames 时,跨组移动的标签显示「原 X」', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <AIPlanDialog
          plan={{ newGroups: [{ name: '新组', tabIds: ['t1'] }], assign: [] }}
          tabs={[tab('t1', '标签一')]}
          taskNames={{}}
          sourceNames={{ t1: '旧任务' }}
          onApply={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByText(/原 旧任务/)).toBeTruthy();
  });

  it('不传 sourceNames 时不显示来源', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <AIPlanDialog
          plan={{ newGroups: [{ name: '新组', tabIds: ['t1'] }], assign: [] }}
          tabs={[tab('t1', '标签一')]}
          taskNames={{}}
          onApply={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(screen.queryByText(/原 /)).toBeNull();
  });
});

describe('AIPlanDialog 变更/无变更', () => {
  const tabC = (id: string, title: string, contextId: string): TabRecord => ({
    id,
    contextId,
    url: `https://e.com/${id}`,
    title,
    chromeTabId: 1,
    firstOpenedAt: NOW,
    lastActiveAt: NOW,
  });
  const merge = { newGroups: [], assign: [{ taskId: 'T', tabIds: ['mv', 'same'] }] };
  const mergeTabs = [tabC('mv', '移动来的', 'other'), tabC('same', '本就在此', 'T')];

  it('并入组:移动标签显示、无变更折叠;摘要计数;应用只含移动', () => {
    const onApply = vi.fn();
    render(
      <I18nProvider initialLocale="zh-CN">
        <AIPlanDialog
          plan={merge}
          tabs={mergeTabs}
          taskNames={{ T: 'auth' }}
          onApply={onApply}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('移动来的')).toBeTruthy();
    expect(screen.queryByText('本就在此')).toBeNull(); // 无变更默认折叠
    expect(screen.getByText('1 个已在此组(无变更)')).toBeTruthy();
    expect(screen.getByText('移动 1')).toBeTruthy();
    expect(screen.getByText('无变更 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /应用/ }));
    expect(onApply).toHaveBeenCalledWith({
      newGroups: [],
      assign: [{ taskId: 'T', tabIds: ['mv'] }],
    });
  });

  it('展开折叠 → 显示无变更标签', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <AIPlanDialog
          plan={merge}
          tabs={mergeTabs}
          taskNames={{ T: 'auth' }}
          onApply={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('1 个已在此组(无变更)'));
    expect(screen.getByText('本就在此')).toBeTruthy();
  });

  it('并入组全是无变更 → 整组不显示 + 本次无需变更 + 应用禁用', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <AIPlanDialog
          plan={{ newGroups: [], assign: [{ taskId: 'T', tabIds: ['same'] }] }}
          tabs={[tabC('same', '本就在此', 'T')]}
          taskNames={{ T: 'auth' }}
          onApply={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(screen.queryByText('本就在此')).toBeNull();
    expect(screen.getByText('本次无需变更')).toBeTruthy();
    expect((screen.getByRole('button', { name: '应用' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('AIPlanDialog 拿不准区', () => {
  it('展示「拿不准 · 保持原位」区与 AI 理由', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <AIPlanDialog
          plan={{ newGroups: [], assign: [], unclear: [{ tabId: 't1', reason: '看不出主题' }] }}
          tabs={[tab('t1', '标签一')]}
          taskNames={{}}
          onApply={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('拿不准 · 保持原位')).toBeTruthy();
    expect(screen.getByText('看不出主题')).toBeTruthy();
    expect(screen.getByText('标签一')).toBeTruthy();
  });
});

describe('AIPlanDialog favicon 兜底', () => {
  it('无 faviconUrl → 用域名首字母字标(不裂图、不空方块)', () => {
    const { container } = render(
      <I18nProvider initialLocale="zh-CN">
        <AIPlanDialog
          plan={{ newGroups: [{ name: '新组', tabIds: ['t1'] }], assign: [] }}
          tabs={[tab('t1', '标签一')]} // url=https://e.com/... 无 faviconUrl
          taskNames={{}}
          onApply={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('E')).toBeTruthy(); // e.com → 首字母 E
    expect(container.querySelector('img')).toBeNull(); // 不渲染裸 img(无裂图)
  });

  it('有 faviconUrl → 渲染 img', () => {
    const { container } = render(
      <I18nProvider initialLocale="zh-CN">
        <AIPlanDialog
          plan={{ newGroups: [{ name: '新组', tabIds: ['t1'] }], assign: [] }}
          tabs={[{ ...tab('t1', '标签一'), faviconUrl: 'https://e.com/favicon.ico' }]}
          taskNames={{}}
          onApply={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(container.querySelector('img')).toBeTruthy();
  });
});
