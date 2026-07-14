# TabCtx — 面向程序员的标签页上下文管理器
## 产品与技术实现文档 v1.0

> 文档状态:草案 | 日期:2026-07-14 | 作者:LyHn
> 产品代号 TabCtx(暂定名,正式名称待定)

---

## 1. 产品概述

### 1.1 背景与问题定义

程序员日常工作中浏览器标签页数量常态化地达到 30–60 个。Chrome 水平标签栏在超过约 15 个标签后,每个标签被压缩至仅剩 favicon,标题不可读。由此产生三个层次的问题:

| 层次 | 问题 | 表现 |
|---|---|---|
| 检索 | 找不到已打开的标签 | 逐个点击试错,或干脆重新搜索打开重复标签 |
| 上下文 | 多任务标签混杂 | 调试 bug 的标签、查资料的标签、写文档的标签互相污染视野 |
| 心理负担 | 标签"不敢关" | 标签栏被当作 TODO list + 临时书签 + 记忆外挂,越积越多 |

关键洞察:**程序员的标签天然按任务成簇**。一次 bug 调试会连续打开 GitHub Issue、Stack Overflow、内部日志平台、API 文档;这些标签之间存在打开来源链(referrer chain)和时间局部性。现有产品(Workona、Toby 等)要求用户手动维护工作区,违背程序员"懒得整理"的真实行为模式。

### 1.2 产品定位

**一句话定位**:自动把程序员的标签页按任务聚成"上下文簇",可整簇收纳、整簇恢复、全局秒搜的 Chrome 侧边栏插件。

**目标用户**:以 Chrome/Edge 为主力浏览器的软件工程师。典型画像:同时推进 2–4 个任务,本地跑着 1 个以上 dev server,GitHub 重度用户,对数据主权敏感,拒绝为轻工具付订阅费。

**非目标用户**(刻意排除):需要团队协作共享工作区的用户(Workona 的领域)、需要跨设备云同步的多设备用户(v2 再议)、泛知识工作者。

### 1.3 竞品格局与差异化(2026-07 调研结论)

| 竞品 | 核心能力 | 弱点(即我们的机会) |
|---|---|---|
| Workona | 手动项目工作区、云同步、团队协作 | 强制登录、数据在云端、$8/月、对个人用户过重、无自动聚簇 |
| OneTab | 一键收纳全部标签为列表 | 无分组概念、收纳后是扁平大列表、无搜索加权 |
| Session Buddy | 会话快照与恢复 | 面向"崩溃恢复"场景,非日常任务管理 |
| Toby | 可视化收藏板 | 手动整理、免费版限 60 个标签 |
| AI 分组类扩展(多个开源项目) | 调 LLM 一次性给标签分类 | 一次性分类 ≠ 持续任务追踪;无归档/恢复闭环 |
| Chrome 原生(146+) | 垂直标签、标签分组 | 分组不跨会话持久化、无搜索、无快照、无自动化 |

**三项无人占据的差异化**:
1. **自动聚簇**:基于 `openerTabId` 打开链 + 时间窗 + 域名规则,持续、被动地维护任务簇,用户零整理成本。
2. **程序员特化**:localhost 端口→项目名映射、GitHub PR/Issue 元数据提取、面向 dev server 场景的内存回收。
3. **本地优先**:IndexedDB 本地存储、无账号、Markdown/JSON 导出,数据主权完全在用户手里。

### 1.4 成功指标(自用 dogfood 阶段)

- 激活:安装后 7 天内使用 ⌘⇧K 搜索 ≥ 10 次
- 核心价值:每周"整簇收纳"操作 ≥ 3 次,且收纳后 30 天内发生过"整簇恢复"
- 反向指标:自动聚簇的人工纠正率(把标签拖出错误簇的次数 / 自动归簇总数)< 15%
- 体感指标:平均同屏活跃标签数从 40+ 下降到 15 以内

---

## 2. 需求定义

### 2.1 用户故事

