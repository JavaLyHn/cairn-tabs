// 命令处理器(见设计文档 §6/§7)。SW 收到 UI 的 Command 后在此执行,再广播快照。

import type { Repository } from '../store/repositories';
import type { SearchIndex } from '../search';
import type { UndoManager, ReorgUndo, TabArchiveUndo } from './undo';
import { pauseSync, resumeSync } from './sync-lock';
import { ensureTabInContextGroup, groupTabsForContext, syncGroupTitle } from './group-sync';
import { DRAFT_CONTEXT_NAME, type Command, type Event } from '@/shared/messaging';
import { INBOX_ID, DEFAULT_FLAGS, type Flags, type TabRecord, type Context } from '@/shared/types';
import { findDuplicateGroups } from '@/shared/dedup';
import { staleTabs } from '@/shared/stale';
import { BYTES_PER_DISCARD } from '@/shared/discard';
import { hostnameOf, registrableDomain } from '../clustering/signals';
import {
  buildOrganizePrompt,
  parseOrganizeResponse,
  buildNamePrompt,
  parseNameResponse,
  summarizeTaskTabs,
} from '../ai/organize';
import type { AIProviderId, AIStatus } from '@/shared/ai';
import { isAICancelled } from '@/shared/ai';

export interface CommandContext {
  repo: Repository;
  search: SearchIndex;
  undo: UndoManager;
  onChange: () => void;
  /** 记录负样本(某 URL 的域名不属于 contextId);测试中可省略。 */
  recordNegative?: (url: string, contextId: string) => Promise<void>;
  /** 累计估算回收内存(F-11):归档关闭标签、挂起均可上报;测试中可省略。 */
  onReclaim?: (bytes: number) => Promise<void>;
  /** localhost 端口映射的读写;测试中可省略。 */
  ports?: {
    set: (port: number, project: string) => Promise<void>;
    remove: (port: number) => Promise<void>;
  };
  /** 功能开关读写;测试中可省略。 */
  flags?: {
    get: () => Flags;
    patch: (partial: Partial<Flags>) => Promise<void>;
  };
  /** 自动挂起开关变化时的副作用(注册/取消 alarm);测试中可省略。 */
  onAutoDiscardChanged?: (enabled: boolean) => void;
  /**
   * 与真实标签全量对账(清除已消失的幻影记录、刷新陈旧 url)。force 跳过节流。
   * 供 REQUEST_SNAPSHOT(聚焦自愈)/ MERGE_DUPLICATES(合并前净化)/ ACTIVATE_TAB(点到幻影自愈)调用。
   * 测试中可省略(省略则相关命令退回旧行为,依赖 closeOrPurge 兜底)。
   */
  reconcile?: (force?: boolean) => Promise<void>;
  /** AI 整理(F-13);测试中可注入假实现,省略则相关命令降级。 */
  ai?: {
    status: () => AIStatus;
    configured: () => boolean;
    complete: (system: string, user: string) => Promise<string>;
    set: (provider: AIProviderId, key?: string, model?: string, baseUrl?: string) => Promise<void>;
    test: () => Promise<{ ok: boolean; detail: string }>;
    /** 中止当前在飞的 AI 请求(用户点「取消」)。 */
    cancel: () => void;
  };
}

