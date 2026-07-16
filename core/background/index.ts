// SW 装配:hydrate → 注册监听 → 命令分发 → 广播(见设计文档 §4)。

import { repository } from '../store/repositories';
import { SearchIndex } from '../search';
import { UndoManager } from './undo';
import { registerTabListeners, reconcile } from './tab-sync';
import { registerGroupListeners, reconcileGroups } from './group-sync';
import { handleCommand, type CommandContext } from './commands';
import { PenaltyStore } from './penalties';
import { PortMappingStore, FlagsStore, MemoryStore, AISettingsStore } from './settings';
import { PROVIDERS } from '../ai/provider';
import { runDiscardScan } from './discard-scan';
import { archiveUnrestoredContexts } from './session-recovery';
import { isSyncPaused } from './sync-lock';
import { COMMAND_TYPES, type Command } from '@/shared/messaging';
import { friendlyAIError } from '@/shared/ai';
import { createAiRunner } from './ai-runner';

const search = new SearchIndex();
const undo = new UndoManager();
const penalties = new PenaltyStore();
const portMappings = new PortMappingStore();
const flags = new FlagsStore();
const memory = new MemoryStore();
const aiSettings = new AISettingsStore();

const DISCARD_ALARM = 'discard-scan';
const RECOVERY_ALARM = 'session-recovery';
const GRACE_MS = 10_000; // 冷启动宽限:等 Chrome 恢复会话,期间对账不清删

// AI 请求运行器:承载在飞请求的取消/超时逻辑(见 ai-runner.ts)。
const aiRunner = createAiRunner();

/** 读快照 → 重建搜索索引 → 广播 STATE_SNAPSHOT(侧边栏关闭时 sendMessage 失败,忽略)。 */
async function broadcast(): Promise<void> {
  const { contexts, tabs } = await repository.getSnapshot();
  search.rebuild(contexts, tabs);
  chrome.runtime
    .sendMessage({
      type: 'STATE_SNAPSHOT',
      contexts,
      tabs,
      portMappings: portMappings.get(),
      flags: flags.get(),
      discardedBytes: memory.get(),
      ai: aiSettings.status(),
    })
    .catch(() => {});
}

/** 挂起扫描 alarm:仅在自动挂起开启时注册,关闭时取消(默认关 → 零后台开销)。 */
function ensureDiscardAlarm(enabled: boolean): void {
  if (!chrome.alarms) return;
  if (enabled) chrome.alarms.create(DISCARD_ALARM, { periodInMinutes: 5 });
  else chrome.alarms.clear(DISCARD_ALARM).catch(() => {});
}

function runScanNow(): void {
  const f = flags.get();
  void runDiscardScan(
    repository,
    { discardAfterMinutes: f.discardAfterMinutes, skipLocalhost: f.discardSkipsLocalhost },
    (bytes) => memory.add(bytes),
    scheduleBroadcast,
  );
}

let broadcastPending = false;
let sessionRecovering = false; // 会话恢复进行中:挡住外部并发 reconcileNow,防抢清未归档任务
function scheduleBroadcast(): void {
  if (broadcastPending) return;
  broadcastPending = true;
  setTimeout(() => {
    broadcastPending = false;
    void broadcast();
  }, 40);
}

// 运行期对账:清除「非空但已死」的幻影记录、刷新陈旧 url,让面板与真实标签一致。
// 只在 hydrate 时对账不够——SW 休眠期漏收的 onRemoved/onUpdated 会留下幻影,直到下次冷启动。
// 因此在面板聚焦(REQUEST_SNAPSHOT)、合并前、点到幻影时按需触发。节流避免聚焦事件连发时重复扫描。
let lastReconcileAt = 0;
async function reconcileNow(force = false): Promise<void> {
  if (isSyncPaused()) return; // 收纳/恢复期间不对账,避免与同步锁内的批量增删打架
  if (sessionRecovering) return; // 会话恢复进行中:不并发对账,避免抢在归档判定前清删
  const now = Date.now();
  if (!force && now - lastReconcileAt < 1200) return;
  lastReconcileAt = now;
  // 冷启动宽限期内:只重绑/重连、不清删(防止抢在会话恢复判定前把未恢复任务清掉)
  const { graceUntil } = await chrome.storage.session.get('graceUntil');
  const inGrace = typeof graceUntil === 'number' && Date.now() < graceUntil;
  await reconcile(repository, scheduleBroadcast, { purge: !inGrace });
  await reconcileGroups(repository, scheduleBroadcast, { prune: !inGrace });
}