- **US-01 检索**:作为程序员,我按下 ⌘⇧K 输入两三个字母,就能模糊匹配到任意打开或已归档的标签,回车直达。
- **US-02 自动聚簇**:作为程序员,我从一个 GitHub Issue 连续点开的 8 个页面,应自动归入同一个 Context,无需我手动拖拽。
- **US-03 整簇收纳**:作为程序员,当我切换任务时,能一键把当前任务的所有标签收纳归档并关闭,释放标签栏和内存。
- **US-04 整簇恢复**:作为程序员,三天后回到这个任务时,一键恢复整簇标签,顺序不变。
- **US-05 去重**:作为程序员,同一 URL 打开了 3 次时,插件应标出重复并支持一键合并(保留最近活跃的那个)。
- **US-06 localhost 识别**:作为程序员,`localhost:3000` 这类标签应显示我配置的项目名(如 `auth-service`),而不是无意义的默认标题。
- **US-07 陈旧清理**:作为程序员,7 天未访问的标签应被集中提示,支持一键全部归档。
- **US-08 内存回收**:作为程序员,不活跃的标签应可被挂起(discard)释放内存,且我能看到累计回收量。
- **US-09 数据导出**:作为程序员,我能把任意归档簇导出为 Markdown(标题 + URL 列表)贴进周报或 Notion。
- **US-10 AI 命名(可选)**:作为程序员,我可以对"未分类"簇点一下 AI 归类,让 LLM 给簇起名并归类,该功能默认关闭、须显式配置 API Key。

### 2.2 功能需求清单与优先级

| 编号 | 功能 | 优先级 | 版本 |
|---|---|---|---|
| F-01 | 侧边栏标签列表(按 Context 分组展示) | P0 | MVP |
| F-02 | ⌘⇧K 全局搜索 overlay(模糊匹配,打开+归档) | P0 | MVP |
| F-03 | 手动 Context:创建/重命名/拖拽标签归属 | P0 | MVP |
| F-04 | 整簇收纳(归档并关闭)与整簇恢复 | P0 | MVP |
| F-05 | 重复标签检测与一键合并 | P0 | MVP |
| F-06 | 与 Chrome 原生 tabGroups 双向同步 | P1 | MVP |
| F-07 | 自动聚簇引擎(opener 链 + 时间窗 + 域名规则) | P0 | v1.1 |
| F-08 | localhost 端口→项目名映射 | P1 | v1.1 |
| F-09 | GitHub PR/Issue 元数据提取(编号、状态) | P2 | v1.1 |
| F-10 | 陈旧标签检测与批量归档 | P1 | v1.1 |
| F-11 | 标签挂起与内存回收统计 | P1 | v1.1 |
| F-12 | 归档导出 Markdown / JSON | P1 | v1.1 |
| F-13 | AI 命名与归类(BYO API Key) | P2 | v1.5 |
| F-14 | Firefox 适配 | P3 | v2 |
| F-15 | 跨设备同步 | P3 | v2 |

### 2.3 非功能需求

- **性能**:侧边栏首次渲染 < 150ms(100 标签规模);搜索按键到结果更新 < 50ms;聚簇计算不阻塞 UI(在 service worker 中增量执行)。
- **规模上限**:设计容量为 500 个打开标签、10,000 条归档记录,超出仍可用但不保证性能指标。
- **隐私**:默认零网络请求。AI 功能开启后,仅发送标签标题与域名(不发送完整 URL 与页面内容),API Key 存储于本地。
- **可靠性**:归档数据写入 IndexedDB 后必须可在浏览器崩溃后完整恢复;所有写操作原子化。
- **无障碍**:侧边栏与搜索 overlay 完整支持键盘操作;焦点管理符合 WAI-ARIA。

### 2.4 明确不做(Out of Scope)

- 不做书签管理(与浏览器书签是不同心智,不混淆)
- 不做页面内容抓取/全文索引(MVP 阶段;涉及 `<all_urls>` 权限会显著提高审核门槛与用户戒心)
- 不做团队共享、评论、协作
- 不做自有云端账号体系

---

## 3. 产品设计

### 3.1 核心概念模型

```
Context(上下文簇)
 ├── 属性:名称、颜色、状态(active | idle | archived)、创建来源(auto | manual | ai)
 ├── 包含:Tab 引用列表(有序)
 └── 生命周期:自动生成 → 活跃 → 闲置 → 收纳归档 → 恢复(回到活跃)或删除

Tab(标签)
 ├── 运行态属性:chrome tabId、windowId、活跃时间、是否已挂起
 ├── 持久属性:URL、标题、favicon、首次打开时间、opener 关系
 └── 派生属性:localhost 项目名、GitHub 元数据、重复标记
```

