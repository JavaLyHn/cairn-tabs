// 领域类型 —— 完整 MVP 数据模型的核心闭环子集(见设计文档 §5)

export type ContextOrigin = 'auto' | 'manual';
export type ContextStatus = 'active' | 'archived';

/** 与 chrome.tabGroups.Color 对齐的 9 色枚举 */
export type ContextColor =
  'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

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
  /** 临时暂存簇(未分类整批收纳「暂存」/ 陈旧收纳「陈旧」)标记:恢复时标签回到这个簇
   *  (通常是未分类 INBOX_ID),暂存簇本身随即删除 —— 而不是作为一个命名任务复活。 */
  restoreTo?: string;
}

export interface TabRecord {
  id: string; // 稳定 nanoid,不用易变的 chrome tabId
  chromeTabId?: number; // 活跃时存在;归档后为空
  windowId?: number;
  contextId: string;
  url: string;
  title: string;
  faviconUrl?: string;
  openerRecordId?: string; // 打开来源(构成任务树),聚簇 opener 信号用
  pinned?: boolean; // 人工移动过 → 引擎不再改动其归属
  discarded?: boolean; // 是否已被挂起(内存释放,点击自动重载;F-11)
  starred?: boolean; // 用户标为「重点」→ 浮顶 + 免陈旧 + 免挂起(F-07 相关 UI)
  firstOpenedAt: number;
  lastActiveAt: number;
}

/** localhost 端口 → 项目名 映射(F-08,见 PRD §5.1/§7.3) */
export interface PortMapping {
  port: number;
  project: string;
}

/** 功能开关与阈值(落 chrome.storage.local),随快照广播给 UI。 */
export interface Flags {
  autoCluster: boolean; // 自动聚簇(F-07)
  staleHints: boolean; // 陈旧标签下沉提示(F-10)
  autoDiscard: boolean; // 空闲自动挂起(F-11);默认关,尊重用户不喜欢后台自作主张
  discardSkipsLocalhost: boolean; // localhost 永不挂起(护 dev server)
  staleDays: number; // 超过多少天未访问算陈旧
  discardAfterMinutes: number; // 空闲多少分钟后挂起
  sameDomainPromoteSize: number; // 未分类里同域标签达到多少个给「成簇」建议(F-07 同域升格)
}

export const DEFAULT_FLAGS: Flags = {
  autoCluster: true,
  staleHints: true,
  autoDiscard: false,
  discardSkipsLocalhost: true,
  staleDays: 7,
  discardAfterMinutes: 30,
  sameDomainPromoteSize: 4,
};

/** 搜索结果:一条命中的标签 + 其所属簇信息 */
export interface SearchResult {
  tab: TabRecord;
  contextId: string;
  contextName: string;
  archived: boolean;
}