const RESTORE_STAGGER_MS = 50;
const UNDO_TTL_MS = 5000;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 「{前缀} · MM-DD HH:mm」—— 整批收纳时的默认任务名。 */
function stampedName(prefix: string, now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix} · ${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 关闭一个标签,或在其 chromeTabId 已失效/错位时清除幻影记录。
 * 关键:只有当真实标签的 url 与记录一致时才关闭,避免因 id 陈旧/错位误关别的标签
 * (Chrome 会 discard/换 id,尤其图片等重标签)。
 */
async function closeOrPurge(record: TabRecord, repo: Repository, trustId = false): Promise<void> {
  if (record.chromeTabId == null) {
    await repo.removeTab(record.id);
    return;
  }
  try {
    const live = await chrome.tabs.get(record.chromeTabId);
    // trustId(用户点某行的 ×):标签存在即关 —— 会话内 tab id 不复用,导航过也仍是同一标签,
    //   否则记录 url 一陈旧就关不掉(见回归测试)。
    // 非 trustId(MERGE 自动批量):保守,仅当 url 也一致才关,避免误关别的标签。
    if (live && (trustId || live.url === record.url)) {
      await chrome.tabs.remove(record.chromeTabId); // onRemoved 清记录
      return;
    }
  } catch {
    /* 标签已不存在 */
  }
  await repo.removeTab(record.id); // id 已消失/错位 → 清幻影记录,绝不误关其它标签
}

/** 收纳一个 Context 的活跃标签(持锁关闭,避免脱组/关闭事件回灌幻影)。返回关闭的活标签数。 */
async function archiveAndClose(contextId: string, repo: Repository, now: number): Promise<number> {
  const closedTabIds = await repo.archiveContext(contextId, now);
  pauseSync();
  try {
    await Promise.all(closedTabIds.map((id) => chrome.tabs.remove(id).catch(() => {})));
  } finally {
    resumeSync();
  }
  return closedTabIds.length;
}

/** 把标签归入某任务(与手动拖拽同一套:移动 + 锁定 + 并入原生分组)。 */
async function assignTab(
  tabRecordId: string,
  toContextId: string,
  repo: Repository,
  now: number,
  opts?: { pin?: boolean },
): Promise<void> {
  const rec = await repo.getTab(tabRecordId);
  if (!rec) return;
  await repo.moveTab(tabRecordId, toContextId, now);
  if (opts?.pin !== false) await repo.pinTab(tabRecordId);
  const after = await repo.getTab(tabRecordId);
  if (after?.chromeTabId != null)
    await ensureTabInContextGroup(repo, toContextId, after.chromeTabId);
}

/** 新建一个命名簇,把给定标签移入(默认锁定)+ 同步原生分组标题。返回新建 contextId。 */
async function createClusterFromTabs(
  name: string,
  tabIds: string[],
  repo: Repository,
  now: number,
  opts?: { pin?: boolean },
): Promise<string> {
  const created = await repo.createContext(name, now);
  for (const tabId of tabIds) await assignTab(tabId, created.id, repo, now, opts);
  await syncGroupTitle(repo, created.id, name);
  return created.id;
}

/** 撤销「整理全部」:重建被删空组 → 把标签移回原组 → 删掉本次新建的空组。 */
async function undoReorg(reorg: ReorgUndo, repo: Repository, now: number): Promise<void> {
  const idMap = new Map<string, string>(); // 旧被删组 id → 重建后新 id
  for (const c of reorg.recreate) {
    const fresh = await repo.createContext(c.name, now, { color: c.color });
    idMap.set(c.id, fresh.id);
    await syncGroupTitle(repo, fresh.id, c.name);
  }
  for (const m of reorg.moves) {
    const target = idMap.get(m.toContextId) ?? m.toContextId;
    const exists = await repo.getContext(target);
    if (!exists) continue; // 目标既不存在也未重建 → 跳过(极端兜底)
    await repo.moveTab(m.tabId, target, now); // 不打锁,忠实还原
    const t = await repo.getTab(m.tabId);
    if (t?.chromeTabId != null) await ensureTabInContextGroup(repo, target, t.chromeTabId);
  }
  for (const id of reorg.deleteContextIds) {
    await repo.deleteContext(id, now); // 标签已移回,应为空;deleteContext 会把残余标签兜回未分类
  }
}

/** 撤销「把开着的标签归档进已归档任务」:重开该标签 + 移回原任务(原任务已删则兜回未分类)。 */
async function undoTabArchive(tabArchive: TabArchiveUndo, ctx: CommandContext): Promise<void> {
  const { repo } = ctx;
  const record = await repo.getTab(tabArchive.tabId);
  if (!record) return;
  const fromExists = await repo.getContext(tabArchive.fromContextId);
  const target = fromExists ? tabArchive.fromContextId : INBOX_ID;

  let windowId: number | undefined;
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    windowId = win.id;
  } catch {
    windowId = undefined;
  }

  pauseSync();
  try {
    if (record.chromeTabId == null) {
      const created = await chrome.tabs.create({ url: record.url, active: false, windowId });
      if (created.id != null) {
        await repo.bindChromeTab(
          record.id,
          created.id,
          created.windowId ?? windowId ?? 0,
          Date.now(),
        );
      }
    }
    await repo.moveTab(record.id, target, Date.now());
    const after = await repo.getTab(record.id);
    if (after?.chromeTabId != null) {
      await ensureTabInContextGroup(repo, target, after.chromeTabId);
    }
  } finally {
    resumeSync();
  }
}