设计原则:**Context 是一等公民,Tab 是它的内容**。所有批量操作(收纳、恢复、导出、挂起)的作用对象都是 Context,单个标签操作退居次要。

### 3.2 界面结构(三个核心界面)

**界面一:侧边栏(常驻主界面)** — 已产出高保真 mockup
- 顶部:搜索入口(点击或 ⌘⇧K 展开)+ 设置
- 统计条:标签总数 / Context 数 / 重复提示
- Context 列表:活跃簇默认展开并以 2px 强调色边条标注(全界面唯一强调色);其余簇折叠为单行(名称 + 数量 + 域名摘要)
- 特殊簇:「未分类」(带 AI 归类入口)、「陈旧标签」(降饱和度下沉展示 + 全部归档按钮)
- 底部状态栏:归档总数、累计回收内存

**界面二:搜索 overlay(⌘⇧K)** — 已产出高保真 mockup
- 命令面板式交互(对齐 Raycast / IDE 的 Cmd+P 心智)
- 结果分区:打开的标签(按最近活跃排序)→ 已归档(降透明度)
- 高亮匹配片段;每条结果显示所属 Context 徽章
- 快捷键:↑↓ 选择、↵ 跳转、⌘↵ 恢复整簇、⌘W 关闭该标签

**界面三:归档库** — 已产出高保真 mockup
- 按时间倒序的 Context 卡片列表
- 每簇显示:名称、标签数、归档时间、域名分布摘要(等宽字体,如 `github.com ×4`)
- 操作:恢复整簇 / 展开查看 / 导出 / 删除

### 3.3 关键交互细节

- **收纳动效**:点击簇头部「收纳」→ 簇内标签逐个淡出并关闭 → 底部状态栏归档数 +1。全程 < 400ms,不弹确认框(可撤销:5 秒内显示 undo toast)。
- **自动聚簇的可见性**:新标签被自动归簇时,簇头部短暂高亮 1 次。绝不弹通知打断用户。
- **纠错交互**:任何标签可拖拽到其它簇;拖出后系统记录该 (域名, 簇) 负样本,降低同类误归权重。
- **悬停显隐**:每行的关闭按钮、簇头部的操作图标仅在 hover 时出现,保持默认视觉极简。

### 3.4 视觉规范(克制的科技感)

- 单一强调色 teal `#1D9E75`,仅用于:活跃簇边条、AI 入口、可恢复操作
- 等宽字体仅用于:数字统计、端口号、Issue/PR 编号、域名摘要
- 边框一律 hairline(0.5px);圆角 6–8px;无阴影、无渐变
- 深浅双模式,跟随系统
- 图标:Tabler outline;正文 13px,辅助信息 11–11.5px

---

## 4. 技术架构

### 4.1 技术选型总览

| 层 | 选型 | 理由 |
|---|---|---|
| 插件框架 | WXT(Manifest V3) | 约定式入口、Vite HMR、跨浏览器构建,社区活跃度优于 Plasmo |
| UI | React 18 + TypeScript + Tailwind CSS | 生态成熟;侧边栏与 overlay 共享组件 |
| 状态管理 | Zustand(UI 态)+ 消息驱动(跨上下文) | 轻量;避免在多个 extension context 间共享内存态的错觉 |
| 持久化 | Dexie.js(IndexedDB)+ chrome.storage.local | 归档大数据走 IndexedDB;轻量配置走 storage.local |
| 模糊搜索 | fuse.js(MVP)→ 自研倒排索引(性能不足时) | 500 标签规模 fuse 足够 |
| 测试 | Vitest(单测)+ Playwright(E2E,加载真实插件) | 聚簇引擎必须有回归测试 |
| 代码质量 | ESLint + Prettier + strict TS | — |

### 4.2 进程/上下文拓扑

MV3 插件由多个隔离的 JS 上下文组成,架构上必须显式设计它们的职责与通信:

