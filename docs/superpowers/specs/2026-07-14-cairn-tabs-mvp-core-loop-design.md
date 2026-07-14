# Cairn Tabs MVP 核心闭环 — 设计文档

> 日期:2026-07-14 | 作者:LyHn / Claude
> 上游文档:`tabctx-prd-tech-spec.md`(产品与技术实现文档 v1.0)
> 本文档只覆盖「MVP 核心闭环」这一纵向切片,不是完整 MVP。

---

## 1. 目标与范围

在浏览器里**装得上、点得动、看得到效果**的最小完整切片,覆盖用户故事 US-01(检索)/US-03(整簇收纳)/US-04(整簇恢复),外加手动组织与实时同步。

### 做

- 骨架:WXT(Manifest V3)+ React 18 + TypeScript + Tailwind CSS + Dexie(IndexedDB)+ Zustand + fuse.js
- Service Worker 监听 `chrome.tabs.*`,作为**唯一写入方**,广播 `STATE_SNAPSHOT`
- 侧边栏(Side Panel):实时标签列表,按 Context 分组展示;统计条;底部状态栏
- 手动 Context:创建、重命名、拖拽标签归属
- 整簇收纳(归档并关闭)+ 整簇恢复(限速重开)+ 5 秒 undo toast
- ⌘⇧K 搜索 overlay(fuse.js,匹配打开 + 已归档标签;↑↓ 选择 / ↵ 跳转 / ⌘↵ 恢复整簇 / Esc 关闭)

### 不做(留给后续 milestone)

自动聚簇引擎(F-07)、原生 tabGroups 双向同步(F-06)、重复检测合并(F-05)、localhost 映射(F-08)、GitHub 元数据(F-09)、陈旧检测(F-10)、挂起回收(F-11)、导出(F-12)、AI(F-13)。

## 2. 归属模型(无自动聚簇时的简化)

这次没有聚簇引擎,定一条简单规则:

- **所有新打开的标签默认落入内置的「未分类」Context。**
- 用户手动创建命名 Context,把标签从「未分类」拖进去。
- 收纳 / 恢复 / 搜索都基于用户手动组织出来的结构。

「未分类」是一个 `origin: 'auto'` 的常驻 Context(id 固定为 `inbox`),不可删除、不可收纳整体(但其内标签可被拖走或单独关闭)。后续接入聚簇引擎时,只需替换「新标签如何决定 contextId」这一步,数据模型不变。

## 3. 架构与目录

遵循上游文档 4.3 的 WXT 约定。项目根即当前仓库根(`cairn-tabs/`),不再嵌套 `tabctx/` 子目录。

```
cairn-tabs/
├── wxt.config.ts              # manifest: 权限 / commands / side_panel
├── package.json
├── tsconfig.json
├── tailwind.config.js / postcss.config.js
├── entrypoints/
│   ├── background.ts          # SW 薄壳 → 委托 core/background
│   └── sidepanel/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── store.ts           # Zustand: 持有 snapshot + 发命令
│       └── components/        # ContextGroup / TabRow / StatsBar / SearchOverlay / UndoToast
├── core/
│   ├── store/
│   │   ├── db.ts              # Dexie schema(contexts + tabs)
│   │   └── repositories.ts    # 仓储层(唯一 DB 读写封装)
│   ├── background/
│   │   ├── index.ts           # 事件订阅 + hydrate + 命令分发 + 广播
│   │   ├── tab-sync.ts        # chrome.tabs.* → TabRecord 增删改
│   │   ├── commands.ts        # 命令处理器
│   │   └── undo.ts            # 收纳的 5s 可撤销缓冲
│   └── search/index.ts        # fuse.js 索引构建与查询
├── shared/
│   ├── types.ts               # Context / TabRecord / Settings(文档 5.1 子集)
│   └── messaging.ts           # Command / Event 协议(文档 5.4 子集)
└── tests/                     # vitest
```

**分层原则**:`core/` 与 UI 无关、可单测;`entrypoints/` 是各上下文的薄入口;`shared/` 是双方共享的类型与协议。DB 的读写只允许通过 `repositories.ts`,不散落在各处。

## 4. 数据流(单向)