export async function handleCommand(cmd: Command, ctx: CommandContext): Promise<Event | void> {
  const { repo, search, undo, onChange, recordNegative, ports, flags, onReclaim } = ctx;
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

    case 'DELETE_CONTEXT': {
      // 删除活跃命名簇前,先收集其活标签的 chromeTabId —— 删除后要把它们从原生分组解出。
      // 否则原生分组会残留在标签栏,并被对账重新收编成一个新任务(标签「又回到任务下」)。
      const target = await repo.getContext(cmd.contextId);
      const liveIds: number[] = [];
      if (target && target.status === 'active' && cmd.contextId !== INBOX_ID) {
        for (const tabId of target.tabOrder) {
          const t = await repo.getTab(tabId);
          if (t?.chromeTabId != null) liveIds.push(t.chromeTabId);
        }
      }
      await repo.deleteContext(cmd.contextId, now);
      if (liveIds.length) {
        // 未分类 = 未分组:把标签从原生分组解出(原生分组随之解散);持锁避免事件回灌重新收编
        pauseSync();
        try {
          await chrome.tabs.ungroup(liveIds as [number, ...number[]]).catch(() => {}); // 上面已保证非空
        } finally {
          resumeSync();
        }
      }
      onChange();
      return;
    }

    case 'MOVE_TAB': {
      const before = await repo.getTab(cmd.tabRecordId);
      const target = await repo.getContext(cmd.toContextId);
      await repo.moveTab(cmd.tabRecordId, cmd.toContextId, now);
      await repo.pinTab(cmd.tabRecordId); // 人工归属,引擎不再改动(PRD §6.1)
      const rec = await repo.getTab(cmd.tabRecordId);

      // 从命名簇拖出 → 记负样本(降低该域名再归入该簇的权重,PRD §6.2)
      if (before && before.contextId !== INBOX_ID && before.contextId !== cmd.toContextId) {
        await recordNegative?.(before.url, before.contextId);
      }

      // 拖进「已归档任务」:把这个开着的标签直接归档进去(关标签、清 chromeTabId),
      // 任务保持归档、不恢复重开。可撤销(见 undoTabArchive)。
      if (target?.status === 'archived') {
        if (before && before.contextId !== cmd.toContextId && rec?.chromeTabId != null) {
          const closedId = rec.chromeTabId;
          await repo.updateTab(rec.id, { chromeTabId: undefined, windowId: undefined });
          pauseSync();
          try {
            await chrome.tabs.remove(closedId).catch(() => {});
          } finally {
            resumeSync();
          }
          await onReclaim?.(BYTES_PER_DISCARD);
          onChange();
          const { token, ttlMs } = undo.registerTabArchive(
            { tabId: rec.id, fromContextId: before.contextId },
            UNDO_TTL_MS,
          );
          return { type: 'UNDOABLE', action: 'archive-tab', token, ttlMs };
        }
        // 已归档标签在归档任务间挪动:纯移动,无标签可关、不撤销
        onChange();
        return;
      }

      if (rec?.chromeTabId != null) {
        await ensureTabInContextGroup(repo, cmd.toContextId, rec.chromeTabId);
      }
      onChange();
      return;
    }

    case 'ARCHIVE_CONTEXT': {
      if (cmd.contextId === INBOX_ID) return;
      const closed = await archiveAndClose(cmd.contextId, repo, now);
      if (closed > 0) await onReclaim?.(closed * BYTES_PER_DISCARD);
      onChange();
      const { token, ttlMs } = undo.register('archive', cmd.contextId, UNDO_TTL_MS);
      return { type: 'UNDOABLE', action: 'archive', token, ttlMs };
    }

    case 'ARCHIVE_INBOX': {
      // 未分类不可整体归档(它是常驻收件箱),但可把当前零散标签整批「收纳」:
      // 移入一个新「暂存」任务再归档,未分类清空但仍保留。
      const inbox = await repo.getContext(INBOX_ID);
      if (!inbox || inbox.tabOrder.length === 0) return;
      // restoreTo=未分类:这是零散标签的临时暂存,恢复时标签应回到未分类,而不是变成一个「暂存」命名任务。
      const ctx = await repo.createContext(stampedName('暂存', now), now, { restoreTo: INBOX_ID });
      for (const tabId of [...inbox.tabOrder]) {
        await repo.moveTab(tabId, ctx.id, now);
      }
      const closedInbox = await archiveAndClose(ctx.id, repo, now);
      if (closedInbox > 0) await onReclaim?.(closedInbox * BYTES_PER_DISCARD);
      onChange();
      const { token, ttlMs } = undo.register('archive', ctx.id, UNDO_TTL_MS);
      return { type: 'UNDOABLE', action: 'archive', token, ttlMs };
    }

    case 'ARCHIVE_STALE': {
      // 把所有陈旧标签(超过 staleDays 未访问)移入一个「陈旧」暂存任务再整批收纳。
      const { tabs } = await repo.getSnapshot();
      const staleDays = (flags?.get() ?? DEFAULT_FLAGS).staleDays;
      const stale = staleTabs(tabs, now, staleDays);
      if (stale.length === 0) return;
      // 同「暂存」:陈旧收纳也是临时暂存,恢复时标签回未分类,不复活成「陈旧」命名任务。
      const ctx = await repo.createContext(stampedName('陈旧', now), now, { restoreTo: INBOX_ID });
      for (const t of stale) await repo.moveTab(t.id, ctx.id, now);
      const closedStale = await archiveAndClose(ctx.id, repo, now);
      if (closedStale > 0) await onReclaim?.(closedStale * BYTES_PER_DISCARD);
      onChange();
      const { token, ttlMs } = undo.register('archive', ctx.id, UNDO_TTL_MS);
      return { type: 'UNDOABLE', action: 'archive', token, ttlMs };
    }

    case 'RESTORE_CONTEXT':
      await restoreContext(cmd.contextId, ctx);
      onChange();
      return;

    case 'MERGE_DUPLICATES': {
      // 先对账:清掉「非空但已死」的陈旧记录、刷新陈旧 url。否则死记录可能被选作 keeper,
      // 导致合并关掉真实存活的那个、留下打不开的幻影(见 Bug 报告)。
      await ctx.reconcile?.(true);
      const { tabs } = await repo.getSnapshot();
      const redundant = findDuplicateGroups(tabs).flatMap((g) => g.redundant);
      // 逐个关闭真实的冗余标签,或清除已失效/错位的幻影记录(见 closeOrPurge,兜底)
      for (const r of redundant) await closeOrPurge(r, repo);
      onChange();
      return;
    }

    case 'UNDO': {
      const e = undo.consume(cmd.token);
      if (!e) return;
      if (e.reorg) {
        await undoReorg(e.reorg, repo, now);
        onChange();
        return;
      }
      if (e.tabArchive) {
        await undoTabArchive(e.tabArchive, ctx);
        onChange();
        return;
      }
      if (e.contextId) {
        await restoreContext(e.contextId, ctx);
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
        try {
          await chrome.tabs.update(record.chromeTabId, { active: true });
          if (record.windowId != null) {
            await chrome.windows.update(record.windowId, { focused: true }).catch(() => {});
          }
        } catch {
          // 记录指向的标签已不存在(幻影,点了没反应)→ 对账清除,让面板与浏览器恢复一致
          await ctx.reconcile?.(true);
          onChange();
        }
      }
      return;
    }

    case 'CLOSE_TAB': {
      const record = await repo.getTab(cmd.tabRecordId);
      if (!record) return;
      await closeOrPurge(record, repo, true); // 用户直接关这一行 → 标签存在即关
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
      await flags?.patch({ autoCluster: cmd.enabled });
      onChange();
      return;

    case 'SET_STALE_HINTS':
      await flags?.patch({ staleHints: cmd.enabled });
      onChange();
      return;

    case 'SET_AUTO_DISCARD':
      await flags?.patch({ autoDiscard: cmd.enabled });
      ctx.onAutoDiscardChanged?.(cmd.enabled); // 注册/取消挂起扫描 alarm
      onChange();
      return;

    case 'SET_DISCARD_SKIP_LOCALHOST':
      await flags?.patch({ discardSkipsLocalhost: cmd.enabled });
      onChange();
      return;

    case 'SET_STALE_DAYS':
      await flags?.patch({ staleDays: Math.max(1, Math.min(90, Math.round(cmd.days))) });
      onChange();
      return;

    case 'SET_DISCARD_AFTER_MINUTES':
      await flags?.patch({
        discardAfterMinutes: Math.max(5, Math.min(480, Math.round(cmd.minutes))),
      });
      onChange();
      return;

    case 'SET_SAME_DOMAIN_PROMOTE_SIZE':
      await flags?.patch({
        sameDomainPromoteSize: Math.max(2, Math.min(20, Math.round(cmd.size))),
      });
      onChange();
      return;

    case 'PROMOTE_SAME_DOMAIN': {
      if (cmd.tabIds.length === 0) return;
      await createClusterFromTabs(cmd.domain, cmd.tabIds, repo, now);
      onChange();
      return;
    }

    case 'SET_TAB_STARRED':
      await repo.setTabStarred(cmd.tabRecordId, cmd.starred);
      onChange();
      return;

    case 'AI_SUGGEST_NAME': {
      if (!ctx.ai || !ctx.ai.configured()) return { type: 'AI_ERROR', reason: 'no_key' };
      const { tabs } = await repo.getSnapshot();
      const own = tabs.filter((t) => t.contextId === cmd.contextId);
      if (own.length === 0) return { type: 'AI_ERROR', reason: 'empty' };
      const { system, user } = buildNamePrompt(
        own.map((t) => ({ title: t.title, domain: registrableDomain(hostnameOf(t.url)) })),
      );
      let raw: string;
      try {
        raw = await ctx.ai.complete(system, user);
      } catch (e) {
        if (isAICancelled(e)) return { type: 'AI_ERROR', reason: 'cancelled' };
        return { type: 'AI_ERROR', reason: 'network' };
      }
      const name = parseNameResponse(raw);
      if (!name) return { type: 'AI_ERROR', reason: 'parse' };
      return { type: 'AI_NAME', name };
    }

    case 'SET_AI_SETTINGS':
      await ctx.ai?.set(cmd.provider, cmd.key, cmd.model, cmd.baseUrl);
      onChange();
      return;

    case 'TEST_AI_CONNECTION': {
      if (!ctx.ai || !ctx.ai.configured()) {
        return { type: 'AI_TEST_RESULT', ok: false, detail: '未配置 —— 请先填 key' };
      }
      const r = await ctx.ai.test();
      return { type: 'AI_TEST_RESULT', ok: r.ok, detail: r.detail };
    }

    case 'CANCEL_AI':
      ctx.ai?.cancel();
      return;

    case 'AI_ORGANIZE_INBOX': {
      if (!ctx.ai || !ctx.ai.configured()) return { type: 'AI_ERROR', reason: 'no_key' };
      const { contexts, tabs } = await repo.getSnapshot();
      const loose = tabs.filter((t) => t.contextId === INBOX_ID && t.chromeTabId != null);
      if (loose.length === 0) return { type: 'AI_ERROR', reason: 'empty' };
      const tasks = contexts.filter((c) => c.id !== INBOX_ID && c.status === 'active');
      const { system, user } = buildOrganizePrompt(
        loose.map((t) => ({
          id: t.id,
          title: t.title,
          domain: registrableDomain(hostnameOf(t.url)),
        })),
        tasks.map((c) => {
          const own = tabs.filter((t) => t.contextId === c.id);
          const sig = summarizeTaskTabs(
            own.map((t) => ({ title: t.title, domain: registrableDomain(hostnameOf(t.url)) })),
          );
          return { id: c.id, name: c.name, domains: sig.domains, samples: sig.samples };
        }),
      );
      let raw: string;
      try {
        raw = await ctx.ai.complete(system, user);
      } catch (e) {
        if (isAICancelled(e)) return { type: 'AI_ERROR', reason: 'cancelled' };
        return { type: 'AI_ERROR', reason: 'network' };
      }
      const plan = parseOrganizeResponse(
        raw,
        new Set(loose.map((t) => t.id)),
        new Set(tasks.map((c) => c.id)),
      );
      if (!plan) return { type: 'AI_ERROR', reason: 'parse' };
      return { type: 'AI_PLAN', plan, tabs: loose };
    }

    case 'AI_ORGANIZE_ALL': {
      if (!ctx.ai || !ctx.ai.configured()) return { type: 'AI_ERROR', reason: 'no_key' };
      const { contexts, tabs } = await repo.getSnapshot();
      // 可动集:打开中、非 ★重点、非手动拖过(pinned)
      const movable = tabs.filter((t) => t.chromeTabId != null && !t.starred && !t.pinned);
      if (movable.length === 0) return { type: 'AI_ERROR', reason: 'empty' };
      const tasks = contexts.filter((c) => c.id !== INBOX_ID && c.status === 'active');
      const { system, user } = buildOrganizePrompt(
        movable.map((t) => ({
          id: t.id,
          title: t.title,
          domain: registrableDomain(hostnameOf(t.url)),
        })),
        tasks.map((c) => {
          const own = tabs.filter((t) => t.contextId === c.id);
          const sig = summarizeTaskTabs(
            own.map((t) => ({ title: t.title, domain: registrableDomain(hostnameOf(t.url)) })),
          );
          return { id: c.id, name: c.name, domains: sig.domains, samples: sig.samples };
        }),
        { aggressive: true },
      );
      let raw: string;
      try {
        raw = await ctx.ai.complete(system, user);
      } catch (e) {
        if (isAICancelled(e)) return { type: 'AI_ERROR', reason: 'cancelled' };
        return { type: 'AI_ERROR', reason: 'network' };
      }
      const plan = parseOrganizeResponse(
        raw,
        new Set(movable.map((t) => t.id)),
        new Set(tasks.map((c) => c.id)),
      );
      if (!plan) return { type: 'AI_ERROR', reason: 'parse' };
      return { type: 'AI_PLAN', plan, tabs: movable };
    }

    case 'APPLY_AI_PLAN': {
      const global = cmd.global === true;
      // global:先记下 plan 涉及标签的原 contextId,以及当前活跃命名组集合(用于删空组 + 撤销)
      const before = new Map<string, string>();
      const beforeCtxIds: string[] = [];
      if (global) {
        const planTabIds = new Set<string>([
          ...cmd.plan.newGroups.flatMap((g) => g.tabIds),
          ...cmd.plan.assign.flatMap((a) => a.tabIds),
        ]);
        for (const id of planTabIds) {
          const t = await repo.getTab(id);
          if (t) before.set(id, t.contextId);
        }
        const { contexts } = await repo.getSnapshot();
        for (const c of contexts)
          if (c.id !== INBOX_ID && c.status === 'active') beforeCtxIds.push(c.id);
      }

      const createdIds: string[] = [];
      for (const g of cmd.plan.newGroups) {
        createdIds.push(await createClusterFromTabs(g.name, g.tabIds, repo, now, { pin: !global }));
      }
      for (const a of cmd.plan.assign) {
        const target = await repo.getContext(a.taskId);
        if (!target || target.status !== 'active') continue;
        for (const tabId of a.tabIds) await assignTab(tabId, a.taskId, repo, now, { pin: !global });
      }
      if (!global) {
        onChange();
        return;
      }

      // 删空组:重排后变空的"原有"命名活跃组,记录以便撤销重建
      const recreate: ReorgUndo['recreate'] = [];
      for (const id of beforeCtxIds) {
        const c = await repo.getContext(id);
        if (c && c.status === 'active' && c.tabOrder.length === 0) {
          recreate.push({ id, name: c.name, color: c.color });
          await repo.deleteContext(id, now);
        }
      }
      // moves:真正发生移动的(原 != 现),撤销时移回原 contextId
      const moves: ReorgUndo['moves'] = [];
      for (const [tabId, orig] of before) {
        const cur = (await repo.getTab(tabId))?.contextId;
        if (cur && cur !== orig) moves.push({ tabId, toContextId: orig });
      }
      onChange();
      const { token, ttlMs } = undo.registerReorg(
        { moves, recreate, deleteContextIds: createdIds },
        UNDO_TTL_MS,
      );
      return { type: 'UNDOABLE', action: 'reorg', token, ttlMs };
    }

    case 'REQUEST_SNAPSHOT':
      // 面板挂载/重新聚焦/可见时会发此命令 → 顺带对账(节流),自愈休眠期漏收事件留下的幻影
      await ctx.reconcile?.();
      onChange();
      return;

    case 'SEARCH':
      return { type: 'SEARCH_RESULTS', query: cmd.query, results: search.query(cmd.query) };

    case 'IMPORT_DATA': {
      // 非破坏性导入:新任务作为「已归档」落库(不动现有数据、不碰 chrome 标签,故无需同步锁)。
      const res = await repo.importData(cmd.contexts, cmd.tabs, now);
      onChange();
      return { type: 'IMPORTED', contexts: res.contexts, tabs: res.tabs };
    }
  }
}