```
┌─────────────────────────────────────────────────────┐
│ Service Worker (background)          ← 唯一事实来源   │
│  · 监听 chrome.tabs.* 全部事件                        │
│  · 聚簇引擎(增量计算)                                │
│  · 写 IndexedDB / storage.local                      │
│  · 处理来自 UI 的命令消息                              │
│  ⚠ 随时可能被浏览器休眠,一切状态必须可从存储重建         │
└──────────────┬──────────────────────────────────────┘
               │ chrome.runtime messaging(命令/事件总线)
   ┌───────────┴───────────┬─────────────────────┐
   │ Side Panel (React)    │ Search Overlay      │
   │ 主界面,订阅状态快照     │ 命令面板(content    │
   │                       │ script 注入或        │
   │                       │ sidePanel 内实现)    │
   └───────────────────────┴─────────────────────┘
```

**核心原则:Service Worker 是唯一写入方**。UI 层永远不直接写存储,只发送命令消息(如 `ARCHIVE_CONTEXT`),由 worker 执行并广播状态更新。这避免了 MV3 多上下文并发写导致的数据竞争。

**Worker 休眠对策**(MV3 最大的工程陷阱):
- 所有内存态(如聚簇的中间状态、tabId→contextId 映射)必须在每次变更后落盘到 `chrome.storage.session`(会话级,浏览器关闭即清除,读写快)
- Worker 每次被事件唤醒时,首先执行 `hydrate()` 从 storage.session 重建内存态,再处理事件
- 禁用长驻定时器;用 `chrome.alarms`(最小粒度 30s)驱动周期任务(陈旧检测、挂起扫描)

### 4.3 目录结构(WXT 约定)

```
tabctx/
├── wxt.config.ts              # manifest 声明:权限、命令、side_panel
├── entrypoints/
│   ├── background.ts          # service worker 入口(薄壳,委托给 core/)
│   ├── sidepanel/             # 侧边栏 React 应用
│   │   ├── index.html
│   │   ├── App.tsx
│   │   └── components/        # ContextGroup / TabRow / StatsBar / ArchiveView
│   └── overlay.content.ts    # (若采用页内 overlay 方案)搜索面板注入
├── core/                      # 与 UI 无关的领域逻辑(可单测)
│   ├── clustering/            # 聚簇引擎
│   │   ├── engine.ts          # 增量聚簇主流程
│   │   ├── signals.ts         # opener 链 / 时间窗 / 域名信号提取
│   │   └── rules.ts           # 规则权重与负样本学习
│   ├── store/                 # Dexie schema 与仓储层
│   │   ├── db.ts
│   │   └── repositories.ts
│   ├── search/                # 索引构建与查询
│   ├── enrich/                # localhost 映射 / GitHub 元数据解析
│   └── messaging/             # 类型安全的消息协议定义
├── shared/                    # UI 与 core 共享的类型与工具
└── tests/
```

### 4.4 manifest 权限清单(最小化原则)

```jsonc
{
  "permissions": [
    "tabs",          // 读取标签 URL/标题 —— 核心必需,商店描述须解释
    "tabGroups",     // 与原生分组双向同步
    "storage",       // storage.local / storage.session
    "sidePanel",     // 侧边栏
    "alarms",        // 周期任务(替代 setInterval)
    "favicon"        // chrome://favicon 读取图标,避免额外网络请求
  ],
  "optional_permissions": [
    "scripting"      // 仅当用户启用"页内搜索 overlay"时动态申请
  ],
  "commands": {
    "open-search":   { "suggested_key": { "default": "Ctrl+Shift+K", "mac": "Command+Shift+K" } },
    "archive-active-context": { "suggested_key": { "default": "Ctrl+Shift+E", "mac": "Command+Shift+E" } }
  }
}
```

刻意不申请:`<all_urls>` host 权限、`history`、`bookmarks`。搜索 overlay 优先在 Side Panel 内实现(聚焦面板输入框),避免 content script 注入带来的权限扩张;页内注入方案作为可选增强。

---

## 5. 数据模型

### 5.1 TypeScript 领域类型

