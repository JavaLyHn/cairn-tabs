# 浏览器重启后恢复任务/标签 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让对账在浏览器重启(chromeTabId/groupId 全部重置)后按稳定键(标签 URL、分组标题)重新关联,而不是按旧 ID 误删,从而完整恢复任务/标签/★/锁定。

**Architecture:** 改两个对账函数:`reconcile`(tab-sync)加"按 URL 重绑"趟 + `purge` 开关 + 空标签集保护;`reconcileGroups`(group-sync)加"按标题重连"趟 + `prune` 开关。冷启动 `hydrate` 传 `purge:false`/`prune:false`(只重绑重连、不清删),面板聚焦对账用默认(清删)。

**Tech Stack:** WXT (MV3) · TypeScript(strict, noUncheckedIndexedAccess)· Dexie · Vitest + fake-chrome + fake-indexeddb · pnpm。

## Global Constraints

- 架构不变量:SW 是唯一写入方;DB 只经 `repositories.ts`;对账只读 `chrome.tabs`/`chrome.tabGroups` + 写 repo,不引入裸原生副作用。
- 归档标签(`chromeTabId == null`)对账不碰,保持归档态。
- 向后兼容:`reconcile`/`reconcileGroups` 新增参数必须可选且默认 = 现有行为(`purge`/`prune` 默认 `true`);现有 2 参调用点不改。
- 提交信息用中文,分层提交;每条结尾:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。不主动推送。
- 每个任务结束跑 `pnpm compile` + 相关 `pnpm test` 全绿。

---

### Task 1: `reconcile` 按 URL 重绑 + purge 开关 + 空集保护

**Files:**
- Modify: `core/background/tab-sync.ts`(`reconcile`,约 162-216 行)
- Test: `tests/restart-recovery.integration.test.ts`(新建)

**Interfaces:**
- Produces: `reconcile(repo: Repository, onChange: () => void, opts?: { purge?: boolean }): Promise<void>` —— `purge` 默认 `true`;死 `chromeTabId` 记录先按 `url` 重绑到未占用的同 URL 实时标签(保留元数据),重绑不上的仅在 `purge && 实时标签非空` 时删。

- [ ] **Step 1: 写失败测试**(新建 `tests/restart-recovery.integration.test.ts`)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { Repository } from '@/core/store/repositories';
import { CairnTabsDB } from '@/core/store/db';
import { registerTabListeners } from '@/core/background/tab-sync';
import { registerGroupListeners } from '@/core/background/group-sync';
import { reconcile } from '@/core/background/tab-sync';
import { INBOX_ID } from '@/shared/types';

let fake: FakeChrome;
let repo: Repository;
let dbn = 9000;

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`restart-itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  registerTabListeners(repo, () => {}, () => ({}), () => false); // 关自动聚簇
  registerGroupListeners(repo, () => {});
});

/** 模拟会话恢复:所有 tab / group 换新 id,url/title/color/分组归属不变。 */
function simulateSessionRestore() {
  const T = 100000, G = 100000;
  const oldTabs = [...fake.tabsById.values()];
  const oldGroups = [...fake.groupsById.values()];
  fake.tabsById.clear();
  fake.groupsById.clear();
  for (const g of oldGroups) fake.groupsById.set(g.id + G, { ...g, id: g.id + G });
  for (const t of oldTabs) {
    const groupId = t.groupId >= 0 ? t.groupId + G : t.groupId;
    fake.tabsById.set(t.id + T, { ...t, id: t.id + T, groupId });
  }
}

describe('reconcile 按 URL 重绑', () => {
  it('重启后死 chromeTabId 记录按 URL 重绑,保留 contextId/starred/pinned,不误删', async () => {
    await fake.userOpenTab('https://a.com/x', { title: 'A' });
    const [rid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    await repo.setTabStarred(rid!, true);
    await repo.pinTab(rid!);
    const before = (await repo.getTab(rid!))!;
    const oldChromeId = before.chromeTabId!;

    simulateSessionRestore(); // chromeTabId 变了

    await reconcile(repo, () => {}, { purge: true });

    const after = (await repo.getTab(rid!))!;
    expect(after).toBeTruthy();                       // 记录未被删
    expect(after.chromeTabId).toBe(oldChromeId + 100000); // 回填新 id
    expect(after.starred).toBe(true);
    expect(after.pinned).toBe(true);
    expect(after.url).toBe('https://a.com/x');
    // 未产生重复记录
    expect((await repo.getSnapshot()).tabs.filter((t) => t.url === 'https://a.com/x')).toHaveLength(1);
  });

  it('purge:false 保留重绑不上的死记录;purge:true 删除', async () => {
    await fake.userOpenTab('https://gone.com', { title: 'Gone' });
    await fake.userOpenTab('https://live.com', { title: 'Live' });
    const inbox = (await repo.getContext(INBOX_ID))!.tabOrder;
    const goneRec = (await repo.getSnapshot()).tabs.find((t) => t.url === 'https://gone.com')!;
    // 关掉 gone(直接从 fake 移除,不触发事件),live 仍在
    fake.tabsById.delete(goneRec.chromeTabId!);

    await reconcile(repo, () => {}, { purge: false });
    expect(await repo.getTab(goneRec.id)).toBeTruthy(); // 保留

    await reconcile(repo, () => {}, { purge: true });
    expect(await repo.getTab(goneRec.id)).toBeUndefined(); // 删除
    expect(inbox.length).toBe(2);
  });

  it('空集保护:实时标签为空但库有记录 → 即便 purge:true 也不删', async () => {
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [rid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    fake.tabsById.clear(); // 恢复未就绪:一个实时标签都没有

    await reconcile(repo, () => {}, { purge: true });
    expect(await repo.getTab(rid!)).toBeTruthy(); // 未删
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test restart-recovery`
Expected: FAIL(重绑逻辑不存在:第一例记录被当幻影删、或 chromeTabId 未回填)