/** 整簇恢复(见设计文档 §7.2):限速重开 + 立即挂起 + 回填 chromeTabId。 */
/**
 * 临时暂存簇(未分类整批收纳的「暂存」、陈旧收纳的「陈旧」)恢复时应把标签放回目标簇
 * (通常是未分类),而不是复活成一个命名任务。返回目标簇 id,普通任务返回 undefined。
 * 除了新写入的 restoreTo 字段,也按名字前缀兜底识别本次修复前已归档的暂存/陈旧簇。
 */
function inboxStashTarget(context: Context): string | undefined {
  if (context.restoreTo) return context.restoreTo;
  if (/^(暂存|陈旧) · /.test(context.name)) return INBOX_ID;
  return undefined;
}

async function restoreContext(contextId: string, ctx: CommandContext): Promise<void> {
  const { repo } = ctx;
  const context = await repo.getContext(contextId);
  if (!context || context.status !== 'archived') return;
  const stashTarget = inboxStashTarget(context);

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
          await repo.bindChromeTab(
            recordId,
            created.id,
            created.windowId ?? windowId ?? 0,
            Date.now(),
          );
          if (stashTarget) {
            // 暂存簇:标签回到目标簇(未分类=不成组),只有成功重开的才迁回(避免幻影记录)
            await repo.moveTab(recordId, stashTarget, Date.now());
          } else {
            createdIds.push(created.id);
          }
        }
      } catch {
        // 达到浏览器标签上限等 → 跳过该标签,继续恢复其余
      }
      await delay(RESTORE_STAGGER_MS);
    }
    if (stashTarget) {
      // 标签已迁回目标簇;删除这个空的暂存簇(status=archived,deleteContext 会清掉未能重开的残余指针,不留幻影)
      await repo.deleteContext(contextId, Date.now());
    } else {
      await repo.setContextActive(contextId);
      // 把恢复的标签编成原生分组(与 §6.4 双向同步一致)
      await groupTabsForContext(repo, contextId, createdIds);
    }
  } finally {
    resumeSync();
  }
}