```ts
// shared/types.ts

export type ContextOrigin = 'auto' | 'manual' | 'ai';
export type ContextStatus = 'active' | 'idle' | 'archived';

export interface Context {
  id: string;                    // nanoid
  name: string;
  origin: ContextOrigin;
  status: ContextStatus;
  color?: string;                // 同步到原生 tabGroup 的颜色
  nativeGroupId?: number;        // 关联的 chrome.tabGroups id(活跃时)
  createdAt: number;
  archivedAt?: number;
  lastActiveAt: number;
  tabOrder: string[];            // TabRecord.id 有序列表
}

export interface TabRecord {
  id: string;                    // 稳定 id(nanoid),不用易变的 chrome tabId
  chromeTabId?: number;          // 活跃时存在;归档后为空
  windowId?: number;
  contextId: string;
  url: string;
  title: string;
  faviconUrl?: string;
  openerRecordId?: string;       // 打开来源(构成任务树)
  firstOpenedAt: number;
  lastActiveAt: number;
  discarded: boolean;            // 是否已被挂起
  meta?: TabMeta;                // 派生元数据
}

export interface TabMeta {
  localhostProject?: string;     // 由端口映射得出,如 "auth-service"
  github?: { kind: 'pr' | 'issue'; number: number; repo: string; state?: string };
  duplicateOf?: string;          // 指向保留的那个 TabRecord.id
}

export interface PortMapping { port: number; project: string; }

export interface Settings {
  portMappings: PortMapping[];
  staleDays: number;             // 默认 7
  discardAfterMinutes: number;   // 默认 30,0 = 关闭
  ai: { enabled: boolean; provider: 'anthropic' | 'openai' | 'gemini'; apiKey?: string };
}

export interface MemoryStats { totalDiscardedBytes: number; }  // 估算值
```

### 5.2 Dexie schema 与索引

```ts
// core/store/db.ts
import Dexie, { type Table } from 'dexie';

export class TabCtxDB extends Dexie {
  contexts!: Table<Context, string>;
  tabs!: Table<TabRecord, string>;

  constructor() {
    super('tabctx');
    this.version(1).stores({
      contexts: 'id, status, lastActiveAt, archivedAt',
      tabs: 'id, contextId, url, chromeTabId, lastActiveAt, [contextId+lastActiveAt]'
    });
  }
}
```

索引设计说明:`url` 建索引支撑去重检测(O(logN) 查同 URL);复合索引 `[contextId+lastActiveAt]` 支撑"簇内按活跃排序"与陈旧扫描;归档查询走 `status + archivedAt`。

### 5.3 存储分层

| 存储 | 内容 | 生命周期 |
|---|---|---|
| chrome.storage.session | worker 内存态快照(聚簇中间状态、tabId 映射) | 浏览器会话 |
| chrome.storage.local | Settings、MemoryStats、聚簇负样本 | 永久,随插件卸载删除 |
| IndexedDB (Dexie) | Context 与 TabRecord 全量(含归档) | 永久 |

### 5.4 消息协议(类型安全)

```ts
// core/messaging/protocol.ts
export type Command =
  | { type: 'ARCHIVE_CONTEXT'; contextId: string }
  | { type: 'RESTORE_CONTEXT'; contextId: string }
  | { type: 'MOVE_TAB'; tabRecordId: string; toContextId: string }   // 拖拽纠错
  | { type: 'MERGE_DUPLICATES'; keepRecordId: string }
  | { type: 'DISCARD_TAB'; tabRecordId: string }
  | { type: 'RENAME_CONTEXT'; contextId: string; name: string }
  | { type: 'EXPORT_CONTEXT'; contextId: string; format: 'md' | 'json' }
  | { type: 'AI_CLASSIFY_UNSORTED' }
  | { type: 'SEARCH'; query: string };

export type Event =
  | { type: 'STATE_SNAPSHOT'; contexts: Context[]; tabs: TabRecord[] }
  | { type: 'SEARCH_RESULTS'; results: SearchResult[] }
  | { type: 'UNDOABLE'; action: string; token: string; ttlMs: number };
```

UI 通过 `chrome.runtime.sendMessage(command)` 发命令;worker 处理后通过 `chrome.runtime.sendMessage(event)` 广播,侧边栏订阅 `STATE_SNAPSHOT` 全量刷新(数据量小,全量比增量 diff 简单可靠)。

---

## 6. 核心算法:自动聚簇引擎

### 6.1 设计目标与约束

