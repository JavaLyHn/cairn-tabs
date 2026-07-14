// 命令处理器(见设计文档 §6/§7)。SW 收到 UI 的 Command 后在此执行,再广播快照。

import type { Repository } from '../store/repositories';
import type { SearchIndex } from '../search';
import type { UndoManager } from './undo';
import { pauseSync, resumeSync } from './sync-lock';
import { ensureTabInContextGroup, groupRestoredTabs, syncGroupTitle } from './group-sync';
import type { Command, Event } from '@/shared/messaging';
import { INBOX_ID } from '@/shared/types';

export interface CommandContext {
  repo: Repository;
  search: SearchIndex;
  undo: UndoManager;
  onChange: () => void;
}

const RESTORE_STAGGER_MS = 50;
const UNDO_TTL_MS = 5000;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function handleCommand(cmd: Command, ctx: CommandContext): Promise<Event | void> {
  const { repo, search, undo, onChange } = ctx;
  const now = Date.now();

  switch (cmd.type) {
    case 'CREATE_CONTEXT':
      await repo.createContext(cmd.name, now);
      onChange();
      return;

    case 'RENAME_CONTEXT': {
      const trimmed = cmd.name.trim();
      await repo.renameContext(cmd.contextId, trimmed);
      if (trimmed) await syncGroupTitle(repo, cmd.contextId, trimmed);
      onChange();
      return;
    }

    case 'DELETE_CONTEXT':
      await repo.deleteContext(cmd.contextId, now);
      onChange();
      return;

    case 'MOVE_TAB': {
      await repo.moveTab(cmd.tabRecordId, cmd.toContextId, now);
      const rec = await repo.getTab(cmd.tabRecordId);
      if (rec?.chromeTabId != null) {
        await ensureTabInContextGroup(repo, cmd.toContextId, rec.chromeTabId);
      }
      onChange();
      return;
    }

    case 'ARCHIVE_CONTEXT': {
      if (cmd.contextId === INBOX_ID) return;
      const closedTabIds = await repo.archiveContext(cmd.contextId, now);
      // 必须持锁关闭:关闭已分组标签会并发触发 onUpdated(脱组)+ onRemoved,
      // 不持锁会让 onUpdated 回填出未分类幻影记录(见 sync.integration.test)。
      pauseSync();
      try {
        await Promise.all(closedTabIds.map((id) => chrome.tabs.remove(id).catch(() => {})));
      } finally {
        resumeSync();
      }
      onChange();
      const { token, ttlMs } = undo.register('archive', cmd.contextId, UNDO_TTL_MS);
      return { type: 'UNDOABLE', action: 'archive', token, ttlMs };
    }

    case 'RESTORE_CONTEXT':
      await restoreContext(cmd.contextId, ctx);
      onChange();
      return;

    case 'UNDO': {
      const contextId = undo.consume(cmd.token);
      if (contextId) {
        await restoreContext(contextId, ctx);
        onChange();
      }
      return;
    }

    case 'ACTIVATE_TAB': {
      let record = await repo.getTab(cmd.tabRecordId);
      if (!record) return;
      // 归档标签:先恢复其所属簇,再聚焦
      if (record.chromeTabId == null) {
        await restoreContext(record.contextId, ctx);
        onChange();
        record = await repo.getTab(cmd.tabRecordId);
      }
      if (record?.chromeTabId != null) {
        await chrome.tabs.update(record.chromeTabId, { active: true }).catch(() => {});
        if (record.windowId != null) {
          await chrome.windows.update(record.windowId, { focused: true }).catch(() => {});
        }
      }
      return;
    }

    case 'CLOSE_TAB': {
      const record = await repo.getTab(cmd.tabRecordId);
      if (!record) return;
      if (record.chromeTabId != null) {
        // 标签存在 → 关闭,onRemoved 删记录;标签已失效(remove 抛错)→ 直接清记录
        try {
          await chrome.tabs.remove(record.chromeTabId);
        } catch {
          await repo.removeTab(record.id);
          onChange();
        }
      } else {
        await repo.removeTab(record.id);
        onChange();
      }
      return;
    }

    case 'REQUEST_SNAPSHOT':
      onChange();
      return;

    case 'SEARCH':
      return { type: 'SEARCH_RESULTS', query: cmd.query, results: search.query(cmd.query) };
  }
}

/** 整簇恢复(见设计文档 §7.2):限速重开 + 立即挂起 + 回填 chromeTabId。 */
async function restoreContext(contextId: string, ctx: CommandContext): Promise<void> {
  const { repo } = ctx;
  const context = await repo.getContext(contextId);
  if (!context || context.status !== 'archived') return;

  let windowId: number | undefined;
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    windowId = win.id;
  } catch {
    windowId = undefined;
  }

  pauseSync();
  try {
    const createdIds: number[] = [];
    for (const recordId of context.tabOrder) {
      const record = await repo.getTab(recordId);
      if (!record) continue;
      try {
        const created = await chrome.tabs.create({ url: record.url, active: false, windowId });
        if (created.id != null) {
          // 立即挂起,避免恢复瞬间内存暴涨。await 以确保其事件落在持锁期内;
          // 老版 Chrome discard 可能换 id,用其返回值回填。
          let finalId = created.id;
          try {
            const d = await chrome.tabs.discard(created.id);
            if (d?.id != null) finalId = d.id;
          } catch {
            /* loading 中的标签无法 discard,忽略 */
          }
          await repo.bindChromeTab(recordId, finalId, created.windowId ?? windowId ?? 0, Date.now());
          createdIds.push(finalId);
        }
      } catch {
        // 达到浏览器标签上限等 → 跳过该标签,继续恢复其余
      }
      await delay(RESTORE_STAGGER_MS);
    }
    await repo.setContextActive(contextId);
    // 把恢复的标签编成原生分组(与 §6.4 双向同步一致)
    await groupRestoredTabs(repo, contextId, createdIds);
  } finally {
    resumeSync();
  }
}
