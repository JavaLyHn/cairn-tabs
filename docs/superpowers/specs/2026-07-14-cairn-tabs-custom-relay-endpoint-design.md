# 自定义中转站接入 + 连接测试 设计文档

> F-13(AI 整理未分类)的扩展。日期:2026-07-14。

## 目标

让 AI 功能支持**非官方中转站**(OpenAI 兼容),并提供**测试连接**让用户即时感知配置是否可用。

## 背景

F-13 把 endpoint URL 写死在 `anthropic` / `openai` 两个 provider 里,`optional_host_permissions` 也钉死官方两个域名。用户需要接入自建/第三方中转站(如 `https://newapi.elevatesphere.com/v1`,new-api 类,OpenAI 兼容),并希望在配置后能一键验证连通性。

## 决策(已与用户确认)

1. **接口格式**:OpenAI 兼容(`POST {baseUrl}/chat/completions`,`Authorization: Bearer`)。
2. **配置入口**:新增「自定义中转站」为第三个 provider 档(`custom`),官方两档不变。
3. **新增测试连接**:一次极小请求验证连通,反馈翻成人话。

## 隐私边界(不变,继承自 F-13)

- 发往中转站的仍**只有**「标签标题 + eTLD+1 域名 + 任务名」——与官方档完全相同的 prompt,只是目的地不同。**绝不发**完整 URL / query / 页面内容。
- API key **只在 SW 读**,永不进 UI store / 广播 / 日志。`AIStatus` 依旧不含 key。
- baseUrl **不是机密**,可随 `AIStatus` 广播给 UI(用于设置面板回填「当前中转站地址」)。
- 中转站是第三方,数据会经过它——UI 在选中 custom 时明确提示「请用你信任的中转站」。

## 权限权衡(唯一的安全面变化)

中转站 URL 任意,Chrome 运行时申请任意 host 需要 manifest 的 `optional_host_permissions` 覆盖到该 host。因此:

- `optional_host_permissions` 加入 `https://*/*`。
- 这是 **optional** 权限:安装时**不授予**;真正生效时仍是一次**带用户手势**、只针对用户所填域名(如 `https://newapi.elevatesphere.com/*`,由 baseUrl 的 origin 派生)的 Chrome 授权弹窗。官方两档的授权路径不受影响。

## 组件设计

### 类型 / 协议(`shared/ai.ts`, `shared/messaging.ts`)

- `AIProviderId = 'anthropic' | 'openai' | 'custom'`。
- `AIStatus` 增加 `baseUrl?: string`(非机密)。
- 新增纯函数 `friendlyAIError(message: string): string`:把底层错误(状态码 / abort / 网络)翻成中文人话。
  - `401/403` → `认证失败(NNN)—— 检查 API key`
  - `404` → `地址或模型不存在(404)—— 检查接口地址与模型名`
  - `429` → `被限流(429)—— 稍后再试`
  - `5xx` → `服务端错误(NNN)`
  - 含 `abort` → `连接超时`
  - 含 `no text` / `parse` → `响应格式异常(可能不是兼容接口)`
  - 含 `failed to fetch` / `network` → `网络错误 —— 检查地址是否可达`
  - 其它 → 原文
- `Command` 增加 `{ type: 'TEST_AI_CONNECTION' }`;`SET_AI_SETTINGS` 增加 `baseUrl?: string`。
- `Event` 增加 `{ type: 'AI_TEST_RESULT'; ok: boolean; detail: string }`。
- `COMMAND_TYPES` 加入 `TEST_AI_CONNECTION`。

### Provider 层(`core/ai/provider.ts`)

- `ChatRequest` 增加 `baseUrl?: string`。
- 抽出共享内部函数 `postOpenAIChat(url, req, key, fetchImpl, label)`:OpenAI 兼容的请求塑形 + 取文本,非 2xx 抛 `Error('{label} {status}')`。
- `openaiProvider.complete` 复用它,url 固定 `https://api.openai.com/v1/chat/completions`,label `openai`。
- 新增 `customProvider`:
  - `id: 'custom'`,`defaultModel: 'gpt-4o-mini'`(占位;用户应自填),`host: 'https://*/*'`。
  - `complete`:`baseUrl` 缺失 → 抛 `Error('custom: no baseUrl')`;否则 url = `normalizeBaseUrl(baseUrl) + '/chat/completions'`,label `custom`。
- 导出纯函数 `normalizeBaseUrl(url): string`:去掉尾部斜杠(`.../v1/` → `.../v1`)。
- `PROVIDERS` 加入 `custom`。

### 设置存储(`core/background/settings.ts`)