- [ ] **Step 3: 实现**

把 `core/background/tab-sync.ts` 的 `reconcile` 整个函数替换为:

```ts
export async function reconcile(
  repo: Repository,
  onChange: OnChange,
  opts?: { purge?: boolean },
): Promise<void> {
  const purge = opts?.purge !== false;
  const now = Date.now();
  const liveTabs = await chrome.tabs.query({});
  const liveById = new Map<number, chrome.tabs.Tab>();
  for (const t of liveTabs) if (t.id != null) liveById.set(t.id, t);

  const { tabs: records } = await repo.getSnapshot();

  // 存活记录(chromeTabId 仍在实时标签中);同 id 重复 → 清多余。死 id 收集起来待重绑。
  const recordByChromeId = new Map<number, TabRecord>();
  const deadRecords: TabRecord[] = [];
  for (const r of records) {
    if (r.chromeTabId == null) continue; // 归档标签,不动
    if (!liveById.has(r.chromeTabId)) {
      deadRecords.push(r);
      continue;
    }
    if (recordByChromeId.has(r.chromeTabId)) {
      await repo.removeTab(r.id); // 同一 chromeTabId 的重复记录 → 清多余,保留先出现的
    } else {
      recordByChromeId.set(r.chromeTabId, r);
    }
  }

  // 重绑趟:重启后 chromeTabId 全变 —— 死记录按 url 找未占用的同 URL 实时标签,回填新 id(元数据保留)
  const stillDead: TabRecord[] = [];
  for (const rec of deadRecords) {
    let matchedId: number | undefined;
    for (const [id, tab] of liveById) {
      if (recordByChromeId.has(id)) continue; // 已被占用
      if (!isTrackable(tab)) continue;
      if ((tab.url || tab.pendingUrl || '') === rec.url) {
        matchedId = id;
        break;
      }
    }
    if (matchedId != null) {
      const tab = liveById.get(matchedId)!;
      await repo.updateTab(rec.id, { chromeTabId: matchedId, windowId: tab.windowId });
      recordByChromeId.set(matchedId, rec);
    } else {
      stillDead.push(rec);
    }
  }

  // 清删趟:重绑不上的死记录 → 仅在 purge 且实时标签非空时删。
  // 空集保护:实时无标签但库有记录 = 会话恢复尚未就绪,跳过清删,留给之后的对账。
  const restoreIncomplete = liveTabs.length === 0 && records.some((r) => r.chromeTabId != null);
  if (purge && !restoreIncomplete) {
    for (const rec of stillDead) await repo.removeTab(rec.id);
  }

  // 补建 / 校正:遍历真实标签 —— 未占用则补建,已有记录则校正 url/title/favicon(仅有变化才写)
  for (const [chromeId, tab] of liveById) {
    if (!isTrackable(tab)) continue;
    const rec = recordByChromeId.get(chromeId);
    if (rec) {
      const url = tab.url || tab.pendingUrl || '';
      const title = tabTitle(tab);
      const faviconUrl = tab.favIconUrl;
      if (rec.url !== url || rec.title !== title || rec.faviconUrl !== faviconUrl) {
        await repo.updateTab(rec.id, { url, title, faviconUrl });
      }
    } else {
      await repo.addTab(
        {
          chromeTabId: chromeId,
          windowId: tab.windowId,
          contextId: await contextIdForGroup(repo, tab.groupId),
          url: tab.url || tab.pendingUrl || '',
          title: tabTitle(tab),
          faviconUrl: tab.favIconUrl,
          firstOpenedAt: now,
          lastActiveAt: now,
        },
        now,
      );
    }
  }
  onChange();
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test restart-recovery && pnpm test sync`
Expected: PASS(新用例 + 原有 `sync.integration` 对账用例仍绿 —— 无死记录时重绑趟空转,行为等价)

