# 关浏览器后自动归档未恢复任务 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 浏览器重启后,Chrome 没恢复回来的活跃命名任务自动归档(保留 URL),用户经现有「恢复」一键重开。

**Architecture:** 冷启动(`chrome.runtime.onStartup`)进入约 10 秒"宽限窗口",期间对账不清删;窗口结束(alarm)跑 `archiveUnrestoredContexts` —— 标签与原生分组**都没恢复**的活跃命名任务 → `repo.archiveContext`(保留 URL)。复用现有归档/恢复,无新 UI。

**Tech Stack:** WXT (MV3) · TypeScript(strict, noUncheckedIndexedAccess)· Dexie · Vitest + fake-chrome + fake-indexeddb · pnpm。

## Global Constraints

- 架构不变量:SW 唯一写入方;DB 只经 `repositories.ts`;归档标签(`chromeTabId == null`)对账不碰。
- 判定用双条件:任务**无存活标签(按实时 tab id 集合判断,不能只看 chromeTabId!=null)且无存活原生分组** 才归档。
- 只在 `onStartup`(浏览器真正启动)触发归档判定,不影响会话中正常操作。未分类零散标签不归档。
- 复用 `repo.archiveContext`(转 archived、清 chromeTabId/nativeGroupId、保留 URL)与现有 `RESTORE_CONTEXT`,不改其实现。
- 提交信息用中文,分层提交;每条结尾:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。不主动推送。
- 每个任务结束跑 `pnpm compile` + 相关 `pnpm test` 全绿。

---

### Task 1: `archiveUnrestoredContexts` 归档判定模块

**Files:**
- Create: `core/background/session-recovery.ts`
- Test: `tests/session-recovery.integration.test.ts`(新建)

**Interfaces:**
- Consumes: `Repository`(`getSnapshot`、`archiveContext`);`chrome.tabs.query`、`chrome.tabGroups.query`;`INBOX_ID`。
- Produces: `archiveUnrestoredContexts(repo: Repository, now: number): Promise<string[]>` —— 归档"标签与原生分组都没恢复"的活跃命名任务,返回被归档的 contextId 数组。

- [ ] **Step 1: 写失败测试**(新建 `tests/session-recovery.integration.test.ts`)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeChrome } from './fake-chrome';
import { Repository } from '@/core/store/repositories';
import { CairnTabsDB } from '@/core/store/db';
import { SearchIndex } from '@/core/search';
import { UndoManager } from '@/core/background/undo';
import { registerTabListeners } from '@/core/background/tab-sync';
import { registerGroupListeners } from '@/core/background/group-sync';
import { handleCommand, type CommandContext } from '@/core/background/commands';
import { archiveUnrestoredContexts } from '@/core/background/session-recovery';
import { INBOX_ID } from '@/shared/types';

let fake: FakeChrome;
let repo: Repository;
let ctx: CommandContext;
let dbn = 11000;

beforeEach(async () => {
  fake = new FakeChrome();
  fake.install();
  const db = new CairnTabsDB(`sessrec-itest-${dbn++}`);
  await db.open();
  repo = new Repository(db);
  await repo.ensureInbox(Date.now());
  ctx = { repo, search: new SearchIndex(), undo: new UndoManager(), onChange: () => {} };
  registerTabListeners(repo, () => {}, () => ({}), () => false); // 关自动聚簇
  registerGroupListeners(repo, () => {});
});

/** 建一个命名任务(带原生分组),放两个标签(其一 starred)。返回 { cid, id1, id2 }。 */
async function makeTask() {
  await handleCommand({ type: 'CREATE_CONTEXT', name: '任务甲' }, ctx);
  const cid = (await repo.getSnapshot()).contexts.find((c) => c.name === '任务甲')!.id;
  await fake.userOpenTab('https://a.com/1', { title: 'A1' });
  await fake.userOpenTab('https://a.com/2', { title: 'A2' });
  const [id1, id2] = (await repo.getContext(INBOX_ID))!.tabOrder;
  await handleCommand({ type: 'MOVE_TAB', tabRecordId: id1!, toContextId: cid }, ctx);
  await handleCommand({ type: 'MOVE_TAB', tabRecordId: id2!, toContextId: cid }, ctx);
  await repo.setTabStarred(id1!, true);
  return { cid, id1: id1!, id2: id2! };
}

