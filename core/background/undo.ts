// 收纳的 5 秒可撤销缓冲(见设计文档 §7.3)。
// archive 的撤销 === 恢复该 context;reorg 的撤销 === 把整批移动还原。

import { nanoid } from 'nanoid';
import type { ContextColor } from '@/shared/types';

/** 「整理全部」的逆操作:移回标签 + 重建被删空组 + 删掉本次新建的空组。 */
export interface ReorgUndo {
  moves: { tabId: string; toContextId: string }[]; // 把 tab 移回 toContextId(原分组)
  recreate: { id: string; name: string; color: ContextColor }[]; // 原分组若被删,按 name/color 重建(新 id)
  deleteContextIds: string[]; // 撤销时删掉 plan 新建的组(其标签已移回,应为空)
}

interface UndoEntry {
  token: string;
  action: string;
  contextId?: string;
  reorg?: ReorgUndo;
  timer: ReturnType<typeof setTimeout>;
}

export interface UndoConsumed {
  action: string;
  contextId?: string;
  reorg?: ReorgUndo;
}

export class UndoManager {
  private entries = new Map<string, UndoEntry>();

  register(action: string, contextId: string, ttlMs: number): { token: string; ttlMs: number } {
    const token = nanoid();
    const timer = setTimeout(() => this.entries.delete(token), ttlMs);
    this.entries.set(token, { token, action, contextId, timer });
    return { token, ttlMs };
  }

  registerReorg(reorg: ReorgUndo, ttlMs: number): { token: string; ttlMs: number } {
    const token = nanoid();
    const timer = setTimeout(() => this.entries.delete(token), ttlMs);
    this.entries.set(token, { token, action: 'reorg', reorg, timer });
    return { token, ttlMs };
  }

  /** 取出并作废 token,返回其关联的动作与载荷(过期返回 undefined)。 */
  consume(token: string): UndoConsumed | undefined {
    const entry = this.entries.get(token);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    this.entries.delete(token);
    return { action: entry.action, contextId: entry.contextId, reorg: entry.reorg };
  }
}
