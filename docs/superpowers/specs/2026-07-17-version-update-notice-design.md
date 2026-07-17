# 版本号展示 + 更新提示 — 设计

日期: 2026-07-17
状态: 已批准,待实现

## 背景

本扩展为本地自建/解压安装。用户 `git pull && pnpm build` 后重载,UI 无任何版本感知:
既看不到当前版本,也不知道更新是否生效。

## 目标

- 设置页展示当前版本(可自查)。
- 版本变化后首次打开面板,弹一个「已更新到 vX.Y.Z」轻提示。
- 纯本地、无网络;不入 SW 快照、不碰 DB。

## 非目标

- 不联网查上游新版(守「除 AI 外不联网」原则)。
- 不做 changelog / 「更新内容」。
- 首次安装不弹提示(无「从旧版更新」可言)。

## 方案

### 1. `shared/meta.ts`(扩展)
```ts
export const APP_NAME = 'Cairn Tabs';
export function appVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return ''; // 测试等无 chrome 环境
  }
}
```

### 2. 更新判定(纯函数,可单测)
`entrypoints/sidepanel/hooks/useUpdateNotice.ts`:
```ts
export function shouldNoticeUpdate(last: string | undefined, current: string): boolean {
  return typeof last === 'string' && !!current && last !== current;
}
```
- `last` 为存在的旧版本且与当前不同 → true(升级)。
- `last` 缺失(首次)、同版、当前空 → false。

### 3. hook
`useUpdateNotice(onUpdated: (version: string) => void)`:挂载时(一次)读
`chrome.storage.local` 的 `lastSeenVersion`;`shouldNoticeUpdate` 为真则 `onUpdated(version)`;
只要与当前不同就把当前版本写回(首次安装也静默写入,不触发提示)。异常走 logDebug。

### 4. 接入 `App.tsx`
`useUpdateNotice((v) => showFlash(t('update.updated', { version: v })))` —— 复用既有底部
toast(`aria-live`),无需新 UI。

### 5. 设置「关于」行 `SettingsPanel.tsx`
滚动内容底部加一行居中、淡色:
`{APP_NAME} v{appVersion()} · © {AUTHOR} · AGPL-3.0`
(proper noun + 版本 + 署名,无需 i18n)。

### 6. i18n(四语)
`update.updated`:`Updated to v{version}` / `已更新到 v{version}` /
`v{version} に更新しました` / `v{version}(으)로 업데이트되었습니다`。

## 测试

`tests/update-notice.test.ts`:`shouldNoticeUpdate` 四例(首次 undefined→false、同版→false、
升级→true、空当前→false)。

## 发版工作流(要点)

版本号来自 `package.json`(WXT 同步进 manifest)。发版前先 bump `package.json`,重建后用户
下次打开即见「已更新」。当前 1.0.0 为基线。

## 取舍

- `getManifest()` 在扩展上下文可用;测试无 chrome 时 `appVersion()` 返回空、`useUpdateNotice`
  catch 兜底,不崩。
- 更新判定放 UI 侧(比对 storage),规避 unpacked 重载时 `onInstalled` reason 的不确定性。
