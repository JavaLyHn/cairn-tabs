// 命令处理器(见设计文档 §6/§7)。SW 收到 UI 的 Command 后在此执行,再广播快照。

import type { Repository } from '../store/repositories';
import type { SearchIndex } from '../search';
import type { UndoManager } from './undo';
import { pauseSync, resumeSync } from './sync-lock';
import { ensureTabInContextGroup, groupTabsForContext, syncGroupTitle } from './group-sync';
import { DRAFT_CONTEXT_NAME, type Command, type Event } from '@/shared/messaging';
import { INBOX_ID, type TabRecord } from '@/shared/types';
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

/** 「暂存 · MM-DD HH:mm」—— 未分类整批收纳时的默认任务名。 */
function stashName(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `暂存 · ${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 关闭一个标签,或在其 chromeTabId 已失效/错位时清除幻影记录。
 * 关键:只有当真实标签的 url 与记录一致时才关闭,避免因 id 陈旧/错位误关别的标签
 * (Chrome 会 discard/换 id,尤其图片等重标签)。
 */
async function closeOrPurge(record: TabRecord, repo: Repository): Promise<void> {
  if (record.chromeTabId == null) {
    await repo.removeTab(record.id);
    return;
  }
  try {
    const live = await chrome.tabs.get(record.chromeTabId);
    if (live && live.url === record.url) {
      await chrome.tabs.remove(record.chromeTabId); // 真实对应标签 → 关闭(onRemoved 清记录)
      return;
    }
  } catch {
    /* 标签已不存在 */
  }
  await repo.removeTab(record.id); // id 陈旧/错位 → 直接清幻影记录,绝不误关其它标签
}

/** 收纳一个 Context 的活跃标签(持锁关闭,避免脱组/关闭事件回灌幻影)。 */
async function archiveAndClose(contextId: string, repo: Repository, now: number): Promise<void> {
  const closedTabIds = await repo.archiveContext(contextId, now);
  pauseSync();
  try {
    await Promise.all(closedTabIds.map((id) => chrome.tabs.remove(id).catch(() => {})));
  } finally {
    resumeSync();
  }
}

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
      await archiveAndClose(cmd.contextId, repo, now);
      onChange();
      const { token, ttlMs } = undo.register('archive', cmd.contextId, UNDO_TTL_MS);
      return { type: 'UNDOABLE', action: 'archive', token, ttlMs };
    }

    case 'ARCHIVE_INBOX': {
      // 未分类不可整体归档(它是常驻收件箱),但可把当前零散标签整批「收纳」:
      // 移入一个新「暂存」任务再归档,未分类清空但仍保留。
      const inbox = await repo.getContext(INBOX_ID);
      if (!inbox || inbox.tabOrder.length === 0) return;
      const ctx = await repo.createContext(stashName(now), now);
      for (const tabId of [...inbox.tabOrder]) {
        await repo.moveTab(tabId, ctx.id, now);
      }
      await archiveAndClose(ctx.id, repo, now);
      onChange();
      const { token, ttlMs } = undo.register('archive', ctx.id, UNDO_TTL_MS);
      return { type: 'UNDOABLE', action: 'archive', token, ttlMs };
    }

    case 'RESTORE_CONTEXT':
      await restoreContext(cmd.contextId, ctx);
      onChange();
      return;

    case 'MERGE_DUPLICATES': {
      const { tabs } = await repo.getSnapshot();
      const redundant = findDuplicateGroups(tabs).flatMap((g) => g.redundant);
      // 逐个关闭真实的冗余标签,或清除已失效/错位的幻影记录(见 closeOrPurge)
      for (const r of redundant) await closeOrPurge(r, repo);
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
      await closeOrPurge(record, repo);
      onChange();
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
