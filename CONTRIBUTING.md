# 贡献指南

感谢参与 Cairn Tabs。这份文档说明如何搭环境、遵循的架构约束、以及提交规范。

## 环境与常用命令

需要 Node ≥ 20 与 pnpm ≥ 10。

```bash
pnpm install     # 安装依赖(会自动 wxt prepare 生成类型)
pnpm dev         # 启动 dev server,自动打开带插件的 Chrome(HMR)
pnpm build       # 生产构建到 .output/chrome-mv3
pnpm compile     # 类型检查:tsc --noEmit
pnpm test        # Vitest 全量
pnpm test:watch  # Vitest watch
```

手动加载:`chrome://extensions` → 开发者模式 → 加载 `.output/chrome-mv3`(dev 模式为 `.output/chrome-mv3-dev`)。

提 PR 前请确保 `pnpm compile` 与 `pnpm test` 均通过。

## 架构约束(务必遵守)

这些不是风格建议,是正确性红线(违反会导致数据竞态,参见 `tests/sync.integration.test.ts` 复现的幻影记录 bug):

1. **Service Worker 是唯一写入方**。UI 只发 `Command`、订阅 `STATE_SNAPSHOT`,永不直接写存储。
2. **所有 DB 读写只经 `core/store/repositories.ts`**,不要在别处直接碰 Dexie。
3. **任何自发的 `chrome.tabs.*` / `chrome.tabGroups.*` 变更都必须持同步锁**(`core/background/sync-lock.ts` 的 `pauseSync`/`withSyncPaused`),否则我们自己触发的事件会回灌成重复/幻影记录。
4. **入站事件处理要幂等**,并考虑 SW 随时休眠:内存态不是事实来源,靠 `hydrate()` + `reconcile()` 从存储/真实标签重建。
5. **聚簇/归属逻辑放 `core/`**,与 UI 无关、必须可单测。

目录职责见 [README](./README.md#目录结构)。

## 分层与可测试性

按关注点拆分小而聚焦的单元,通过明确的接口通信,能独立理解与测试。领域逻辑(store / clustering / search)不依赖 chrome API;涉及 chrome 的用 `tests/fake-chrome.ts` 做集成测试。

## 提交规范

- 使用 [Conventional Commits](https://www.conventionalcommits.org/):`feat(scope): …`、`fix: …`、`docs: …`、`test: …`、`chore: …`、`refactor: …`。
- 一个提交只做一件内聚的事;bug 修复请附带能复现的失败测试。
- 中文或英文均可,与现有历史保持一致即可。

## 提 Bug / 调试

遵循「先定位根因再改」:读报错、稳定复现、写下最小失败用例,再动手。修复应针对根因而非症状。

## 许可证

本项目采用 **AGPL-3.0-only**。提交贡献即表示你同意你的贡献在同协议下发布。注意:基于本项目的衍生作品(包括通过网络提供服务的形式)也必须以 AGPL-3.0 开源。