- `AIData` 增加 `baseUrls: Partial<Record<AIProviderId, string>>`。
- `load()` 默认 `baseUrls: saved.baseUrls ?? {}`。
- 新增 `baseUrlFor(p = provider): string | undefined`。
- `configured()`:`!!keyFor() && (provider !== 'custom' || !!baseUrlFor())`——custom 没填 URL 视为未配置(「✦ AI 整理」按钮不出现)。
- `status()` 增加 `baseUrl: this.baseUrlFor()`。
- `set(provider, key?, model?, baseUrl?)`:baseUrl 与 model 同样处理(trim;有值则存,空串则删)。

### 命令处理(`core/background/commands.ts`)

- `CommandContext.ai` 增加:
  - `set(provider, key?, model?, baseUrl?)`(签名扩展)。
  - `test(): Promise<{ ok: boolean; detail: string }>`。
- `SET_AI_SETTINGS`:`ctx.ai?.set(cmd.provider, cmd.key, cmd.model, cmd.baseUrl)`。
- 新增 `TEST_AI_CONNECTION`:未配置 → `{ type:'AI_TEST_RESULT', ok:false, detail:'未配置 key' }`;否则 `const r = await ctx.ai.test(); return { type:'AI_TEST_RESULT', ...r }`。
- `AI_ORGANIZE_INBOX` 不变(`complete` 内部读 baseUrl,签名不变)。

### SW 装配(`core/background/index.ts`)

- `ai.complete` 传 `baseUrl: aiSettings.baseUrlFor()` 进 `ChatRequest`。
- `ai.set` 透传 baseUrl。
- 新增 `ai.test`:读 provider/key/model/baseUrl,15s 超时,`Date.now()` 计时,调 `PROVIDERS[p].complete({system:'连接测试。', user:'仅回复 OK。', maxTokens:8, model, baseUrl, signal})`;成功返回 `{ ok:true, detail:'连接成功 · {model} · {ms}ms' }`,失败返回 `{ ok:false, detail: friendlyAIError(err.message) }`。

### UI store(`entrypoints/sidepanel/store.ts`)

- `ai` 默认值增加 `baseUrl: undefined`。

### App 接线(`entrypoints/sidepanel/App.tsx`)

- `saveAi(provider, key, model, baseUrl)`:custom 时校验 `baseUrl` 是合法 https URL,权限 origin 由 `new URL(baseUrl).origin + '/*'` 派生;非 custom 用 `PROVIDERS[provider].host`。请求权限、未授权抛错、`dispatch(SET_AI_SETTINGS)` 带 baseUrl。
- 新增 `testAi(): Promise<{ ok:boolean; detail:string }>`:`dispatch({type:'TEST_AI_CONNECTION'})`,返回 `AI_TEST_RESULT` 的 `{ok, detail}`(非该事件则返回失败兜底)。
- `SettingsPanel` 传入 `onSaveAi`(扩展)与 `onTestAi`。

### 设置面板(`entrypoints/sidepanel/components/SettingsPanel.tsx`)

- provider 切换加「自定义中转站」(custom)。
- 选中 custom 时:
  - 显示「接口地址 (Base URL)」输入框,占位 `https://newapi.elevatesphere.com/v1`,从 `ai.baseUrl` 预填。
  - 显示第三方提示。
  - 「保存并启用」在 `!key.trim() || !baseUrl.trim()` 时禁用。
- 新增「测试连接」按钮(与「保存并启用」并排):
  - 点击:若 `key.trim()` 非空,先 `onSave(...)`(持久化 + 权限);再 `onTest()`。
  - 期间显示「测试中…」,结束显示 `✓ {detail}`(绿)或 `✗ {detail}`(红)。

## 测试

- `tests/ai-provider.test.ts`:`customProvider` 用 baseUrl 组 url + Bearer;尾斜杠归一;缺 baseUrl 抛错;非 2xx 抛错。`normalizeBaseUrl` 单测。`PROVIDERS.custom.defaultModel`。
- `tests/ai-settings.test.ts`:custom 的 baseUrl 存取/持久化;custom 有 key 无 URL → `configured()===false`;有 URL → true;`status()` 含 baseUrl 且不含 key。
- `tests/ai-friendly-error.test.ts`(新):`friendlyAIError` 各分支映射。
- `tests/ai-apply.integration.test.ts` 或命令测试:`TEST_AI_CONNECTION` 未配置返回 `ok:false`;配置 + 假 `ai.test` 返回 `ok:true`。

## 非目标(YAGNI)

- 不做 Anthropic 兼容的中转站(URL 以 `/v1` 结尾,统一走 OpenAI 兼容)。
- 不做多中转站配置管理(单一 baseUrl 足矣)。
- 不做流式响应。