/** 宽限结束(RECOVERY_ALARM):接住迟到的恢复 → 归档没恢复的命名任务 → 常规清理。 */
async function runSessionRecovery(): Promise<void> {
  sessionRecovering = true;
  try {
    await chrome.storage.session.remove('graceUntil'); // 先清标志:此后对账恢复清删
    await reconcile(repository, scheduleBroadcast, { purge: false });
    await reconcileGroups(repository, scheduleBroadcast, { prune: false });
    await archiveUnrestoredContexts(repository, Date.now());
    await reconcile(repository, scheduleBroadcast, { purge: true });
    await reconcileGroups(repository, scheduleBroadcast, { prune: true });
    scheduleBroadcast();
  } finally {
    sessionRecovering = false;
  }
}

const cmdCtx: CommandContext = {
  repo: repository,
  search,
  undo,
  onChange: scheduleBroadcast,
  recordNegative: (url, contextId) => penalties.recordNegativeForUrl(url, contextId),
  onReclaim: (bytes) => memory.add(bytes),
  ports: {
    set: (port, project) => portMappings.set(port, project),
    remove: (port) => portMappings.remove(port),
  },
  flags: {
    get: () => flags.get(),
    patch: (partial) => flags.patch(partial),
  },
  onAutoDiscardChanged: (enabled) => {
    ensureDiscardAlarm(enabled);
    if (enabled) runScanNow(); // 立即扫一轮,不必等第一个 5 分钟周期
  },
  reconcile: (force) => reconcileNow(force),
  ai: {
    status: () => aiSettings.status(),
    configured: () => aiSettings.configured(),
    complete: (system, user) => {
      const p = aiSettings.provider();
      const key = aiSettings.keyFor();
      if (!key) return Promise.reject(new Error('no key'));
      return aiRunner.run(
        (signal) =>
          PROVIDERS[p].complete(
            {
              system,
              user,
              model: aiSettings.effectiveModel(),
              maxTokens: 1024,
              temperature: 0, // 整理/命名求稳定可复现:同一批标签每次给同样的建议(否则时有时无)
              baseUrl: aiSettings.baseUrlFor(),
              signal,
            },
            key,
          ),
        30_000,
      );
    },
    set: (provider, key, model, baseUrl) => aiSettings.set(provider, key, model, baseUrl),
    test: async () => {
      const p = aiSettings.provider();
      const key = aiSettings.keyFor();
      if (!key) return { ok: false, detail: '未配置 key' };
      const model = aiSettings.effectiveModel();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      const t0 = Date.now();
      try {
        // 极小请求验证连通(auth + model + endpoint 一次跑通即算成功)
        await PROVIDERS[p].complete(
          {
            system: '你是连接测试。',
            user: '仅回复 OK。',
            model,
            maxTokens: 8,
            baseUrl: aiSettings.baseUrlFor(),
            signal: ctrl.signal,
          },
          key,
        );
        return { ok: true, detail: `连接成功 · ${model} · ${Date.now() - t0}ms` };
      } catch (e) {
        return { ok: false, detail: friendlyAIError(e instanceof Error ? e.message : String(e)) };
      } finally {
        clearTimeout(timer);
      }
    },
    cancel: () => aiRunner.cancel(),
  },
};

