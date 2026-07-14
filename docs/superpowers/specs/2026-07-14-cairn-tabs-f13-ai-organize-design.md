# F-13 · AI 整理未分类(BYO Key)设计

> 日期:2026-07-14 · 状态:已通过设计评审,待实现
> 对应 PRD:`tabctx-prd-tech-spec.md` §2.1 US-10 / §6.3 / §7.6 / §2.3

## 1. 目标与范围

给「未分类」里堆积的零散标签一键 AI 整理:AI 读取标签的**标题 + 域名**与用户**已有任务名**,
提议把零散标签分成新的命名任务、或并入已有任务;用户在预览里确认/编辑后才真正生效。

这是本项目第一个会发起网络请求的功能。核心约束:

- **默认关闭**,必须用户显式配置 API key 才可用(PRD §2.3)。
- **BYO Key**:用户自带 Anthropic / OpenAI 的 key,请求**直连官方 API**,不经任何中转。
- **数据最小化**:仅发送标签标题 + eTLD+1 域名 + 任务名;绝不发送完整 URL、query、页面内容。
- **不盲信 AI**:AI 只产出"提案",应用前 DB 零改动;解析失败静默降级(不改数据)。

### 明确不做(YAGNI)
- 不做 Gemini(第一版只 Anthropic + OpenAI;Provider 接口已为扩展留位)。
- 不做后台自动调用(仅手动触发,一次一请求,PRD §7.6)。
- 不做流式输出、不做多轮对话、不做提案落库草稿。
- 不设单独的 enabled 开关:某 provider 存了 key 即视为该 provider 已启用。

## 2. 架构:SW 全包,UI 只预览确认

沿用现有铁律「Service Worker 是唯一写入方」。API key 全程只在 SW 读、**不进 UI 上下文**。

```
①未分类头部「✦ AI 整理」          → UI 发 AI_ORGANIZE_INBOX(请求/响应式,同 SEARCH)
②SW: 收集 [零散标签 id+标题+域名] + [已有活跃任务 id+名字]
     → buildOrganizePrompt → provider.complete(req, key)
     → parseOrganizeResponse(校验 id 合法 / 去重 / 失败→null)
     → 返回 AI_PLAN(或 AI_ERROR)给 UI,不写库
③UI: 弹 AIPlanDialog 预览;用户编辑组名 / 逐项取消 / 逐组取消
④用户「应用」                       → UI 发 APPLY_AI_PLAN(编辑后的最终方案)
⑤SW: 建新任务 / 移动标签(复用 repo.moveTab + pinTab + ensureTabInContextGroup,
     与手动拖拽同一套)→ 广播 STATE_SNAPSHOT
```

两段式(提案 → 确认应用)让"预览确认"天然满足不盲信 + 失败静默降级:任何失败都停在第 ②步,DB 不动。

## 3. 组件与接口

### 3.1 `core/ai/provider.ts` —— HTTP + 鉴权差异
```ts
export interface ChatRequest {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  signal?: AbortSignal;
}
export interface AIProvider {
  id: 'anthropic' | 'openai';
  defaultModel: string;
  host: string; // 用于 optional host permission 申请
  complete(req: ChatRequest, key: string, fetchImpl?: typeof fetch): Promise<string>;
}
export const PROVIDERS: Record<'anthropic' | 'openai', AIProvider>;
```
- `anthropicProvider`:`POST https://api.anthropic.com/v1/messages`;头 `x-api-key`、`anthropic-version: 2023-06-01`、`anthropic-dangerous-direct-browser-access: true`;默认模型 `claude-haiku-4-5`。取 `content[0].text`。
- `openaiProvider`:`POST https://api.openai.com/v1/chat/completions`;头 `Authorization: Bearer <key>`;默认模型 `gpt-4o-mini`。取 `choices[0].message.content`。
- `fetchImpl` 参数可注入,便于单测;默认用全局 `fetch`。
- 非 2xx → 抛错(带状态码);超时由调用方传入 `AbortSignal`(30s)。

### 3.2 `core/ai/organize.ts` —— provider 无关的纯逻辑(重点单测)
```ts
export function buildOrganizePrompt(
  tabs: { id: string; title: string; domain: string }[],
  tasks: { id: string; name: string }[],
): { system: string; user: string };

export function parseOrganizeResponse(
  raw: string,
  validTabIds: Set<string>,
  validTaskIds: Set<string>,
): AIPlan | null;
```
- prompt:系统说明「为程序员把浏览器标签按任务归类」;输入零散标签(id/标题/域名)+ 已有任务(id/名字);
  要求**只输出严格 JSON**;保守——拿不准就别放(留在未分类);明显相关优先并入已有任务;
  新组名简短(≤ ~16 字)、语言随标题;不要任何散文。
