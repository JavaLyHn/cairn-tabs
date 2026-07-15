// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { StarredSection } from '@/entrypoints/sidepanel/components/StarredSection';
import type { TabRecord } from '@/shared/types';

afterEach(cleanup);

function tab(over: Partial<TabRecord> = {}): TabRecord {
  return {
    id: 's1',
    contextId: 'inbox',
    url: 'https://example.com/a',
    title: 'Pinned',
    chromeTabId: 1,
    starred: true,
    firstOpenedAt: 0,
    lastActiveAt: 0,
    ...over,
  };
}

describe('StarredSection', () => {
  it('无重点标签 → 不渲染', () => {
    const { container } = render(
      <StarredSection
        tabs={[]}
        portMap={{}}
        onActivateTab={() => {}}
        onCloseTab={() => {}}
        onToggleStar={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('渲染重点标签;取消星标回调 (id, false)', () => {
    const onToggleStar = vi.fn();
    render(
      <StarredSection
        tabs={[tab()]}
        portMap={{}}
        onActivateTab={() => {}}
        onCloseTab={() => {}}
        onToggleStar={onToggleStar}
      />,
    );
    expect(screen.getByText('重点')).toBeTruthy();
    expect(screen.getByText('Pinned')).toBeTruthy();
    fireEvent.click(screen.getByTitle('取消重点'));
    expect(onToggleStar).toHaveBeenCalledWith('s1', false);
  });
});