- **增量式**:每次只处理单个标签事件(创建/激活/更新),不做全量重聚类。全量重聚类会导致簇 id 不稳定、用户手动整理被冲掉。
- **保守性**:宁可放进「未分类」,不做低置信度归簇。误归的纠正成本(用户拖出来)高于漏归(留在未分类)。
- **尊重人工**:用户手动移动过的标签,其归属被锁定(`pinned`),引擎不再改动;用户手动创建/重命名的簇优先作为归簇目标。

### 6.2 信号与打分

新标签 T 出现时,对每个活跃 Context C 计算归属分 `score(T, C)`:

```
score(T, C) = w1 · opener(T, C)     // T 的 opener 标签属于 C → 1,否则 0
            + w2 · temporal(T, C)   // C 最近活跃时间与 T 打开时间差的衰减函数
            + w3 · domain(T, C)     // T 的域名在 C 中已出现 → 1;同 eTLD+1 → 0.5
            + w4 · path(T, C)       // 同域名下 URL 路径前缀重合度(如同一 repo)
            - penalty(T, C)         // 负样本:用户曾把该域名从 C 拖出 → 惩罚

初始权重:w1 = 0.55, w2 = 0.15, w3 = 0.20, w4 = 0.10
判定:max score ≥ 0.5 → 归入该簇;否则进「未分类」
```

信号获取细节:

- **opener 链**:`chrome.tabs.onCreated` 事件中 `tab.openerTabId` 直接可得。这是最强信号——从簇内标签点出来的链接几乎必然属于同一任务。注意 openerTabId 在原标签关闭后不可追溯,因此必须在创建瞬间记录并转换为稳定的 `openerRecordId`。
- **temporal**:`temporal = exp(-Δt / τ)`,τ 取 10 分钟。地址栏新开的标签(无 opener)若紧跟在某簇的活跃操作之后,大概率同任务。
- **domain**:注意通用域名衰减——`google.com`、`stackoverflow.com` 这类高频域名出现在多数簇中,信号价值低。对域名做 IDF 加权:`domain_w = 1 / (1 + log(1 + 该域名出现的簇数))`。
- **负样本**:用户把标签从簇 C 拖到簇 D,记录 `(eTLD+1, C) → penalty += 0.3`(上限 0.6),存入 storage.local。

### 6.3 簇的生成与生命周期

```
新标签进「未分类」后:
  若「未分类」中存在 ≥ 3 个标签构成 opener 树或共享非通用域名
  且时间跨度 < 15 分钟
  → 自动升格为新 Context,名称暂取 "「首个标签标题截断」"
  → 若 AI 功能开启,异步请求命名(仅发送簇内标题列表)

Context 状态迁移:
  active → idle:   簇内所有标签 30 分钟无激活
  idle → active:   任一标签被激活
  active/idle → archived: 用户收纳,或陈旧策略批量归档
  archived → active: 用户恢复(重开全部标签,重建 nativeGroup)
```

### 6.4 与原生 tabGroups 双向同步

- TabCtx Context(active 状态)↔ 一个原生 tab group,颜色与名称同步
- 用户在原生 UI 里把标签拖入/拖出分组 → `chrome.tabGroups`/`tabs.onMoved` 事件 → 更新 TabRecord.contextId(视为人工操作,加 pinned)
- 用户通过原生 UI 解散分组 → 对应 Context 转为 idle 但不删除(数据不丢)
- 冲突规则:**原生 UI 的人工操作永远赢过引擎的自动决策**

### 6.5 测试策略

聚簇引擎必须可回放测试:定义事件序列 fixture(JSON:一串 onCreated/onActivated 事件),断言最终簇结构。收集自己两周的真实浏览事件(本地脱敏日志)作为回归集,权重调优以该回归集的纠正率为目标函数。

---

## 7. 关键功能实现要点

### 7.1 整簇收纳与恢复