describe('archiveUnrestoredContexts', () => {
  it('标签与分组都没恢复 → 归档命名任务,保留 URL/starred,清 chromeTabId', async () => {
    const { cid, id1 } = await makeTask();
    fake.tabsById.clear();
    fake.groupsById.clear(); // 模拟:Chrome 没恢复标签也没恢复分组

    const archived = await archiveUnrestoredContexts(repo, Date.now());

    expect(archived).toContain(cid);
    const c = (await repo.getContext(cid))!;
    expect(c.status).toBe('archived');
    const t1 = (await repo.getTab(id1))!;
    expect(t1.url).toBe('https://a.com/1'); // URL 保留
    expect(t1.starred).toBe(true);          // 元数据保留
    expect(t1.chromeTabId).toBeUndefined(); // 归档清 chromeTabId
  });

  it('有存活标签 → 不归档(即使分组没了)', async () => {
    const { cid } = await makeTask();
    fake.groupsById.clear(); // 分组没恢复,但标签还在(fake.tabsById 未清)

    const archived = await archiveUnrestoredContexts(repo, Date.now());
    expect(archived).not.toContain(cid);
    expect((await repo.getContext(cid))!.status).toBe('active');
  });

  it('原生分组还在 → 不归档(标签还没加载完)', async () => {
    const { cid } = await makeTask();
    const gid = (await repo.getContext(cid))!.nativeGroupId!;
    fake.tabsById.clear(); // 标签没恢复
    // 分组仍在(保持 gid 存活)——只要 fake.groupsById 里还有该 gid 即可;makeTask 已建它
    expect(fake.groupsById.has(gid)).toBe(true);

    const archived = await archiveUnrestoredContexts(repo, Date.now());
    expect(archived).not.toContain(cid);
    expect((await repo.getContext(cid))!.status).toBe('active');
  });

  it('未分类不归档', async () => {
    await fake.userOpenTab('https://loose.com', { title: 'L' });
    fake.tabsById.clear();
    const archived = await archiveUnrestoredContexts(repo, Date.now());
    expect(archived).toEqual([]);
    expect((await repo.getContext(INBOX_ID))!.status).toBe('active');
  });

  it('空任务不归档(交给常规清理)', async () => {
    await handleCommand({ type: 'CREATE_CONTEXT', name: '空任务' }, ctx);
    const cid = (await repo.getSnapshot()).contexts.find((c) => c.name === '空任务')!.id;
    const archived = await archiveUnrestoredContexts(repo, Date.now());
    expect(archived).not.toContain(cid);
    expect((await repo.getContext(cid))!.status).toBe('active');
  });

  it('归档后可经 RESTORE_CONTEXT 恢复', async () => {
    const { cid } = await makeTask();
    fake.tabsById.clear();
    fake.groupsById.clear();
    await archiveUnrestoredContexts(repo, Date.now());
    expect((await repo.getContext(cid))!.status).toBe('archived');

    await handleCommand({ type: 'RESTORE_CONTEXT', contextId: cid }, ctx);
    expect((await repo.getContext(cid))!.status).toBe('active');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test session-recovery`
Expected: FAIL(`archiveUnrestoredContexts` 模块不存在)

- [ ] **Step 3: 实现模块**

新建 `core/background/session-recovery.ts`:

```ts
// 会话恢复(见设计文档):浏览器重启后,Chrome 没恢复回来的活跃命名任务 → 归档(保留 URL)。

import type { Repository } from '../store/repositories';
import { INBOX_ID } from '@/shared/types';

/**
 * 归档「Chrome 没恢复回来」的活跃命名任务(标签与原生分组都没回来 = 真丢了)。
 * 归档保留 URL,可经 RESTORE_CONTEXT 一键重开。返回被归档的 contextId 列表。
 * 调用前应已跑过重绑/重连(reconcile/reconcileGroups 的非破坏轮),使已恢复的标签就位。
 */
export async function archiveUnrestoredContexts(repo: Repository, now: number): Promise<string[]> {
  const liveTabIds = new Set(
    (await chrome.tabs.query({})).map((t) => t.id).filter((n): n is number => n != null),
  );
  const liveGroupIds = new Set((await chrome.tabGroups.query({})).map((g) => g.id));
  const { contexts, tabs } = await repo.getSnapshot();
  const archived: string[] = [];
  for (const c of contexts) {
    if (c.id === INBOX_ID || c.status !== 'active') continue;
    const own = tabs.filter((t) => t.contextId === c.id);
    if (own.length === 0) continue; // 空任务交给常规清理
    const anyLive = own.some((t) => t.chromeTabId != null && liveTabIds.has(t.chromeTabId));
    const groupLive = c.nativeGroupId != null && liveGroupIds.has(c.nativeGroupId);
    if (!anyLive && !groupLive) {
      await repo.archiveContext(c.id, now); // 归档:保留 URL,清 chromeTabId/nativeGroupId
      archived.push(c.id);
    }
  }
  return archived;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test session-recovery && pnpm compile`
Expected: 6/6 PASS;tsc 无错

- [ ] **Step 5: 提交**

```bash
git add core/background/session-recovery.ts tests/session-recovery.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(bg): archiveUnrestoredContexts —— 归档 Chrome 未恢复的命名任务(保留 URL)

标签与原生分组都没恢复的活跃命名任务 → repo.archiveContext,可一键恢复。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 启动宽限窗口 + 会话恢复编排(SW 接线)

**Files:**
- Modify: `core/background/index.ts`(常量、`reconcileNow`、`initBackground` 的 alarm 监听 + 新增 `onStartup` 监听、新增 `runSessionRecovery`)

**Interfaces:**
- Consumes: `archiveUnrestoredContexts`(Task 1)、`reconcile`/`reconcileGroups`(已有 `opts`)。
- Produces:(无对外新接口;SW 冷启动的宽限窗口 + 会话恢复编排)

- [ ] **Step 1: 加常量**

`core/background/index.ts`:在 `const DISCARD_ALARM = 'discard-scan';`(约 26 行)之后加:
```ts
const RECOVERY_ALARM = 'session-recovery';
const GRACE_MS = 10_000; // 冷启动宽限:等 Chrome 恢复会话,期间对账不清删
```

- [ ] **Step 2: `reconcileNow` 宽限期不清删**

把 `reconcileNow`(约 79-86 行)替换为:
```ts
let lastReconcileAt = 0;
async function reconcileNow(force = false): Promise<void> {
  if (isSyncPaused()) return; // 收纳/恢复期间不对账,避免与同步锁内的批量增删打架
  const now = Date.now();
  if (!force && now - lastReconcileAt < 1200) return;
  lastReconcileAt = now;
  // 冷启动宽限期内:只重绑/重连、不清删(防止抢在会话恢复判定前把未恢复任务清掉)
  const { graceUntil } = await chrome.storage.session.get('graceUntil');
  const inGrace = typeof graceUntil === 'number' && Date.now() < graceUntil;
  await reconcile(repository, scheduleBroadcast, { purge: !inGrace });
  await reconcileGroups(repository, scheduleBroadcast, { prune: !inGrace });
}
```

- [ ] **Step 3: 新增 `runSessionRecovery`**

在 `reconcileNow` 之后新增(它用到 `archiveUnrestoredContexts`,见 Step 5 的 import):
```ts
/** 宽限结束(RECOVERY_ALARM):接住迟到的恢复 → 归档没恢复的命名任务 → 常规清理。 */
async function runSessionRecovery(): Promise<void> {
  await chrome.storage.session.remove('graceUntil'); // 先清标志:此后对账恢复清删
  await reconcile(repository, scheduleBroadcast, { purge: false });
  await reconcileGroups(repository, scheduleBroadcast, { prune: false });
  await archiveUnrestoredContexts(repository, Date.now());
  await reconcile(repository, scheduleBroadcast, { purge: true });
  await reconcileGroups(repository, scheduleBroadcast, { prune: true });
  scheduleBroadcast();
}
```

- [ ] **Step 4: `onStartup` 起宽限 + alarm 监听加分支**

`initBackground()` 里,把挂起扫描 alarm 监听(约 222-225 行)替换为:
```ts
  // 挂起扫描 alarm(F-11)+ 会话恢复 alarm(宽限结束)
  chrome.alarms?.onAlarm.addListener((a) => {
    if (a.name === DISCARD_ALARM) runScanNow();
    else if (a.name === RECOVERY_ALARM) void runSessionRecovery();
  });

  // 冷启动:进入宽限窗口(期间对账不清删),GRACE_MS 后跑会话恢复判定
  chrome.runtime.onStartup?.addListener(() => {
    void chrome.storage.session.set({ graceUntil: Date.now() + GRACE_MS });
    chrome.alarms?.create(RECOVERY_ALARM, { when: Date.now() + GRACE_MS });
  });
```

- [ ] **Step 5: 加 import**

`core/background/index.ts` 顶部,在 `import { runDiscardScan } from './discard-scan';` 之后加:
```ts
import { archiveUnrestoredContexts } from './session-recovery';
```

- [ ] **Step 6: 类型检查 + 全量 + 构建**

Run: `pnpm compile && pnpm test && pnpm build`
Expected: tsc 无错;全部测试 PASS(含 `session-recovery`);构建成功

- [ ] **Step 7: 手动验证(用户 Chrome;SW 接线无法单测)**

Chrome 设「启动时=打开新标签页」(即不恢复会话)→ 开几个标签归成任务 → ⌘Q 退出 → 重开 → 等约 10 秒 → 打开面板 → 那些任务应出现在**「已归档」**区,点「恢复」能重开。

- [ ] **Step 8: 提交**

```bash
git add core/background/index.ts
git commit -m "$(cat <<'EOF'
feat(bg): 冷启动宽限窗口 + 会话恢复(onStartup→10s 后归档未恢复任务)

onStartup 记 graceUntil 并起 RECOVERY_ALARM;宽限期 reconcileNow 不清删;
alarm 触发 runSessionRecovery:接住迟到恢复→archiveUnrestoredContexts→常规清理。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 自检(spec 覆盖)

- 归档判定核心 + 双条件 + 未分类/空任务不归档 + 归档后可恢复 → Task 1(`archiveUnrestoredContexts` + 6 测试)。
- 冷启动宽限窗口(onStartup + graceUntil + reconcileNow 抑制清删)→ Task 2 Step 2/4。
- 宽限结束编排(接迟到恢复→归档→常规清理)→ Task 2 Step 3(`runSessionRecovery`)+ alarm 分支。
- 复用 archiveContext / RESTORE_CONTEXT,不改其实现 → Task 1 用 `repo.archiveContext`;恢复走现有链路(Task 1 测试锁定)。
- 类型一致性:`archiveUnrestoredContexts(repo, now): Promise<string[]>` 在 Task 1 定义、Task 2 Step 3/5 调用与 import 一致;`graceUntil`(session storage)在 Step 2 读、Step 3 清、Step 4 写,键名一致;`RECOVERY_ALARM`/`GRACE_MS` 常量在 Step 1 定义、Step 3/4 用。
