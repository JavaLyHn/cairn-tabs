import { describe, it, expect, afterEach } from 'vitest';
import { usePanelStore } from '@/entrypoints/sidepanel/store';

afterEach(() => usePanelStore.setState({ searchOpen: false }));

describe('usePanelStore.toggleSearch', () => {
  it('在打开/关闭之间切换 searchOpen', () => {
    const { toggleSearch } = usePanelStore.getState();
    expect(usePanelStore.getState().searchOpen).toBe(false);
    toggleSearch();
    expect(usePanelStore.getState().searchOpen).toBe(true);
    toggleSearch();
    expect(usePanelStore.getState().searchOpen).toBe(false);
  });

  it('openSearch / closeSearch 仍为幂等的显式开关', () => {
    const { openSearch, closeSearch } = usePanelStore.getState();
    openSearch();
    openSearch();
    expect(usePanelStore.getState().searchOpen).toBe(true);
    closeSearch();
    expect(usePanelStore.getState().searchOpen).toBe(false);
  });
});