```
收纳(ARCHIVE_CONTEXT):
1. 读取 Context 的 tabOrder 与全部 TabRecord
2. 事务写入:status='archived', archivedAt=now, chromeTabId=null
3. chrome.tabs.remove(全部 chromeTabId)   // 先落盘再关闭,崩溃安全
4. 广播 STATE_SNAPSHOT + UNDOABLE(5s 内可撤销:重开标签并回滚状态)

恢复(RESTORE_CONTEXT):
1. 按 tabOrder 逐个 chrome.tabs.create({ url, active: false })
2. 创建原生 tab group,windowId 取当前窗口
3. 新 chromeTabId 回填 TabRecord;status='active'
注意:批量 create 需限速(每 50ms 一个),一次性创建 20+ 标签会触发
Chrome 节流且 favicon 全部丢失;恢复的标签默认以 discarded 状态创建
(chrome.tabs.create 无此参数,可创建后立即 discard),避免恢复瞬间内存暴涨。
```

### 7.2 全局搜索

- 索引字段:title(权重 0.6)、url(0.25)、contextName(0.15);fuse.js threshold 0.35
- 索引维护:worker 内存持有,标签事件后增量更新,worker 重启时从 DB 重建(500 标签 < 20ms)
- 结果排序:匹配分 × 时间衰减(lastActiveAt);打开的标签排在归档前
- 搜索入口按键 → sidePanel.open() + 聚焦输入框(⌘⇧K 通过 chrome.commands 触发)

### 7.3 localhost 项目名映射

- Settings.portMappings 手动配置为主:`{ 3000: "auth-service", 5173: "wraith-ui" }`
- 自动建议:检测到新的 localhost 端口时,取该标签 title 作为建议项目名,在侧边栏内联提示"绑定 5173 → wraith-ui?"
- 渲染:TabRow 标题替换为项目名,原端口以等宽字体显示在行尾

### 7.4 GitHub 元数据提取

纯 URL 解析,无需 API、无需额外权限:

```
github.com/{owner}/{repo}/pull/{n}   → { kind:'pr', repo, number }
github.com/{owner}/{repo}/issues/{n} → { kind:'issue', repo, number }
状态(open/merged/closed)可从标签 title 后缀启发式解析(GitHub 页面
title 含状态词);不做 API 轮询(避免 token 管理与配额复杂度)。
```

### 7.5 标签挂起与内存统计

- `chrome.alarms` 每 5 分钟扫描:lastActiveAt 超过 discardAfterMinutes 且非活跃、非播放音频、非置顶的标签 → `chrome.tabs.discard(tabId)`
- 白名单:localhost 标签默认不挂起(dev server 页面挂起后状态丢失)
- 内存统计为估算:每次 discard 计 +80MB(经验均值),仅作体感展示,标注"估算"

### 7.6 AI 命名与归类(v1.5,默认关闭)

- BYO Key:用户自填 Anthropic/OpenAI/Gemini key,存 storage.local,请求直连官方 API(不经任何中转服务器)
- 发送内容:仅簇内各标签的 title + eTLD+1 域名;明确不发送完整 URL、查询参数、页面内容
- Prompt 约束输出 JSON:`{ name: string, assignments: { recordId: contextId | 'new' }[] }`,解析失败静默降级
- 频控:手动触发,单次一请求;绝不自动后台调用

### 7.7 导出

- Markdown 格式:`## {Context 名} ({归档日期})` + `- [title](url)` 列表
- JSON 格式:Context + TabRecord 原始结构,可作为备份与再导入(v1.5 支持导入)

---

## 8. 隐私、安全与商店合规

- **数据流转声明**:默认所有数据不出本机。唯一的可选外发是 AI 命名功能(显式开启 + 自填 Key + 内容范围明示)。此声明写入商店描述与设置页。
- **权限申辩**(商店审核材料):`tabs` 用于读取标签标题与 URL 以提供分组与搜索——这是产品核心功能,单一用途(single purpose)明确。
- **不采集遥测**:MVP 不接任何 analytics;若未来加,必须 opt-in。
- **CSP**:不加载任何远程脚本(MV3 本身禁止);favicon 走 `chrome://favicon` 协议。
- **卸载即清除**:IndexedDB 与 storage 随插件卸载由浏览器自动删除;设置页提供"一键导出全部数据"。

---

## 9. 边界情况与异常处理

