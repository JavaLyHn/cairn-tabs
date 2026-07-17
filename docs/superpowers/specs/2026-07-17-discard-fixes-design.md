# 自动休眠(F-11)三处修复

日期:2026-07-17
状态:已确认(用户报告 bug,选定扫描节奏「跟阈值自适应」)

## 背景

用户反馈:设了休眠时间后,「有些达到休眠时间的页面并没有休眠」。经确认症状有三:
① 晚几分钟才睡;② 显示💤但其实没睡;③ 普通后台页永远不真睡。

## 根因

- **② + ③ 同源(乐观标记)**:`discard-scan.ts` 调 `chrome.tabs.discard` 后**无论是否真正卸载**都把记录
  标成 `discarded:true`。若 Chrome 拒绝(返回空 / `discarded:false`,如页面有未保存输入、媒体占用等),
  UI 显示💤(②),而 `shouldDiscard` 见 `discarded:true` 便**再不重试**(③)。一次失败 = 永久假睡。
- **① 扫描节奏**:alarm 固定 `periodInMinutes: 5`,与阈值无关。阈值设 5 分钟时,到点还要等下一次
  5 分钟扫描 → 实际可能 ~10 分钟才睡。
- **③ 隐患(SW 被杀)**:`onAlarm` 回调里 `runScanNow()` 发射后不管(不 await、不 return promise),
  MV3 中 SW 可能在扫描跑完前被终止 → 一轮只挂起前几个标签。

## 休眠 vs 归档(用户另问,记录备查)

休眠 = `chrome.tabs.discard` 卸载内存、标签仍在原位、点击自动重载、`chromeTabId`/所属任务不变;
归档 = 关闭标签、清 `chromeTabId`、任务转 archived。两者完全不同。

## 修复

1. **只在真正卸载成功才标 `discarded`**(`core/background/discard-scan.ts`):
   `const t = await chrome.tabs.discard(...)`;仅当 `t?.discarded` 为真才 `updateTab({discarded:true, ...})`
   并计数;否则 `logDebug` 不标记,下轮自动重试。→ 根治 ②③。
2. **扫描周期跟阈值自适应**(`shared/discard.ts` 新增纯函数 `discardScanPeriodMinutes`):
   `clamp(round(阈值/5), 1, 5)` 分钟(5 分钟→1;≥25 分钟→封顶 5)。
   `index.ts` 的 `ensureDiscardAlarm` 用它算 `periodInMinutes`;
   `commands.ts` 的 `SET_DISCARD_AFTER_MINUTES` 改阈值后调 `onAutoDiscardChanged(当前开关)` 按新周期重注册。→ 治 ①。
3. **alarm 回调 await 扫描**(`index.ts`):`runScanNow` 返回 `Promise<number>`;`onAlarm` 回调改 `async`
   并 `await runScanNow()` / `await runSessionRecovery()`,保活 SW 至扫描完成。→ 兜底 ③。

## 不做(YAGNI)

- 不改 `shouldDiscard` 的跳过项(active / audible / pinned / starred / localhost 均为有意设计)。
- 不做「到点精确一次性 alarm」(周期自适应已够;复杂度不划算)。

## 测试

- `tests/discard.test.ts`:`discardScanPeriodMinutes` 自适应 + 边界(NaN→5,0→1)。
- `tests/memory.integration.test.ts`:`chrome.tabs.discard` 返回空(spy)→ `n===0`、记录 **不** 标 `discarded`、
  标签仍在内存(留待重试)。

## 验证

`tsc` / `oxlint` / `prettier` / `vitest`(应 +4)/ `wxt build` 全绿。
真机:开自动休眠、阈值设 5 分钟 → 切走一个普通页 → ~5–6 分钟内应显示💤且真正卸载(点开会重载);
被 Chrome 拒绝的页不会假睡、下轮重试。
