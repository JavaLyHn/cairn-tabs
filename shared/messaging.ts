// 类型安全的消息协议(见设计文档 §6)
// UI 只发 Command;SW 是唯一写入方,处理后广播 Event。

import type { Context, TabRecord, SearchResult, PortMapping, Flags } from './types';
import type { AIPlan, AIStatus, AIProviderId, AIErrorReason } from './ai';

export type Command =
  | { type: 'CREATE_CONTEXT'; name: string }
  | { type: 'RENAME_CONTEXT'; contextId: string; name: string }
  | { type: 'DELETE_CONTEXT'; contextId: string }
  | { type: 'MOVE_TAB'; tabRecordId: string; toContextId: string }
  | { type: 'ARCHIVE_CONTEXT'; contextId: string }
  | { type: 'ARCHIVE_INBOX' }
  | { type: 'ARCHIVE_STALE' }
  | { type: 'RESTORE_CONTEXT'; contextId: string }
  | { type: 'MERGE_DUPLICATES' }
  | { type: 'SET_PORT_MAPPING'; port: number; project: string }
  | { type: 'REMOVE_PORT_MAPPING'; port: number }
  | { type: 'SET_AUTO_CLUSTER'; enabled: boolean }
  | { type: 'SET_STALE_HINTS'; enabled: boolean }
  | { type: 'SET_AUTO_DISCARD'; enabled: boolean }
  | { type: 'SET_DISCARD_SKIP_LOCALHOST'; enabled: boolean }
  | { type: 'SET_SAME_DOMAIN_PROMOTE_SIZE'; size: number }
  | { type: 'PROMOTE_SAME_DOMAIN'; domain: string; tabIds: string[] }
  | { type: 'SET_TAB_STARRED'; tabRecordId: string; starred: boolean }
  | { type: 'AI_SUGGEST_NAME'; contextId: string }
  | { type: 'UNDO'; token: string }
  | { type: 'ACTIVATE_TAB'; tabRecordId: string }
  | { type: 'CLOSE_TAB'; tabRecordId: string }
  | { type: 'REQUEST_SNAPSHOT' }
  | { type: 'SEARCH'; query: string }
  | { type: 'AI_ORGANIZE_INBOX' }
  | { type: 'APPLY_AI_PLAN'; plan: AIPlan }
  | { type: 'SET_AI_SETTINGS'; provider: AIProviderId; key?: string; model?: string; baseUrl?: string }
  | { type: 'TEST_AI_CONNECTION' };

export type Event =
  | {
      type: 'STATE_SNAPSHOT';
      contexts: Context[];
      tabs: TabRecord[];
      portMappings: PortMapping[];
      flags: Flags;
      discardedBytes: number;
      ai: AIStatus;
    }
  | { type: 'SEARCH_RESULTS'; query: string; results: SearchResult[] }
  | { type: 'UNDOABLE'; action: string; token: string; ttlMs: number }
  | { type: 'CONTEXT_CREATED'; contextId: string }
  | { type: 'OPEN_SEARCH' }
  | { type: 'AI_PLAN'; plan: AIPlan; tabs: TabRecord[] }
  | { type: 'AI_ERROR'; reason: AIErrorReason }
  | { type: 'AI_TEST_RESULT'; ok: boolean; detail: string }
  | { type: 'AI_NAME'; name: string };

/** 新建上下文时的默认草稿名(用于「至多一个草稿」去重) */
export const DRAFT_CONTEXT_NAME = '新任务';

/** SW 用于识别「这是命令而非广播事件」的类型集合。 */
export const COMMAND_TYPES = new Set<Command['type']>([
  'CREATE_CONTEXT',
  'RENAME_CONTEXT',
  'DELETE_CONTEXT',
  'MOVE_TAB',
  'ARCHIVE_CONTEXT',
  'ARCHIVE_INBOX',
  'ARCHIVE_STALE',
  'RESTORE_CONTEXT',
  'MERGE_DUPLICATES',
  'SET_PORT_MAPPING',
  'REMOVE_PORT_MAPPING',
  'SET_AUTO_CLUSTER',
  'SET_STALE_HINTS',
  'SET_AUTO_DISCARD',
  'SET_DISCARD_SKIP_LOCALHOST',
  'SET_SAME_DOMAIN_PROMOTE_SIZE',
  'PROMOTE_SAME_DOMAIN',
  'SET_TAB_STARRED',
  'UNDO',
  'ACTIVATE_TAB',
  'CLOSE_TAB',
  'REQUEST_SNAPSHOT',
  'SEARCH',
  'AI_ORGANIZE_INBOX',
  'APPLY_AI_PLAN',
  'SET_AI_SETTINGS',
  'TEST_AI_CONNECTION',
  'AI_SUGGEST_NAME',
]);

/** UI → SW:发送命令,await 到 SW 处理完成 */
export function sendCommand(cmd: Command): Promise<void> {
  return chrome.runtime.sendMessage(cmd);
}

/** UI → SW:发送搜索命令并直接取回结果(请求/响应式) */
export async function sendSearch(query: string): Promise<SearchResult[]> {
  const res = (await chrome.runtime.sendMessage({ type: 'SEARCH', query } satisfies Command)) as
    | { type: 'SEARCH_RESULTS'; results: SearchResult[] }
    | undefined;
  return res?.results ?? [];
}