/**
 * 打开侧边栏;search=true 时同时请其展开搜索 overlay。
 * 关键:chrome.sidePanel.open() 要求用户手势,且手势会被任何 await 消耗 —— 因此必须在
 * 第一个 await 处就调用它(用命令回调给的 windowId,不要先 await getLastFocused)。
 * pendingSearch 用「不 await」方式先发起,既不消耗手势,又能赶在面板加载前写入。
 */
async function openSidePanel(windowId: number | undefined, opts?: { search?: boolean }): Promise<void> {
  if (opts?.search) void chrome.storage.session.set({ pendingSearch: true });
  try {
    if (windowId != null) {
      await chrome.sidePanel.open({ windowId }); // 第一个 await 即 open,手势仍有效
    } else {
      // 兜底:命令未带 tab 时才回退(此路径可能因先 await 而丢手势,属罕见情形)
      const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
      if (win.id != null) await chrome.sidePanel.open({ windowId: win.id });
    }
  } catch (e) {
    console.warn('[cairn-tabs] open side panel failed', e);
  }
  // 面板已打开的情况:直接通知它切换搜索
  if (opts?.search) chrome.runtime.sendMessage({ type: 'OPEN_SEARCH' }).catch(() => {});
}

export function initBackground(): void {
  // 点击工具栏图标即打开侧边栏
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  // 命令消息处理(必须同步注册,以便 MV3 能为消息唤醒 SW)
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const cmd = msg as Command;
    if (!cmd || !COMMAND_TYPES.has(cmd.type)) return false; // 忽略广播事件等
    handleCommand(cmd, cmdCtx)
      .then((result) => sendResponse(result))
      .catch((err) => {
        console.error('[cairn-tabs] command failed', cmd.type, err);
        sendResponse(undefined);
      });
    return true; // 异步响应
  });

  // 快捷键:open-panel 直接开面板;open-search(⌘⇧K)开面板并展开搜索
  // 用 onCommand 回调给的 tab.windowId 直接开,避免先 await getLastFocused 丢失用户手势
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'open-search') void openSidePanel(tab?.windowId, { search: true });
    else if (command === 'open-panel') void openSidePanel(tab?.windowId);
  });

  // 标签事件 → DB(带聚簇引擎;读负样本 + 自动聚簇开关)
  registerTabListeners(
    repository,
    scheduleBroadcast,
    () => penalties.get(),
    () => flags.get().autoCluster,
  );
  // 原生分组事件 → DB(双向同步入站)
  registerGroupListeners(repository, scheduleBroadcast);

  // 挂起扫描 alarm(F-11)+ 会话恢复 alarm(宽限结束)
  chrome.alarms?.onAlarm.addListener((a) => {
    if (a.name === DISCARD_ALARM) runScanNow();
    else if (a.name === RECOVERY_ALARM) void runSessionRecovery();
  });

  // 冷启动:进入宽限窗口(期间对账不清删),GRACE_MS 后跑会话恢复判定
  chrome.runtime.onStartup?.addListener(() => {
    void chrome.storage.session.set({ graceUntil: Date.now() + GRACE_MS });
    chrome.alarms?.create(RECOVERY_ALARM, { when: Date.now() + GRACE_MS });
  });

  // hydrate:重建内存态并与真实标签对账(补偿 SW 休眠丢失的事件)
  void hydrate();
}

async function hydrate(): Promise<void> {
  const now = Date.now();
  await repository.ensureInbox(now);
  await penalties.load();
  await portMappings.load();
  await flags.load();
  await memory.load();
  await aiSettings.load();
  ensureDiscardAlarm(flags.get().autoDiscard); // 按持久化的开关恢复扫描
  // 冷启动:会话恢复可能尚未就绪 → 只重绑/重连、不清删(清删留给面板聚焦触发的对账)
  await reconcile(repository, scheduleBroadcast, { purge: false });
  await reconcileGroups(repository, scheduleBroadcast, { prune: false });
  await broadcast();
}
