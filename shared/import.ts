// 导入(补齐 F-12 的反向:JSON 备份 → 任务/标签)。纯函数,可单测。
// 与 export.ts 的 { app:'cairn-tabs', version:1, contexts, tabs } 对称。

import type { Context, TabRecord, ContextColor, ContextOrigin, ContextStatus } from './types';

export interface ImportPayload {
  contexts: Context[];
  tabs: TabRecord[];
}

export type ImportError = 'json' | 'schema' | 'version' | 'empty';
export type ImportResult = { ok: true; data: ImportPayload } | { ok: false; reason: ImportError };

const COLORS: ContextColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
];
const ORIGINS: ContextOrigin[] = ['auto', 'manual'];
const STATUSES: ContextStatus[] = ['active', 'archived'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isValidContext(v: unknown): v is Context {
  if (!isRecord(v)) return false;
  return (
    isStr(v.id) &&
    v.id.length > 0 &&
    isStr(v.name) &&
    ORIGINS.includes(v.origin as ContextOrigin) &&
    STATUSES.includes(v.status as ContextStatus) &&
    COLORS.includes(v.color as ContextColor) &&
    isNum(v.createdAt) &&
    isNum(v.lastActiveAt) &&
    Array.isArray(v.tabOrder) &&
    v.tabOrder.every(isStr)
  );
}

function isValidTab(v: unknown): v is TabRecord {
  if (!isRecord(v)) return false;
  return (
    isStr(v.id) &&
    v.id.length > 0 &&
    isStr(v.contextId) &&
    v.contextId.length > 0 &&
    isStr(v.url) &&
    isStr(v.title) &&
    isNum(v.firstOpenedAt) &&
    isNum(v.lastActiveAt)
  );
}

/**
 * 解析并校验导出的 JSON 文本。宽松但安全:丢弃无效条目,坏结构给出 reason(UI 映射为人话)。
 * 只认 version:1;app 字段若存在必须是 'cairn-tabs'。
 */
export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isRecord(raw)) return { ok: false, reason: 'schema' };
  if (raw.app !== undefined && raw.app !== 'cairn-tabs') return { ok: false, reason: 'schema' };
  if (raw.version !== 1) return { ok: false, reason: 'version' };
  if (!Array.isArray(raw.contexts) || !Array.isArray(raw.tabs)) {
    return { ok: false, reason: 'schema' };
  }
  const contexts = raw.contexts.filter(isValidContext);
  const tabs = raw.tabs.filter(isValidTab);
  if (contexts.length === 0 && tabs.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, data: { contexts, tabs } };
}