- [ ] **Step 5: 提交**

```bash
git add core/background/tab-sync.ts tests/restart-recovery.integration.test.ts
git commit -m "$(cat <<'EOF'
fix(bg): reconcile 按 URL 重绑死 chromeTabId 记录 + purge 开关 + 空集保护

重启后 chromeTabId 全变,原逻辑当幻影误删;改为先按 URL 重绑(保留元数据)。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `reconcileGroups` 按标题重连 + prune 开关

**Files:**
- Modify: `core/background/group-sync.ts`(`reconcileGroups`,约 187-222 行)
- Test: `tests/restart-recovery.integration.test.ts`(追加)

**Interfaces:**
- Consumes: 复用文件内已有的 `NONE`、`adoptGroup`。
- Produces: `reconcileGroups(repo: Repository, onChange: () => void, opts?: { prune?: boolean }): Promise<void>` —— `prune` 默认 `true`;死 `nativeGroupId` 的 context 先按 `name` 重连到未占用的同标题实时分组,连不上时仅在 `prune` 下走原删/解绑。

- [ ] **Step 1: 写失败测试**(追加到 `tests/restart-recovery.integration.test.ts`,复用顶部 setup 与 `simulateSessionRestore`)

```ts
import { reconcileGroups } from '@/core/background/group-sync';