| 场景 | 处理 |
|---|---|
| Worker 处理事件时被休眠打断 | 事件处理设计为幂等;hydrate 后由下一事件驱动补偿 |
| 多窗口 | Context 可跨窗口;恢复时全部恢复到当前窗口;侧边栏按窗口过滤可选 |
| 无痕窗口 | 不追踪(manifest 不启用 incognito) |
| 用户直接关闭标签(非收纳) | TabRecord 保留 24h(进"最近关闭"缓冲),之后清除;区别于归档 |
| 同 URL 不同 hash/query | 去重仅比对 origin+pathname+search,忽略 hash;localhost 全 URL 比对 |
| 恢复时 URL 已失效(404) | 照常打开,不做可达性预检(预检 = 额外网络请求,违反零请求原则) |
| 归档数据超 10k 条 | 归档库分页加载(每页 50 簇);提供"清理 90 天前"工具 |
| chrome.tabs.create 达到浏览器上限 | 捕获异常,提示分批恢复 |

---

## 10. 开发计划

### Milestone 0:骨架(第 1 周)
- WXT 项目初始化、manifest 权限、CI(lint + vitest)
- Service worker 事件订阅 + storage.session hydrate 机制
- Dexie schema、仓储层、消息协议
- 侧边栏渲染真实标签列表(无分组)
- 验收:打开/关闭标签,侧边栏实时同步,worker 休眠重启后状态无损

### Milestone 1:MVP 核心(第 2–3 周)
- 手动 Context CRUD + 拖拽归属 + 原生 tabGroups 双向同步
- 整簇收纳/恢复(含 undo)、重复检测合并
- ⌘⇧K 搜索(打开 + 归档)
- 归档库界面 + Markdown 导出
- 验收:2.1 节 US-01/03/04/05/09 全部通过

### Milestone 2:自动化(第 4–5 周)
- 聚簇引擎(信号、打分、升格、负样本)+ 回放测试集
- localhost 映射、GitHub 元数据、陈旧检测、标签挂起
- 验收:自用一周,纠正率 < 15%

### Milestone 3:打磨与上架(第 6 周)
- 深浅模式细节、键盘无障碍、空状态
- 商店素材(截图、描述、隐私政策页)、$5 开发者注册、提交审核
- 可选:AI 命名(若时间允许,否则 v1.5)

### 发布策略
- 第 0–2 周:本地 Load unpacked 自用(dogfood)
- 第 6 周:Chrome Web Store 上架(unlisted 内测链接 → 公开)
- 上架后:Edge Add-ons 同步提交(免费,同一 zip)

---

## 11. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| Chrome 原生功能蚕食(垂直标签、分组增强) | 高 | 中 | 差异化钉死在自动聚簇 + 程序员特化;与原生分组共生而非对抗 |
| 自动聚簇准确率不达预期 | 中 | 高 | 保守阈值 + 未分类兜底 + 回放测试集驱动调参;最坏退化为手动分组仍是完整产品 |
| MV3 worker 休眠导致事件丢失 | 中 | 中 | 幂等设计 + storage.session 快照 + 定期全量校对(alarms 每 10 分钟对账 chrome.tabs.query 与 DB) |
| tabs 权限引发商店审核拒绝或用户戒心 | 低 | 中 | 单一用途描述清晰;隐私政策明确零上传;开源仓库增信 |
| 竞品红海获客难 | 高 | 中 | 垂直定位关键词(developer tab manager / localhost);技术社区冷启动(HN、V2EX、掘金) |

---

## 附录 A:名词表

| 术语 | 含义 |
|---|---|
| Context | 上下文簇,一组同任务标签的集合,产品的一等公民 |
| 收纳 | 将 Context 归档并关闭其全部标签 |
| opener 链 | 由 openerTabId 构成的标签打开来源树 |
| 挂起 (discard) | Chrome 释放标签内存但保留标签条目的机制 |
| 负样本 | 用户拖出标签形成的"该域名不属于该簇"记录 |
| pinned 归属 | 被人工操作锁定、引擎不再改动的标签归属 |

## 附录 B:未决问题

1. 搜索 overlay 页内注入方案是否值得做(需 scripting 可选权限)——待 MVP 后按侧边栏方案的使用摩擦决定
2. 正式产品名与图标——上架前定
3. 是否开源——倾向开源(增信 + 程序员社区传播),待定协议(MIT vs AGPL)

*— 文档完 —*
