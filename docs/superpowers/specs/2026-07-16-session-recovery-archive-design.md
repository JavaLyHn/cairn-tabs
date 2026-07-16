# 关浏览器后自动归档未恢复的任务(下次一键恢复)— 设计

日期:2026-07-16
状态:已通过设计评审,待写实现计划

## 背景与约束

用户诉求:关掉浏览器后,任务不要丢,下次能恢复。

硬约束:**MV3 Service Worker 收不到可靠的"浏览器正在关闭"事件**(`onSuspend` 不可靠、窗口极短;全量关闭时事件可能来不及派发)。所以无法"在关闭那一刻归档"。

已确认前提(真机诊断):当 Chrome 的「启动时」不是「继续浏览上次打开的网页」时,关掉所有窗口后**标签不会被恢复**(`chrome.tabs.query` 只剩新标签页、`chrome.tabGroups.query` 为空)。此时任务的标签是真没了,而任务数据(含 URL)仍在 IndexedDB。

## 目标(已确认:自动归档 + 一键恢复)

下次浏览器启动时,对 Chrome **没有恢复回来**的活跃命名任务:自动**归档**(保留 URL),它们出现在面板「已归档」区;用户点现有的「恢复」即按 URL 限速重开标签、任务变回活跃。完全复用现有归档/恢复,无新 UI。

## 选型

**冷启动"宽限窗口" + 窗口结束时做一次"会话恢复判定"。** 因为会话恢复是异步的,启动瞬间无法区分"没恢复"与"还没恢复完",故等一小段时间(默认 10 秒)让 Chrome 恢复完,期间对账不清删;窗口结束再判定并归档。复用 `repo.archiveContext`。不引入 onSuspend 之类的不可靠关闭钩子。

## 组件

### 1. 启动宽限窗口(`core/background/index.ts`)

- 常量:`const GRACE_MS = 10_000;` `const RECOVERY_ALARM = 'session-recovery';`
- `initBackground()` 注册 `chrome.runtime.onStartup` 监听:
  ```ts
  chrome.runtime.onStartup?.addListener(() => {
    void chrome.storage.session.set({ graceUntil: Date.now() + GRACE_MS });
    chrome.alarms?.create(RECOVERY_ALARM, { when: Date.now() + GRACE_MS });
  });
  ```
  说明:`onStartup` 仅在浏览器**真正启动**时触发(SW 空闲后被唤醒不会触发),是"本次是冷启动"的判别。`graceUntil` 存 `chrome.storage.session`(关浏览器即清,天然按会话隔离,且能跨 SW 重启存活)。
- `chrome.alarms.onAlarm` 增分支:`if (a.name === RECOVERY_ALARM) void runSessionRecovery();`

### 2. 宽限期内对账不清删(`core/background/index.ts` `reconcileNow`)

`reconcileNow` 改为读宽限标志决定是否清删:
```ts
async function reconcileNow(force = false): Promise<void> {
  if (isSyncPaused()) return;
  const now = Date.now();
  if (!force && now - lastReconcileAt < 1200) return;
  lastReconcileAt = now;
  const { graceUntil } = await chrome.storage.session.get('graceUntil');
  const inGrace = typeof graceUntil === 'number' && Date.now() < graceUntil;
  await reconcile(repository, scheduleBroadcast, { purge: !inGrace });
  await reconcileGroups(repository, scheduleBroadcast, { prune: !inGrace });
}
```
效果:宽限期内即使用户打开面板触发对账,也只重绑/重连、不清删 —— 防止抢在归档判定前把未恢复的任务清掉。`hydrate` 仍用 `{purge:false}`/`{prune:false}`(不变)。

### 3a. 归档判定核心(**新模块** `core/background/session-recovery.ts`,可单测)

