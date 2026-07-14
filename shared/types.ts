// 领域类型 —— 完整 MVP 数据模型的核心闭环子集(见设计文档 §5)

export type ContextOrigin = 'auto' | 'manual';
export type ContextStatus = 'active' | 'archived';

/** 与 chrome.tabGroups.Color 对齐的 9 色枚举 */
export type ContextColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

/** 命名 Context 建原生分组时轮转的调色板(grey 留给未分类/未分组语义) */
export const CONTEXT_PALETTE: ContextColor[] = [
  'blue',
  'green',
  'purple',
  'orange',
  'cyan',
  'pink',
  'red',
  'yellow',
];

/** 内置「未分类」簇的固定 id —— 常驻、不可删除、不可整簇收纳 */
export const INBOX_ID = 'inbox';

export interface Context {
  id: string; // nanoid;内置未分类固定为 INBOX_ID
  name: string;
  origin: ContextOrigin;
  status: ContextStatus;
  color: ContextColor; // 同步到原生 tabGroup 的颜色(未分类不建组,颜色仅占位)
  nativeGroupId?: number; // 关联的 chrome.tabGroups id(活跃且有标签时)
  createdAt: number;
  archivedAt?: number;
  lastActiveAt: number;
  tabOrder: string[]; // TabRecord.id 有序列表
}

export interface TabRecord {
  id: string; // 稳定 nanoid,不用易变的 chrome tabId
  chromeTabId?: number; // 活跃时存在;归档后为空
  windowId?: number;
  contextId: string;
  url: string;
  title: string;
  faviconUrl?: string;
  firstOpenedAt: number;
  lastActiveAt: number;
}

/** 搜索结果:一条命中的标签 + 其所属簇信息 */
export interface SearchResult {
  tab: TabRecord;
  contextId: string;
  contextName: string;
  archived: boolean;
}