describe('reconcileGroups 按标题重连', () => {
  it('重启后死 nativeGroupId 的任务按标题重连到同名新分组,不删任务', async () => {
    // 造一个带原生分组的任务:context.nativeGroupId=900,fake 里有个同标题分组 900
    const ctx = await repo.createContext('任务甲', Date.now(), { nativeGroupId: 900 });
    fake.groupsById.set(900, { id: 900, title: '任务甲', color: 'blue', windowId: 1, collapsed: false, shared: false });
    // 该任务里放一个打开的标签(使其非空)
    await fake.userOpenTab('https://a.com', { title: 'A' });
    const [rid] = (await repo.getContext(INBOX_ID))!.tabOrder;
    await repo.moveTab(rid!, ctx.id, Date.now());

    simulateSessionRestore(); // group 900 → 100900(标题不变),tab id 也变

    // 先重绑标签(否则 step 2 找不到记录),再重连分组
    await reconcile(repo, () => {}, { purge: false });
    await reconcileGroups(repo, () => {}, { prune: true });

    const after = (await repo.getContext(ctx.id))!;
    expect(after).toBeTruthy();                 // 任务未删
    expect(after.nativeGroupId).toBe(100900);   // 重连到新分组 id
  });

  it('prune:false:死 nativeGroupId 且无同名分组 → 任务原样保留(不删不解绑)', async () => {
    const ctx = await repo.createContext('孤儿任务', Date.now(), { nativeGroupId: 900 });
    // fake 里没有任何分组
    await reconcileGroups(repo, () => {}, { prune: false });
    const after = (await repo.getContext(ctx.id))!;
    expect(after).toBeTruthy();
    expect(after.nativeGroupId).toBe(900); // 保留死 id,供之后重连
  });

  it('prune:true:死 nativeGroupId、空、无同名分组 → 删任务(原行为)', async () => {
    const ctx = await repo.createContext('将删任务', Date.now(), { nativeGroupId: 900 });
    await reconcileGroups(repo, () => {}, { prune: true });
    expect(await repo.getContext(ctx.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test restart-recovery`
Expected: FAIL(重连逻辑不存在:第一例任务被删或 nativeGroupId 未更新;`prune:false` 未被支持)

- [ ] **Step 3: 实现**

把 `core/background/group-sync.ts` 的 `reconcileGroups` 整个函数替换为:

```ts
/** hydrate / 聚焦时按真实分组归属全量校对。prune=false 时只重连、不删不解绑(冷启动用)。 */
export async function reconcileGroups(
  repo: Repository,
  onChange: () => void,
  opts?: { prune?: boolean },
): Promise<void> {
  const prune = opts?.prune !== false;
  const now = Date.now();

  const liveGroups = await chrome.tabGroups.query({});
  const liveGroupIds = new Set(liveGroups.map((g) => g.id));
  const { contexts } = await repo.getSnapshot();

  // 已被现存 context 正确引用的分组先占位,避免重连时重复占用
  const claimedGroups = new Set<number>();
  for (const c of contexts) {
    if (c.nativeGroupId != null && liveGroupIds.has(c.nativeGroupId)) claimedGroups.add(c.nativeGroupId);
  }
  // 标题 → 实时分组 id 列表(用于按标题重连)
  const liveByTitle = new Map<string, number[]>();
  for (const g of liveGroups) {
    const title = (g.title ?? '').trim();
    if (!title) continue;
    const arr = liveByTitle.get(title);
    if (arr) arr.push(g.id);
    else liveByTitle.set(title, [g.id]);
  }

  // 1) 死 nativeGroupId 的 context:先按标题重连,连不上再(仅 prune 下)删/解绑
  for (const c of contexts) {
    if (c.nativeGroupId == null || liveGroupIds.has(c.nativeGroupId)) continue; // 无组 / 引用有效
    const candidates = liveByTitle.get(c.name.trim()) ?? [];
    const gid = candidates.find((id) => !claimedGroups.has(id));
    if (gid != null) {
      await repo.setNativeGroupId(c.id, gid); // 重连(任务保留)
      claimedGroups.add(gid);
      continue;
    }
    if (prune) {
      if (c.id !== INBOX_ID && c.status === 'active' && c.tabOrder.length === 0) {
        await repo.deleteContext(c.id, now);
      } else {
        await repo.setNativeGroupId(c.id, undefined);
      }
    }
    // prune:false → 原样保留死 nativeGroupId,供之后对账重连
  }

  // 2) 每个活跃标签的归属对齐其原生分组(未知分组则收编)
  const liveTabs = await chrome.tabs.query({});
  for (const tab of liveTabs) {
    if (tab.id == null) continue;
    const record = await repo.getTabByChromeId(tab.id);
    if (!record) continue;
    const gid = tab.groupId ?? NONE;
    let target: string;
    if (gid === NONE || gid == null) {
      target = INBOX_ID;
    } else {
      const ctx = (await repo.findContextByNativeGroupId(gid)) ?? (await adoptGroup(repo, gid, now));
      target = ctx.id;
    }
    if (record.contextId !== target) await repo.moveTab(record.id, target, now);
  }
  onChange();
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test restart-recovery && pnpm test sync`
Expected: PASS(新用例 + 原有分组对账用例仍绿 —— 无死 nativeGroupId 时重连趟空转)

- [ ] **Step 5: 提交**

```bash
git add core/background/group-sync.ts tests/restart-recovery.integration.test.ts
git commit -m "$(cat <<'EOF'
fix(bg): reconcileGroups 按标题重连死 nativeGroupId 任务 + prune 开关

重启后 groupId 全变,原逻辑删空任务;改为先按分组标题重连保住任务。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: hydrate 冷启动非破坏 + 端到端恢复测试

**Files:**
- Modify: `core/background/index.ts`(`hydrate`,约 232-233 行)
- Test: `tests/restart-recovery.integration.test.ts`(追加端到端用例)

**Interfaces:**
- Consumes: `reconcile(..., { purge })`(Task 1)、`reconcileGroups(..., { prune })`(Task 2)。
- Produces:(无对外新接口;`hydrate` 内部改为冷启动非破坏对账)

- [ ] **Step 1: 写失败测试**(追加到 `tests/restart-recovery.integration.test.ts`;需要命令层 + 命令上下文)

在文件顶部 import 增补:
```ts
import { SearchIndex } from '@/core/search';
import { UndoManager } from '@/core/background/undo';
import { handleCommand, type CommandContext } from '@/core/background/commands';
```

追加用例:
```ts
describe('端到端:模拟重启后完整恢复', () => {
  it('任务、标签、★、锁定 全部恢复到原任务(冷启动非破坏 + 聚焦对账)', async () => {
    const ctx: CommandContext = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
    // 建任务甲,放两个标签进去(MOVE_TAB 会建原生分组、打锁),再 star 一个;另留一个在未分类
    await handleCommand({ type: 'CREATE_CONTEXT', name: '任务甲' }, ctx);
    const cid = (await repo.getSnapshot()).contexts.find((c) => c.name === '任务甲')!.id;
    await fake.userOpenTab('https://a.com/1', { title: 'A1' });
    await fake.userOpenTab('https://a.com/2', { title: 'A2' });
    await fake.userOpenTab('https://inbox.com/x', { title: 'IN' });
    const inboxIds = (await repo.getContext(INBOX_ID))!.tabOrder;
    const [id1, id2] = inboxIds; // 前两个是 a.com/1、a.com/2
    await handleCommand({ type: 'MOVE_TAB', tabRecordId: id1!, toContextId: cid }, ctx);
    await handleCommand({ type: 'MOVE_TAB', tabRecordId: id2!, toContextId: cid }, ctx);
    await repo.setTabStarred(id1!, true);
    const groupIdBefore = (await repo.getContext(cid))!.nativeGroupId;
    expect(groupIdBefore).toBeGreaterThanOrEqual(0);

    simulateSessionRestore(); // 所有 tab / group id 换新,url/title/color/归属不变

    // 冷启动 hydrate 的对账序列(非破坏),再模拟面板聚焦对账(清删)
    await reconcile(repo, () => {}, { purge: false });
    await reconcileGroups(repo, () => {}, { prune: false });
    await reconcile(repo, () => {});
    await reconcileGroups(repo, () => {});

    // 任务甲仍在(同 context id),重连到新分组
    const after = (await repo.getContext(cid))!;
    expect(after).toBeTruthy();
    expect(after.nativeGroupId).toBe(groupIdBefore! + 100000);
    // 两个标签仍属任务甲、pinned 保留、其一 starred 保留
    const t1 = (await repo.getTab(id1!))!;
    const t2 = (await repo.getTab(id2!))!;
    expect(t1.contextId).toBe(cid);
    expect(t2.contextId).toBe(cid);
    expect(t1.pinned).toBe(true);
    expect(t1.starred).toBe(true);
    // 未分类标签仍在未分类
    const tin = (await repo.getSnapshot()).tabs.find((t) => t.url === 'https://inbox.com/x')!;
    expect(tin.contextId).toBe(INBOX_ID);
    // 无重复:总标签数仍为 3
    expect((await repo.getSnapshot()).tabs.length).toBe(3);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test restart-recovery`
Expected: 该端到端用例此时其实**应已通过**(Task 1/2 已实现重绑重连,测试直接调 `reconcile{purge:false}` 等)。若通过,视为对 Task 1/2 组合行为的回归锁定,继续 Step 3;若失败,按报错修正 Task 1/2 的组合逻辑。

> 说明:本任务的"失败测试"主要保障的是 **hydrate 接线**(Step 3)—— 端到端用例锁定组合行为,Step 3 保证真实冷启动路径也走非破坏对账。

- [ ] **Step 3: 实现 hydrate 接线**

把 `core/background/index.ts` `hydrate()` 里的
```ts
  await reconcile(repository, scheduleBroadcast);
  await reconcileGroups(repository, scheduleBroadcast);
```
改为
```ts
  // 冷启动:会话恢复可能尚未就绪 → 只重绑/重连、不清删(清删留给面板聚焦触发的对账)
  await reconcile(repository, scheduleBroadcast, { purge: false });
  await reconcileGroups(repository, scheduleBroadcast, { prune: false });
```
(`reconcileNow` 的两处调用保持默认 —— `purge:true`/`prune:true`,不改。)

- [ ] **Step 4: 类型检查 + 全量 + 构建**

Run: `pnpm compile && pnpm test && pnpm build`
Expected: tsc 无错;全部测试 PASS(含 `restart-recovery` 与原有 `sync`);构建成功

- [ ] **Step 5: 手动验证(用户 Chrome)**

关全部浏览器 → 重开(会话恢复原生分组)→ 打开面板 → 任务、标签、★重点、手动锁定 应全部回来(非空)。

- [ ] **Step 6: 提交**

```bash
git add core/background/index.ts tests/restart-recovery.integration.test.ts
git commit -m "$(cat <<'EOF'
fix(bg): 冷启动 hydrate 对账非破坏(只重绑重连,清删留给聚焦对账)

+ 端到端测试:模拟会话恢复后任务/标签/★/锁定完整恢复。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 自检(spec 覆盖)

- 标签按 URL 重绑 → Task 1(重绑趟 + 元数据保留 + 无重复)。
- 任务按标题重连 → Task 2(重连趟)。
- purge/prune 开关 + 冷启动非破坏 → Task 1(purge)、Task 2(prune)、Task 3(hydrate 传 false)。
- 空标签集保护 → Task 1(restoreIncomplete)。
- 归档标签不碰 → Task 1(`chromeTabId == null` 跳过)。
- 端到端恢复 → Task 3。
- 类型一致性:`reconcile(repo,onChange,{purge?})`、`reconcileGroups(repo,onChange,{prune?})` 两任务一致;`simulateSessionRestore` 的 +100000 偏移在 Task 1 定义、Task 2/3 复用。