```
chrome.tabs.* 事件 ──► SW(tab-sync)──► 写 Dexie ──► 广播 STATE_SNAPSHOT
                                                          │
UI 操作 ─► sendMessage(Command) ─► SW(commands) ─► 写 Dexie ─► 广播 STATE_SNAPSHOT
                                                          │
                              Side Panel(Zustand)订阅并全量刷新渲染
```

- **SW 是唯一写入方**;UI 只发命令、只读快照(上游文档核心原则,避免 MV3 多上下文并发写数据竞争)。
- **Worker 休眠对策**:内存态(`chromeTabId ↔ recordId` 映射、search 索引)不是事实来源;SW 每次被事件唤醒先 `hydrate()` 从 Dexie 重建,再处理事件。不使用常驻定时器。本切片无周期任务,暂不引入 `chrome.alarms`(留到 v1.1 陈旧/挂起时再加)。
- **全量快照刷新**:500 标签规模数据量小,全量比增量 diff 简单可靠(上游文档 5.4 结论)。UI 收到 `STATE_SNAPSHOT` 即整体重渲染。

## 5. 数据模型(文档 5.1 / 5.2 子集)

```ts
// shared/types.ts
export type ContextOrigin = 'auto' | 'manual';       // 本切片无 'ai'
export type ContextStatus = 'active' | 'archived';   // 本切片暂不区分 idle

export interface Context {
  id: string;                 // nanoid;内置未分类固定为 'inbox'
  name: string;
  origin: ContextOrigin;
  status: ContextStatus;
  createdAt: number;
  archivedAt?: number;
  lastActiveAt: number;
  tabOrder: string[];         // TabRecord.id 有序列表
}

export interface TabRecord {
  id: string;                 // 稳定 nanoid,不用易变的 chrome tabId
  chromeTabId?: number;       // 活跃时存在;归档后为空
  windowId?: number;
  contextId: string;
  url: string;
  title: string;
  faviconUrl?: string;
  firstOpenedAt: number;
  lastActiveAt: number;
}
```

Dexie schema:

```ts
this.version(1).stores({
  contexts: 'id, status, lastActiveAt, archivedAt',
  tabs: 'id, contextId, url, chromeTabId, lastActiveAt, [contextId+lastActiveAt]',
});
```

## 6. 消息协议(文档 5.4 子集)

```ts
export type Command =
  | { type: 'CREATE_CONTEXT'; name: string }
  | { type: 'RENAME_CONTEXT'; contextId: string; name: string }
  | { type: 'MOVE_TAB'; tabRecordId: string; toContextId: string }
  | { type: 'ARCHIVE_CONTEXT'; contextId: string }
  | { type: 'RESTORE_CONTEXT'; contextId: string }
  | { type: 'UNDO'; token: string }
  | { type: 'ACTIVATE_TAB'; tabRecordId: string }   // 搜索/点击直达
  | { type: 'CLOSE_TAB'; tabRecordId: string }
  | { type: 'REQUEST_SNAPSHOT' }
  | { type: 'SEARCH'; query: string };

export type Event =
  | { type: 'STATE_SNAPSHOT'; contexts: Context[]; tabs: TabRecord[] }
  | { type: 'SEARCH_RESULTS'; results: SearchResult[] }
  | { type: 'UNDOABLE'; action: string; token: string; ttlMs: number };
```

## 7. 关键流程

### 7.1 整簇收纳(ARCHIVE_CONTEXT,文档 7.1)

1. 读取 Context 的 tabOrder 与全部 TabRecord。
2. **先事务落盘**:`status='archived'`、`archivedAt=now`、各 TabRecord `chromeTabId=null`。
3. 记录 undo token(保存被关闭标签的 url + order + windowId,ttl 5s)。
4. `chrome.tabs.remove(全部 chromeTabId)`(先落盘再关闭 → 崩溃安全)。
5. 广播 `STATE_SNAPSHOT` + `UNDOABLE`。
6. 内置「未分类」不可整簇收纳。

### 7.2 整簇恢复(RESTORE_CONTEXT,文档 7.1)

