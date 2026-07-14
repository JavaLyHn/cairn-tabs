import { create } from 'zustand';
import type { Context, TabRecord, PortMapping } from '@/shared/types';
import type { Command, Event } from '@/shared/messaging';

interface UndoState {
  action: string;
  token: string;
  ttlMs: number;
}

interface PanelState {
  contexts: Context[];
  tabs: TabRecord[];
  portMappings: PortMapping[];
  autoCluster: boolean;
  undo: UndoState | null;
  searchOpen: boolean;

  applySnapshot: (
    contexts: Context[],
    tabs: TabRecord[],
    portMappings: PortMapping[],
    autoCluster: boolean,
  ) => void;
  setUndo: (u: UndoState) => void;
  clearUndo: () => void;
  openSearch: () => void;
  closeSearch: () => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  contexts: [],
  tabs: [],
  portMappings: [],
  autoCluster: true,
  undo: null,
  searchOpen: false,

  applySnapshot: (contexts, tabs, portMappings, autoCluster) =>
    set({ contexts, tabs, portMappings, autoCluster }),
  setUndo: (undo) => set({ undo }),
  clearUndo: () => set({ undo: null }),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
}));

/** 发命令并取回响应(archive 返回 UNDOABLE,search 返回 SEARCH_RESULTS)。 */
export async function dispatch(cmd: Command): Promise<Event | undefined> {
  return (await chrome.runtime.sendMessage(cmd)) as Event | undefined;
}
