// 轻量 chrome.* 仿真,用于集成测试后台事件流水线。
// 关键:remove() 关闭已分组标签时,先发 onUpdated(groupId:-1) 再发 onRemoved
// (对齐真实 Chrome「关闭前先脱组」的行为),用以复现 archive 阶段的幻影记录竞态。

type Listener = (...args: any[]) => void | Promise<void>;

class Emitter {
  private ls: Listener[] = [];
  addListener(fn: Listener) {
    this.ls.push(fn);
  }
  async emit(...args: any[]) {
    for (const fn of this.ls) await fn(...args);
  }
}

interface FakeTab {
  id: number;
  url: string;
  title: string;
  windowId: number;
  groupId: number;
  active: boolean;
  discarded: boolean;
  favIconUrl?: string;
  pendingUrl?: string;
}

interface FakeGroup {
  id: number;
  title?: string;
  color: string;
  windowId: number;
  collapsed: boolean;
  shared: boolean;
}

const NONE = -1;

export class FakeChrome {
  tabsById = new Map<number, FakeTab>();
  groupsById = new Map<number, FakeGroup>();
  private nextTabId = 100;
  private nextGroupId = 900;

  onCreated = new Emitter();
  onUpdated = new Emitter();
  onActivated = new Emitter();
  onRemoved = new Emitter();
  groupOnUpdated = new Emitter();
  groupOnRemoved = new Emitter();

  /** 模拟用户在浏览器里打开一个标签(触发 onCreated)。 */
  async userOpenTab(url: string, opts: { windowId?: number; title?: string } = {}): Promise<number> {
    const id = this.nextTabId++;
    const tab: FakeTab = {
      id,
      url,
      title: opts.title ?? url,
      windowId: opts.windowId ?? 1,
      groupId: NONE,
      active: false,
      discarded: false,
    };
    this.tabsById.set(id, tab);
    await this.onCreated.emit({ ...tab });
    return id;
  }

  /** 模拟用户在浏览器里把标签拖出分组(触发 onUpdated groupId:-1)。 */
  async userUngroup(tabId: number): Promise<void> {
    const tab = this.tabsById.get(tabId);
    if (!tab) return;
    tab.groupId = NONE;
    await this.onUpdated.emit(tabId, { groupId: NONE }, { ...tab });
  }

  private removeFromGroupIfEmpty(groupId: number, windowId: number) {
    if (groupId < 0) return;
    const stillInGroup = [...this.tabsById.values()].some((t) => t.groupId === groupId);
    if (!stillInGroup && this.groupsById.has(groupId)) {
      const g = this.groupsById.get(groupId)!;
      this.groupsById.delete(groupId);
      void this.groupOnRemoved.emit({ ...g });
    }
  }

  // ---- chrome.tabs API ----
  tabs = {
    create: async ({ url, active = false, windowId = 1 }: { url: string; active?: boolean; windowId?: number }) => {
      const id = this.nextTabId++;
      const tab: FakeTab = { id, url, title: url, windowId, groupId: NONE, active, discarded: false };
      this.tabsById.set(id, tab);
      await this.onCreated.emit({ ...tab });
      return { ...tab };
    },
    remove: async (tabId: number) => {
      const tab = this.tabsById.get(tabId);
      if (!tab) throw new Error(`No tab with id ${tabId}`);
      const { groupId, windowId } = tab;
      const snapshot = { ...tab, groupId: NONE };
      this.tabsById.delete(tabId);
      if (groupId >= 0) {
        // 真实 Chrome:关闭已分组标签时「脱组」onUpdated 与 onRemoved 并发派发。
        // 这里并发触发以复现竞态(onRemoved 的查找先于 onUpdated 回填提交)。
        await Promise.all([
          this.onUpdated.emit(tabId, { groupId: NONE }, snapshot),
          this.onRemoved.emit(tabId, { windowId, isWindowClosing: false }),
        ]);
      } else {
        await this.onRemoved.emit(tabId, { windowId, isWindowClosing: false });
      }
      this.removeFromGroupIfEmpty(groupId, windowId);
    },
    group: async ({ tabIds, groupId }: { tabIds: number[]; groupId?: number }) => {
      const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
      let gid = groupId;
      if (gid == null) {
        gid = this.nextGroupId++;
        const first = this.tabsById.get(ids[0]!);
        const g: FakeGroup = {
          id: gid,
          color: 'grey',
          windowId: first?.windowId ?? 1,
          collapsed: false,
          shared: false,
        };
        this.groupsById.set(gid, g);
        // 真实 Chrome:新建分组会派发 group 事件(在调用方 setNativeGroupId 之前)。
        // 用以复现「我们自建的分组被入站处理误收编成新分组」的竞态。
        await this.groupOnUpdated.emit({ ...g });
      }
      for (const id of ids) {
        const tab = this.tabsById.get(id);
        if (!tab) throw new Error(`No tab with id ${id}`);
        tab.groupId = gid;
        await this.onUpdated.emit(id, { groupId: gid }, { ...tab });
      }
      return gid;
    },
    ungroup: async (tabId: number | number[]) => {
      const ids = Array.isArray(tabId) ? tabId : [tabId];
      for (const id of ids) {
        const tab = this.tabsById.get(id);
        if (!tab) continue;
        const old = tab.groupId;
        tab.groupId = NONE;
        await this.onUpdated.emit(id, { groupId: NONE }, { ...tab });
        this.removeFromGroupIfEmpty(old, tab.windowId);
      }
    },
    discard: async (tabId: number) => {
      const tab = this.tabsById.get(tabId);
      if (!tab) return undefined;
      tab.discarded = true; // 现代 Chrome:保留 id
      return { ...tab };
    },
    query: async (_qi: Record<string, unknown> = {}) => [...this.tabsById.values()].map((t) => ({ ...t })),
    get: async (tabId: number) => {
      const tab = this.tabsById.get(tabId);
      if (!tab) throw new Error(`No tab with id ${tabId}`);
      return { ...tab };
    },
    update: async (tabId: number, _props: Record<string, unknown>) => {
      const tab = this.tabsById.get(tabId);
      return tab ? { ...tab } : undefined;
    },
  };

  // ---- chrome.tabGroups API ----
  tabGroups = {
    TAB_GROUP_ID_NONE: NONE,
    get: async (groupId: number) => {
      const g = this.groupsById.get(groupId);
      if (!g) throw new Error(`No group ${groupId}`);
      return { ...g };
    },
    query: async (_qi: Record<string, unknown> = {}) => [...this.groupsById.values()].map((g) => ({ ...g })),
    update: async (groupId: number, props: { title?: string; color?: string }) => {
      const g = this.groupsById.get(groupId);
      if (!g) return undefined;
      if (props.title !== undefined) g.title = props.title;
      if (props.color !== undefined) g.color = props.color;
      await this.groupOnUpdated.emit({ ...g });
      return { ...g };
    },
  };

  windows = {
    getLastFocused: async (_?: unknown) => ({ id: 1 }),
    update: async (_id: number, _p: unknown) => ({}),
  };

  /** 装到全局 chrome,并把事件对象接到我们注册用的形状。 */
  install() {
    const g = globalThis as any;
    g.chrome = {
      tabs: {
        ...this.tabs,
        onCreated: this.onCreated,
        onUpdated: this.onUpdated,
        onActivated: this.onActivated,
        onRemoved: this.onRemoved,
      },
      tabGroups: {
        ...this.tabGroups,
        onUpdated: this.groupOnUpdated,
        onRemoved: this.groupOnRemoved,
      },
      windows: this.windows,
    };
  }
}
