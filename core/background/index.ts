// SW 装配:hydrate → 注册监听 → 命令分发 → 广播(见设计文档 §4)。

import { repository } from '../store/repositories';
import { SearchIndex } from '../search';
import { UndoManager } from './undo';
import { registerTabListeners, reconcile } from './tab-sync';
import { registerGroupListeners, reconcileGroups } from './group-sync';
import { handleCommand, type CommandContext } from './commands';
import { PenaltyStore } from './penalties';
import { PortMappingStore } from './settings';
import { COMMAND_TYPES, type Command } from '@/shared/messaging';

const search = new SearchIndex();
const undo = new UndoManager();
const penalties = new PenaltyStore();
const portMappings = new PortMappingStore();

/** 读快照 → 重建搜索索引 → 广播 STATE_SNAPSHOT(侧边栏关闭时 sendMessage 失败,忽略)。 */
async function broadcast(): Promise<void> {
  const { contexts, tabs } = await repository.getSnapshot();
  search.rebuild(contexts, tabs);
  chrome.runtime
    .sendMessage({ type: 'STATE_SNAPSHOT', contexts, tabs, portMappings: portMappings.get() })
    .catch(() => {});
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

  // 标签事件 → DB(带聚簇引擎;读负样本)
  registerTabListeners(repository, scheduleBroadcast, () => penalties.get());
  // 原生分组事件 → DB(双向同步入站)
  registerGroupListeners(repository, scheduleBroadcast);

  // hydrate:重建内存态并与真实标签对账(补偿 SW 休眠丢失的事件)
  void hydrate();
}

async function hydrate(): Promise<void> {
  const now = Date.now();
  await repository.ensureInbox(now);
  await penalties.load();
  await portMappings.load();
  await reconcile(repository, scheduleBroadcast);
  await reconcileGroups(repository, scheduleBroadcast);
  await broadcast();
}
