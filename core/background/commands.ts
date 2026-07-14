// 命令处理器(见设计文档 §6/§7)。SW 收到 UI 的 Command 后在此执行,再广播快照。

import type { Repository } from '../store/repositories';
import type { SearchIndex } from '../search';
import type { UndoManager } from './undo';
import { pauseSync, resumeSync } from './sync-lock';
import { ensureTabInContextGroup, groupTabsForContext, syncGroupTitle } from './group-sync';
import { DRAFT_CONTEXT_NAME, type Command, type Event } from '@/shared/messaging';
import { INBOX_ID } from '@/shared/types';
import { findDuplicateGroups } from '@/shared/dedup';

export interface CommandContext {
  repo: Repository;
  search: SearchIndex;
  undo: UndoManager;
  onChange: () => void;
  /** 记录负样本(某 URL 的域名不属于 contextId);测试中可省略。 */
  recordNegative?: (url: string, contextId: string) => Promise<void>;
  /** localhost 端口映射的读写;测试中可省略。 */
  ports?: {
    set: (port: number, project: string) => Promise<void>;
    remove: (port: number) => Promise<void>;
  };
  /** 功能开关读写;测试中可省略。 */
  flags?: {
    setAutoCluster: (enabled: boolean) => Promise<void>;
  };
}

const RESTORE_STAGGER_MS = 50;
const UNDO_TTL_MS = 5000;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function handleCommand(cmd: Command, ctx: CommandContext): Promise<Event | void> {
  const { repo, search, undo, onChange, recordNegative, ports, flags } = ctx;
  const now = Date.now();

  switch (cmd.type) {
    case 'CREATE_CONTEXT': {
      const name = cmd.name.trim() || DRAFT_CONTEXT_NAME;
      // 至多一个同名草稿:已存在则复用,不重复生成
      const { contexts } = await repo.getSnapshot();
      const existing = contexts.find((c) => c.origin === 'manual' && c.name === name);
      if (existing) return { type: 'CONTEXT_CREATED', contextId: existing.id };
      const ctx = await repo.createContext(name, now);
      onChange();
      return { type: 'CONTEXT_CREATED', contextId: ctx.id };
    }

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
      const before = await repo.getTab(cmd.tabRecordId);
      await repo.moveTab(cmd.tabRecordId, cmd.toContextId, now);
      await repo.pinTab(cmd.tabRecordId); // 人工归属,引擎不再改动(PRD §6.1)
      const rec = await repo.getTab(cmd.tabRecordId);
      if (rec?.chromeTabId != null) {
        await ensureTabInContextGroup(repo, cmd.toContextId, rec.chromeTabId);
      }
      // 从命名簇拖出 → 记负样本(降低该域名再归入该簇的权重,PRD §6.2)
      if (before && before.contextId !== INBOX_ID && before.contextId !== cmd.toContextId) {
        await recordNegative?.(before.url, before.contextId);
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

    case 'MERGE_DUPLICATES': {
      const { tabs } = await repo.getSnapshot();
      const redundant = findDuplicateGroups(tabs)
        .flatMap((g) => g.redundant)
        .map((r) => r.chromeTabId)
        .filter((id): id is number => id != null);
      // 关闭冗余标签(保留每组最近活跃的);记录由 onRemoved 清除,补建防御挡幻影
      await Promise.all(redundant.map((id) => chrome.tabs.remove(id).catch(() => {})));
      onChange();
      return;
    }

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

    case 'SET_PORT_MAPPING':
      await ports?.set(cmd.port, cmd.project);
      onChange();
      return;

    case 'REMOVE_PORT_MAPPING':
      await ports?.remove(cmd.port);
      onChange();
      return;

    case 'SET_AUTO_CLUSTER':
      await flags?.setAutoCluster(cmd.enabled);
      onChange();
      return;

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
        // 后台创建(active:false)让其正常加载出标题;不立即 discard——
        // 对正在加载的新标签 discard 不可靠,会把标签卡在转圈的「无标题」状态。
        // 内存回收留给 F-11 的挂起扫描按空闲时长统一处理。
        const created = await chrome.tabs.create({ url: record.url, active: false, windowId });
        if (created.id != null) {
          await repo.bindChromeTab(recordId, created.id, created.windowId ?? windowId ?? 0, Date.now());
          createdIds.push(created.id);
        }
      } catch {
        // 达到浏览器标签上限等 → 跳过该标签,继续恢复其余
      }
      await delay(RESTORE_STAGGER_MS);
    }
    await repo.setContextActive(contextId);
    // 把恢复的标签编成原生分组(与 §6.4 双向同步一致)
    await groupTabsForContext(repo, contextId, createdIds);
  } finally {
    resumeSync();
  }
}