1. 按 tabOrder 逐个 `chrome.tabs.create({ url, active: false })`,**每 50ms 一个**限速(一次性创建 20+ 会触发 Chrome 节流)。
2. 创建后立即 `chrome.tabs.discard(tabId)`,避免恢复瞬间内存暴涨。
3. 新 `chromeTabId` 回填 TabRecord;`status='active'`、`archivedAt` 清空。
4. 广播 `STATE_SNAPSHOT`。

### 7.3 Undo(5s)

`UNDO` 命令在 ttl 内:重开被收纳时关闭的标签、把 Context 状态回滚为 active、回填 chromeTabId。超时后 token 失效。

### 7.4 全局搜索(文档 7.2 子集)

- 索引字段:`title`(权重 0.6)、`url`(0.25)、`contextName`(0.15);fuse.js threshold 0.35。
- 索引由 SW 内存持有,标签事件后重建(500 标签 <20ms,本切片直接全量重建,不做增量)。
- 结果排序:打开的标签排在归档前;组内按 `lastActiveAt` 倒序。
- 入口:`chrome.commands` 的 `open-search`(⌘⇧K)→ `sidePanel.open()` + 面板内聚焦搜索框并展开 overlay。

## 8. manifest 权限(最小化,文档 4.4 子集)

```jsonc
{
  "permissions": ["tabs", "storage", "sidePanel"],
  "commands": {
    "open-search": { "suggested_key": { "default": "Ctrl+Shift+K", "mac": "Command+Shift+K" } }
  }
}
```

本切片不需要 `tabGroups`(无原生同步)、`alarms`(无周期任务)、`favicon`(favicon 直接取 `tab.favIconUrl`)。刻意不申请 `<all_urls>` / `history` / `bookmarks`。

## 9. 视觉规范(文档 3.4 子集,克制)

- 单一强调色 teal `#1D9E75`,仅用于:活跃簇边条、可恢复操作。
- 等宽字体仅用于:数字统计、域名摘要。
- 边框 hairline;圆角 6–8px;无阴影、无渐变。
- 深浅双模式跟随系统(`prefers-color-scheme`)。
- 正文 13px,辅助信息 11–11.5px。
- 悬停显隐:关闭按钮、簇头部操作图标仅 hover 出现。

## 10. 测试与验证

### 单测(vitest,不依赖 chrome API)

- 仓储层:Context/Tab 的增删改、tabOrder 维护、`[contextId+lastActiveAt]` 查询(用 `fake-indexeddb`)。
- 搜索:fuse 索引对 title/url/contextName 的匹配与排序。
- 收纳→恢复状态往返:纯仓储层逻辑(不含 chrome.tabs 调用,后者抽象为可注入的适配器以便打桩)。

### 真机验证(wxt dev)

`wxt dev` 自动拉起带插件的 Chrome。验收项:

1. 编译无错、扩展加载成功。
2. 侧边栏实时列出当前窗口标签(打开/关闭标签会同步)。
3. 创建 Context + 把标签拖进去。
4. 收纳:标签关闭、归档区出现该簇、undo toast 5s 内可撤销。
5. 恢复:标签重开、顺序不变。
6. ⌘⇧K:能搜到打开与归档的标签,回车直达。

> 说明:可自动化验证的部分(构建、扩展加载、SW 日志、DB 状态断言)由实现者跑;纯手动点击的交互会如实标注哪些已验证、哪些需用户亲自确认。

## 11. 边界情况(本切片相关子集,文档第 9 节)

| 场景 | 处理 |
|---|---|
| Worker 处理事件时被休眠打断 | 事件处理幂等;hydrate 后由下一事件补偿 |
| 多窗口 | 标签按 windowId 记录;恢复统一恢复到当前窗口 |
| 无痕窗口 | 不追踪(manifest 不启用 incognito) |
| 恢复时 URL 已失效 | 照常打开,不做可达性预检(零请求原则) |
| `chrome.tabs.create` 达上限 | 捕获异常,提示分批恢复 |
| 用户关闭浏览器 | Dexie 数据持久;下次启动 hydrate 后重建活跃标签映射 |

## 12. 后续衔接

数据模型、消息协议、分层已按完整 MVP 预留。后续按上游文档 milestone 增量接入:F-05 去重 → F-06 tabGroups 同步 → F-07 聚簇引擎(替换归属决策)→ v1.1 其余。
