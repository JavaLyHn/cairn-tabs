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
import { isSyncPaused } from './sync-lock';
import { COMMAND_TYPES, type Command } from '@/shared/messaging';
import { friendlyAIError } from '@/shared/ai';

const search = new SearchIndex();
const undo = new UndoManager();
const penalties = new PenaltyStore();
const portMappings = new PortMappingStore();
const flags = new FlagsStore();
const memory = new MemoryStore();
const aiSettings = new AISettingsStore();

const DISCARD_ALARM = 'discard-scan';

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
  const now = Date.now();
  if (!force && now - lastReconcileAt < 1200) return;
  lastReconcileAt = now;
  await reconcile(repository, scheduleBroadcast);
  await reconcileGroups(repository, scheduleBroadcast);
}

const cmdCtx: CommandContext = {
  repo: repository,
  search,
  undo,
  onChange: scheduleBroadcast,
  recordNegative: (url, contextId) => penalties.recordNegativeForUrl(url, contextId),
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
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      return PROVIDERS[p]
        .complete(
          {
            system,
            user,
            model: aiSettings.effectiveModel(),
            maxTokens: 1024,
            baseUrl: aiSettings.baseUrlFor(),
            signal: ctrl.signal,
          },
          key,
        )
        .finally(() => clearTimeout(timer));
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
  },
};

/** ⌘⇧K:打开侧边栏并请其展开搜索 overlay。 */
async function openSidePanelForSearch(): Promise<void> {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (win.id != null) {
      // 置一个会话级标志,侧边栏挂载时读取(处理面板此前未打开的情况)
      await chrome.storage.session.set({ pendingSearch: true });
      await chrome.sidePanel.open({ windowId: win.id });
    }
  } catch (e) {
    console.warn('[cairn-tabs] open side panel failed', e);
  }
  // 面板已打开的情况:直接通知它展开搜索
  chrome.runtime.sendMessage({ type: 'OPEN_SEARCH' }).catch(() => {});
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

  // ⌘⇧K
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'open-search') void openSidePanelForSearch();
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

  // 挂起扫描 alarm(F-11)
  chrome.alarms?.onAlarm.addListener((a) => {
    if (a.name === DISCARD_ALARM) runScanNow();
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
  await reconcile(repository, scheduleBroadcast);
  await reconcileGroups(repository, scheduleBroadcast);
  await broadcast();
}