把"归档 Chrome 没恢复回来的活跃命名任务"抽成独立可测函数(与 `reconcile`/`reconcileGroups` 同风格,读 chrome.* + 写 repo):
```ts
import type { Repository } from '../store/repositories';
import { INBOX_ID } from '@/shared/types';

/**
 * 归档「Chrome 没恢复回来」的活跃命名任务(浏览器重启后标签/分组都没回来 = 真丢了)。
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

**判定用双条件**(`!anyLive && !groupLive`):
- `anyLive` 必须按**实时标签 id 集合**判断(不能只看 `chromeTabId != null` —— 未恢复的死记录 chromeTabId 仍是个旧数字,非 null)。
- 加 `groupLive`(原生分组是否还在)是二重保险:若 Chrome 恢复慢、分组已回但标签还在加载,则不归档(等标签)。

### 3b. 编排(`core/background/index.ts` 新增 `runSessionRecovery`)

宽限结束(alarm 触发)时:
```ts
async function runSessionRecovery(): Promise<void> {
  await chrome.storage.session.remove('graceUntil'); // 先清标志:此后对账恢复清删
  // 1) 接住 Chrome 姗姗来迟恢复的标签/分组(非破坏)
  await reconcile(repository, scheduleBroadcast, { purge: false });
  await reconcileGroups(repository, scheduleBroadcast, { prune: false });
  // 2) 归档 Chrome 没恢复回来的活跃命名任务
  await archiveUnrestoredContexts(repository, Date.now());
  // 3) 常规清理(清掉未恢复的未分类零散标签等)
  await reconcile(repository, scheduleBroadcast, { purge: true });
  await reconcileGroups(repository, scheduleBroadcast, { prune: true });
  scheduleBroadcast();
}
```
`index.ts` 顶部 import 增补 `import { archiveUnrestoredContexts } from './session-recovery';`。

### 4. 恢复(复用现有,无改动)

自动归档的任务进入面板「已归档」区。用户点现有「恢复」→ `RESTORE_CONTEXT` → `restoreContext` 按 URL 限速重开标签、重建原生分组、任务转回活跃。auto-archive 的任务是真正的命名任务(不设 `restoreTo`),恢复后仍是原命名任务。

## 数据流

关浏览器(Chrome 未开会话恢复 → 标签真丢)→ 重开 → `onStartup` 记 `graceUntil`+起 alarm → 10s 内对账不清删 → alarm 触发 `runSessionRecovery`:Chrome 没恢复这些标签 → 双条件命中 → 命名任务被 `archiveContext` 归档(URL 保留)→ 面板「已归档」可见 → 用户点「恢复」重开。
(若 Chrome 开了会话恢复:标签/分组被恢复 → 重绑/重连接住 → `anyLive`/`groupLive` 为真 → 不归档。两条路互补。)

## 边界与决策

- **仅 `onStartup` 触发**:会话中手动关任务标签仍是原行为,不受影响。
- **未分类零散标签**:未恢复时按现状清理,**不保留**(它是临时暂存区,不算命名任务)。
- **部分恢复**:任务只要有一个标签恢复(`anyLive`)就保持活跃,未恢复的少数死记录由常规清理清掉(任务存活、丢少量标签)。整任务全丢才归档。
- **恢复慢**:双条件 + 10s 宽限降低误归档;极端慢(>10s 且分组也没先回)可能误归档,但已归档可一键恢复,无数据损失。
- **幂等**:`archiveContext` 对已归档任务是 no-op;`runSessionRecovery` 每次启动至多跑一轮(alarm 一次)。

## 测试(`tests/session-recovery.integration.test.ts`,新建;FakeChrome + Repository,直接调 `archiveUnrestoredContexts`)

- **归档未恢复的命名任务**:建命名任务(带原生分组 + 2 标签、其一 starred)→ 模拟"标签与分组都没恢复"(清空 `fake.tabsById`/`fake.groupsById`)→ `archiveUnrestoredContexts(repo, now)` → 该任务 status=`archived`、其标签 chromeTabId 清空、**URL 与 starred 保留**;返回值含该 contextId。
- **有存活标签 → 不归档**:任务的一个标签 id 仍在 `fake.tabsById` → 该任务保持 `active`,不在返回值里。
- **原生分组还在 → 不归档**:标签都没恢复但分组仍在 `fake.groupsById`(id 匹配 nativeGroupId)→ 保持 `active`(等标签加载)。
- **未分类不归档**:INBOX 的零散标签没恢复 → `archiveUnrestoredContexts` 不碰 INBOX(交给常规 reconcile 清理)。
- **空任务不归档**:tabOrder 为空的活跃任务 → 跳过(交给常规清理),不进返回值。
- **归档后可恢复**(回归锁定):对被归档任务发 `RESTORE_CONTEXT` → 任务转回 `active`(复用现有链路)。
- **宽限期抑制清删**(index.ts inGrace 分支):这部分是 SW 装配,难单测;以 `pnpm compile` + `pnpm build` + 手动验证覆盖(reconcileNow 读 `graceUntil` 决定 purge/prune)。

## 不做(YAGNI)

- 不引入 onSuspend / windows.onRemoved 之类的关闭钩子(不可靠)。
- 不做未分类零散标签的自动保留。
- 不做自动重开标签(用户点「恢复」才开)。
- 不改归档/恢复的既有实现,只复用。