- parse:去 ```` ```json ```` 代码围栏 → `JSON.parse` → 逐项校验 tabId ∈ validTabIds、taskId ∈ validTaskIds、
  一个标签至多出现一处(去重)、丢弃非法项;整体解析失败或空结果返回 `null`。

### 3.3 `shared/ai.ts` —— UI/SW 共用类型
```ts
export interface AIPlan {
  newGroups: { name: string; tabIds: string[] }[];
  assign: { taskId: string; tabIds: string[] }[];
}
export interface AIStatus { // 脱敏,随快照广播;永不含 key
  provider: 'anthropic' | 'openai';
  hasKey: boolean;
  model: string;
}
export type AIErrorReason = 'no_key' | 'permission' | 'network' | 'parse' | 'empty';
```

### 3.4 `core/background/settings.ts` —— `AISettingsStore`
存 `storage.local`(本地、卸载即清):
`{ provider, keys: { anthropic?, openai? }, models: { anthropic?, openai? } }`。
key 与 model **均按 provider 分别存**,避免切换 provider 时把 Claude 的模型名误用到 OpenAI。
- `configured()`:当前 provider 是否已存 key。
- `effectiveModel()`:`models[provider] ?? PROVIDERS[provider].defaultModel`。
- `status()`:返回脱敏 `AIStatus`(hasKey = 当前 provider 有 key,model = effectiveModel)。
- `keyFor(provider)`:仅 SW 内部取 key。
- key 明文存 `storage.local`——BYO-key 扩展的通行做法,PRD §5.3 接受(本地、不上传、卸载清除)。

## 4. 消息协议(`shared/messaging.ts`)

Command 新增:
- `AI_ORGANIZE_INBOX` → 返回 `AI_PLAN`(含 plan + 供预览的标签快照)或 `AI_ERROR`。
- `APPLY_AI_PLAN; plan: AIPlan` → void + 广播。
- `SET_AI_SETTINGS; provider; key?; model?` → 设为当前 provider,并按需写该 provider 的 key/模型,广播脱敏状态。

Event 新增:
- `AI_PLAN; plan: AIPlan; tabs: TabRecord[]`(tabs 供对话框渲染 favicon/标题)。
- `AI_ERROR; reason: AIErrorReason`。
- `STATE_SNAPSHOT` 增加 `ai: AIStatus`。

## 5. 权限与隐私

- `wxt.config.ts` 加 `optional_host_permissions: ["https://api.anthropic.com/*", "https://api.openai.com/*"]`。
  **默认不申请** → 默认安装零网络、无额外权限告警。
- 用户在设置里保存 key 时,UI 在用户手势内调用
  `chrome.permissions.request({ origins: [该 provider 的 host] })`;授权成功才发 `SET_AI_SETTINGS`。
- 无需自定义 CSP:MV3 扩展默认 CSP 不限制 `connect-src`,拿到 host 权限后 SW `fetch` 不受 CORS 限制。
- 隐私声明(写入设置页/README):AI 默认关闭;开启后仅把标签标题 + 域名 + 你的任务名发给你选的
  provider、用你的 key、直连官方;绝不发送完整 URL / query / 页面内容;key 只存本机。

## 6. 预览 UI(`entrypoints/sidepanel/components/AIPlanDialog.tsx`)

- 触发:未分类头部「✦ AI 整理」按钮(accent 色 = AI 入口,PRD §3.4);仅当 `ai.hasKey` 时显示。
- 状态机:加载中(转圈「AI 分析中…」)→ 成功(渲染 plan)/ 错误(文案)。
- 成功态:
  - 「新建任务」区:每个提议组 = 可编辑名字输入 + 标签行列表(favicon+标题)+ 逐标签移除 + 整组取消。
  - 「并入已有任务 X」区:任务名 + 待并入标签列表 + 逐项/整组取消。
- 底部:取消 / 应用。应用时从当前(编辑后)状态构造最终 `AIPlan` 派发 `APPLY_AI_PLAN`。
- 错误文案:`no_key`→"去设置里填 API key"(带跳转);`permission`→"未授权访问 API 域名";
  `network`→"调用失败,请稍后重试";`parse`/`empty`→"AI 没能给出可用的分组建议,已保持原样"。

## 7. 错误处理(一律不改数据)

| 场景 | 处理 |
|---|---|
| 未配置 key | 返回 `AI_ERROR: no_key`,UI 引导去设置 |
| host 权限被拒 | UI 侧在请求权限时即失败,提示,不发命令 |
| 网络错误 / 非 2xx / 超时(30s) | 返回 `AI_ERROR: network`,无改动 |
| JSON 解析失败 / 空结果 | 返回 `AI_ERROR: parse` / `empty`,无改动 |
| 应用时某 tab 已被关闭/移动 | `moveTab` 对不存在记录 no-op,跳过 |

## 8. 测试

- `tests/ai-organize.test.ts`:`buildOrganizePrompt`(含关键字段)+ `parseOrganizeResponse`
  (正常、代码围栏、非法/未知 id 丢弃、去重、解析失败→null、空→null)。
- `tests/ai-provider.test.ts`:注入假 fetch,验证 anthropic/openai 请求 URL/头/体塑形正确、
  从各自响应体取出文本、非 2xx 抛错。
- `tests/ai-apply.integration.test.ts`:fake-chrome + repo,`APPLY_AI_PLAN` 建新任务、
  把标签移入新组与已有任务、忽略非法 id、移动后建原生分组。

## 9. 文件清单

**新增**
- `core/ai/provider.ts`、`core/ai/organize.ts`
- `shared/ai.ts`
- `entrypoints/sidepanel/components/AIPlanDialog.tsx`
- `tests/ai-organize.test.ts`、`tests/ai-provider.test.ts`、`tests/ai-apply.integration.test.ts`

**修改**
- `shared/messaging.ts`(命令/事件/快照 ai 状态)
- `core/background/settings.ts`(`AISettingsStore`)
- `core/background/commands.ts`(`AI_ORGANIZE_INBOX` / `APPLY_AI_PLAN` / `SET_AI_SETTINGS`)
- `core/background/index.ts`(装配 AISettingsStore、广播 ai 状态、cmdCtx.ai)
- `entrypoints/sidepanel/store.ts`(ai 状态)
- `entrypoints/sidepanel/App.tsx`(未分类 AI 按钮、对话框、保存 key 时请求权限)
- `entrypoints/sidepanel/components/SettingsPanel.tsx`(AI 设置区)
- `wxt.config.ts`(`optional_host_permissions`)
- `README.md`(F-13 状态 + 隐私声明)
