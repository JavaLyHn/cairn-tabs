# 自定义中转站接入 + 连接测试 实现计划

> 设计见 `docs/superpowers/specs/2026-07-14-cairn-tabs-custom-relay-endpoint-design.md`。
> 改动跨层但同在一条 `baseUrl` 线上、强耦合 → **本会话内联实现**,按层提交。

**Goal:** AI 支持 OpenAI 兼容中转站(`custom` 档,可配 baseUrl)+ 测试连接即时反馈。

**Tech Stack:** WXT · React 19 · TS(strict, noUncheckedIndexedAccess)· Vitest。

## Global Constraints

- key 只在 SW 读,永不进 UI store / 广播 / 日志;`AIStatus` 不含 key。
- 发往中转站只含「标题 + eTLD+1 域名 + 任务名」,与官方档同一 prompt。
- `optional_host_permissions` 加 `https://*/*`;运行时按 baseUrl 的 origin 派生、带用户手势申请。
- OpenAI 兼容:`POST {baseUrl}/chat/completions` + `Authorization: Bearer`。

## 执行顺序(每步跑 `pnpm test` + `pnpm compile`)

### 提交 1:共享类型与协议 + provider(含测试)
- `shared/ai.ts`:`AIProviderId` 加 `custom`;`AIStatus.baseUrl?`;`friendlyAIError()`。
- `shared/messaging.ts`:`TEST_AI_CONNECTION` 命令;`SET_AI_SETTINGS.baseUrl?`;`AI_TEST_RESULT` 事件;`COMMAND_TYPES`。
- `core/ai/provider.ts`:`ChatRequest.baseUrl?`;抽 `postOpenAIChat`;`customProvider`;`normalizeBaseUrl`;`PROVIDERS.custom`。
- 测试:`tests/ai-provider.test.ts`(custom + normalize)、`tests/ai-friendly-error.test.ts`(新)。

### 提交 2:设置存储 + 命令 + SW 装配(含测试)
- `core/background/settings.ts`:`baseUrls`;`baseUrlFor`;`configured()` 对 custom 要 URL;`status().baseUrl`;`set(...,baseUrl?)`。
- `core/background/commands.ts`:`ai.set` 扩签;`ai.test`;`TEST_AI_CONNECTION` case;`SET_AI_SETTINGS` 透传 baseUrl。
- `core/background/index.ts`:`complete` 传 baseUrl;`set` 透传;`ai.test` 实现(15s 超时 + 计时 + friendlyAIError)。
- 测试:`tests/ai-settings.test.ts`(custom baseUrl / configured);命令测试 `TEST_AI_CONNECTION`。

### 提交 3:UI(store + App + 设置面板)
- `entrypoints/sidepanel/store.ts`:`ai` 默认加 `baseUrl`。
- `entrypoints/sidepanel/App.tsx`:`saveAi` 扩(custom origin 派生 + 校验);`testAi`;传 `onTestAi`。
- `entrypoints/sidepanel/components/SettingsPanel.tsx`:custom 档 + Base URL 输入 + 第三方提示 + 「测试连接」按钮 + 结果显示。

### 提交 4:manifest + README
- `wxt.config.ts`:`optional_host_permissions` 加 `https://*/*`。
- `README.md`:F-13 条目补充「自定义中转站 + 测试连接」。

## 验证
- `pnpm test`(全绿,新增用例通过)
- `pnpm compile`(tsc 无错)
- `pnpm build`(生产构建成功)
