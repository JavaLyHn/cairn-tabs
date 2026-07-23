# 命名任务直接 AI 改名 + 重复合并全局快捷键

日期:2026-07-18
状态:已确认(用户选定合并快捷键 = 全局命令 ⌘⇧D)

## 背景

1. **命名任务的 AI 改名藏得太深**:`ContextGroup` 里 AI 命名(✦ AI)只在「改名」编辑态出现
   (hover → 点「改名」→ 输入框旁才有 ✦ AI)。用户以为命名任务没有 AI 改名。
2. **重复合并没有快捷键**:`MERGE_DUPLICATES` 只能点 `StatsBar` 里的「合并」按钮(且仅有重复时出现)。

## 方案

### ① 命名任务的直接 AI 改名入口(`ContextGroup.tsx`)

在命名任务(`!isInbox`)的 hover 操作行,「改名」旁新增 **✦ AI** 按钮。
点击 = **进入编辑态 + 自动跑一次 AI 建议**,把建议名预填进输入框,用户回车确认或改后回车
(与现有编辑态内 ✦ AI 行为一致:只预填、不自动应用,安全可预览)。

- 显示条件:`!isInbox && aiEnabled && onAiSuggestName && tabs.length > 0`(要有标签可据以命名)。
- 实现:把编辑态里那段「跑 AI → 预填输入框」逻辑抽成 `runAiNaming()`;新增 `pendingAi` 状态,
  操作行按钮点击时 `setPendingAi(true); onStartEdit()`;`useEffect([editing])` 在进入编辑态且
  `pendingAi` 时调用 `runAiNaming()` 并复位;退出编辑态时复位 `pendingAi`。
- 复用现有 `onAiSuggestName` / `onAiCancel`,不改父层命令。

### ② 重复合并全局快捷键 ⌘⇧D(`wxt.config.ts` + `_locales` + `index.ts`)

- manifest 新增命令 `merge-duplicates`:`suggested_key` = `Ctrl+Shift+D` / `Command+Shift+D`,
  description `__MSG_cmdMergeDuplicates__`。
- `public/_locales/{en,zh_CN,ja,ko}/messages.json` 各加 `cmdMergeDuplicates`。
- SW `chrome.commands.onCommand` 增分支:`command === 'merge-duplicates'` →
  `void handleCommand({ type: 'MERGE_DUPLICATES' }, cmdCtx)`(cmdCtx 已含 reconcile,合并前会先对账)。
- 合并空跑无害(无重复时什么都不做),故快捷键可常驻;关闭重复标签本身即可见反馈,不强制开面板。
- 若 ⌘⇧D 与浏览器内置键冲突,Chrome 会忽略该建议键 → 用户可在 chrome://extensions/shortcuts 重绑。

## 不做(YAGNI)

- 不改 AI 改名为「一键直接应用」(保留预览确认,避免坏名覆盖手动名)。
- 合并快捷键不强制打开面板(轻量后台清理)。

## 测试

- `tests/context-group.test.tsx`:命名任务(active、非编辑态)hover 行出现 ✦ AI 按钮;
  inbox 不出现;点它触发 `onStartEdit`。
- 快捷键为 manifest + SW 布线,靠构建产物验证(manifest 含 merge-duplicates + 键位);
  合并逻辑本身已有 `MERGE_DUPLICATES` 测试覆盖。

## 验证

`tsc` / `oxlint` / `prettier` / `vitest` / `wxt build` 全绿;构建产物 manifest 含新命令与键位。
真机:命名任务 hover 点 ✦ AI → 预填建议名回车;按 ⌘⇧D → 重复标签被合并。
