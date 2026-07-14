// 类型安全的消息协议(见设计文档 §6)
// UI 只发 Command;SW 是唯一写入方,处理后广播 Event。

import type { Context, TabRecord, SearchResult } from './types';

export type Command =
  | { type: 'CREATE_CONTEXT'; name: string }
  | { type: 'RENAME_CONTEXT'; contextId: string; name: string }
  | { type: 'DELETE_CONTEXT'; contextId: string }
  | { type: 'MOVE_TAB'; tabRecordId: string; toContextId: string }
  | { type: 'ARCHIVE_CONTEXT'; contextId: string }
  | { type: 'RESTORE_CONTEXT'; contextId: string }
  | { type: 'MERGE_DUPLICATES' }
  | { type: 'UNDO'; token: string }
  | { type: 'ACTIVATE_TAB'; tabRecordId: string }
  | { type: 'CLOSE_TAB'; tabRecordId: string }
  | { type: 'REQUEST_SNAPSHOT' }
  | { type: 'SEARCH'; query: string };

export type Event =
  | { type: 'STATE_SNAPSHOT'; contexts: Context[]; tabs: TabRecord[] }
  | { type: 'SEARCH_RESULTS'; query: string; results: SearchResult[] }
  | { type: 'UNDOABLE'; action: string; token: string; ttlMs: number }
  | { type: 'OPEN_SEARCH' };

/** SW 用于识别「这是命令而非广播事件」的类型集合。 */
export const COMMAND_TYPES = new Set<Command['type']>([
  'CREATE_CONTEXT',
  'RENAME_CONTEXT',
  'DELETE_CONTEXT',
  'MOVE_TAB',
  'ARCHIVE_CONTEXT',
  'RESTORE_CONTEXT',
  'MERGE_DUPLICATES',
  'UNDO',
  'ACTIVATE_TAB',
  'CLOSE_TAB',
  'REQUEST_SNAPSHOT',
  'SEARCH',
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
