// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AIPlanDialog } from '@/entrypoints/sidepanel/components/AIPlanDialog';
import type { TabRecord } from '@/shared/types';

afterEach(cleanup);

const NOW = 1_700_000_000_000;
function tab(id: string, title: string): TabRecord {
  return { id, contextId: 'x', url: `https://e.com/${id}`, title, chromeTabId: 1, firstOpenedAt: NOW, lastActiveAt: NOW };
}
const noop = () => {};

describe('AIPlanDialog 来源组显示', () => {
  it('传 sourceNames 时,跨组移动的标签显示「原 X」', () => {
    render(
      <AIPlanDialog
        plan={{ newGroups: [{ name: '新组', tabIds: ['t1'] }], assign: [] }}
        tabs={[tab('t1', '标签一')]}
        taskNames={{}}
        sourceNames={{ t1: '旧任务' }}
        onApply={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText(/原 旧任务/)).toBeTruthy();
  });

  it('不传 sourceNames 时不显示来源', () => {
    render(
      <AIPlanDialog
        plan={{ newGroups: [{ name: '新组', tabIds: ['t1'] }], assign: [] }}
        tabs={[tab('t1', '标签一')]}
        taskNames={{}}
        onApply={noop}
        onClose={noop}
      />,
    );
    expect(screen.queryByText(/原 /)).toBeNull();
  });
});
