// 收纳的 5 秒可撤销缓冲(见设计文档 §7.3)。
// undo of archive === restore that context;这里只登记 token 与超时。

import { nanoid } from 'nanoid';

interface UndoEntry {
  token: string;
  action: string;
  contextId: string;
  timer: ReturnType<typeof setTimeout>;
}

export class UndoManager {
  private entries = new Map<string, UndoEntry>();

  register(action: string, contextId: string, ttlMs: number): { token: string; ttlMs: number } {
    const token = nanoid();
    const timer = setTimeout(() => this.entries.delete(token), ttlMs);
    this.entries.set(token, { token, action, contextId, timer });
    return { token, ttlMs };
  }

  /** 取出并作废 token,返回其关联的 contextId(过期返回 undefined)。 */
  consume(token: string): string | undefined {
    const entry = this.entries.get(token);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    this.entries.delete(token);
    return entry.contextId;
  }
}
