# 多份 AI 配置 + 自由切换

## Context(为什么)

用户诉求:「配置完以后不显示模型,而且只能配置一个 —— 请设计成能不限次数配置,然后自由选择用哪一个配置的 LLM。」

现状两个问题:

1. **看不到用的是哪个模型**。设置里「当前:自定义中转站 已配置」只显示服务商,不含模型名;编辑表单的「模型」输入框初始恒为空串、从不回填已存模型。其实 `AIStatus.model` 有广播,只是 UI 没展示。
2. **实际只能配一个**。`AISettingsStore` 是「每种服务商各一个槽」(`keys/models/baseUrls: Partial<Record<AIProviderId,string>>`),且同时只有一个 `provider` 生效。没法存多个中转站、多个模型,更没法自由挑。

已定决策(AskUserQuestion):切换入口 = **只在设置里切换**(最小改动;不做主面板快速下拉)。

## 方案

### 1. 数据模型 —— `core/background/settings.ts`

从「服务商为主键」改为「配置列表 + 当前指针」:

```ts
interface AIProfile {
  id: string;          // nanoid
  label: string;       // 备注名;留空自动取「模型名 || 服务商名」
  provider: AIProviderId;
  model: string;       // 具体模型;'' → 运行时取 PROVIDERS[provider].defaultModel
  baseUrl?: string;    // 仅 custom
}
interface AIData {
  profiles: AIProfile[];
  activeId: string | null;
  keys: Record<string, string>;   // profileId → key;SW-only,永不进 AIStatus
}
```

一份 profile = 一个具体的 `(服务商 + 地址 + key + 模型 + 备注名)`;切配置即切模型。

**store 方法**(替换旧 provider/keyFor/effectiveModel/set):

- `active(): AIProfile | null` — 由 activeId 取;activeId 悬空/为空 → null。
- `keyFor(id): string | undefined` — SW-only。
- `effectiveModel(p: AIProfile): string` — `p.model || PROVIDERS[p.provider].defaultModel`。
- `configured(): boolean` — 有 active、active 有 key、custom 还需有 baseUrl。
- `status(): AIStatus` — 见 §4;**不含任何 key**。
- `upsert(fields, key?): string` — 无 id 则新建(nanoid)、有 id 则改;key 为 undefined = 不动已存 key;返回 id。label 留空按规则补。
- `activate(id)`、`remove(id)`(删当前份 → activeId 落到列表首个或 null)。

### 2. 迁移(零丢失) —— `AISettingsStore.hydrate` + `load`

`hydrate` 检测旧结构(有 `keys`/`models`/`baseUrls` 这种 `Record<AIProviderId,…>` 形状):
对每个「有 key」的服务商生成一份 profile(`model=models[p]||''`,`baseUrl=baseUrls[p]`,label 按规则),
`keys[newProfileId]=旧 key`;`activeId` = 旧 `provider` 对应的新 profile(若它有 key),否则列表首个,否则 null。
置 `needsPersist` 标记;覆写 `load()`:`super.load()` 后若 `needsPersist` 则 `persist()` 一次 —— 固化新 id,避免每次加载重新生成。
新结构(已有 `profiles` 数组)直接沿用。空/损坏 → `{profiles:[],activeId:null,keys:{}}`。

### 3. AI 调用链 —— `core/background/index.ts`

`ctx.ai.complete` 改读 active profile:
```ts
const prof = aiSettings.active();
const key = prof && aiSettings.keyFor(prof.id);
if (!prof || !key) return Promise.reject(new Error('no key'));
PROVIDERS[prof.provider].complete(
  { system, user, model: aiSettings.effectiveModel(prof), maxTokens: 1024, temperature: 0, baseUrl: prof.baseUrl, signal },
  key,
);
```
`status()` / `configured()` 转发不变。

### 4. AIStatus —— `shared/ai.ts`

```ts
interface AIProfileStatus { id; label; provider; model; baseUrl?; hasKey: boolean }
interface AIStatus { profiles: AIProfileStatus[]; activeId: string | null; ready: boolean }
```
`model` 为「生效模型」(覆写或默认)→ UI 能直接显示真实模型。`ready` = active 份完整可用(治 App 的 `ai.hasKey` 判断)。

**消费方**:`App.tsx` 两处 `ai.hasKey` → `ai.ready`。设置面板整块重写(见 §6)。

### 5. 消息命令 —— `shared/messaging.ts` + `core/background/commands.ts`

删 `SET_AI_SETTINGS`,加三条:

- `SAVE_AI_PROFILE { id?, label, provider, model, baseUrl?, key? }` → `upsert`;若带 `activate` 语义:新建默认设为当前、编辑不动当前(见 §6 由 UI 决定是否随后 `ACTIVATE`)。
- `DELETE_AI_PROFILE { id }` → `remove`。
- `ACTIVATE_AI_PROFILE { id }` → `activate`。

三条都 `onChange()` 广播。`TEST_AI_CONNECTION` 不变(测 active 份)。全部登记进 `COMMAND_TYPES`。

### 6. UI —— 抽出 `entrypoints/sidepanel/components/AiProfilesSection.tsx`

`SettingsPanel.tsx` 已 662 行,把 AI 这块从 `AISection` 抽成独立文件(`SettingsPanel` 里 `<AiProfilesSection ai=... onSave/onDelete/onActivate/onTest />`)。形态:

- **列表**:每行 `●/○ 备注名 · 服务商徽标 · 模型`,当前份实心圆点高亮;右侧「编辑 / 删除」;点非当前行圆点 = 设为当前。列表为空显示引导语。
- 顶部一行「当前:{label} · {model}」——**带模型名,治「不显示模型」**。
- 「+ 新增配置」/「编辑」展开**编辑表单**(复用现有:服务商三档 tab + 地址 + key + 模型),**新增「备注名」输入**;编辑时 label/model/baseUrl 回填(key 掩码占位、留空不改)——**这也修了 bug**。
- 保存流程:custom 先按 baseUrl origin 带用户手势 `chrome.permissions.request`(复用 `permissionOriginFor` + `useAiActions.saveAi`),再 `SAVE_AI_PROFILE`;新建成功后 `ACTIVATE`(新建即启用),编辑不改当前。
- 「测试连接」:先保存(同上)再测 active;逻辑迁移自旧 `AISection`。

`useAiActions.ts`:`saveAi(provider,key,model,baseUrl)` → `saveProfile({id?,label,provider,model,baseUrl?,key?})`;加 `deleteProfile(id)` / `activateProfile(id)`。

### 7. i18n(四语)

新增:`settings.ai.profiles.empty`(空列表引导)、`settings.ai.profiles.add`(+ 新增配置)、`settings.ai.profiles.edit`/`.delete`/`.setActive`、`settings.ai.label.placeholder`(备注名)、`settings.ai.current`(当前:{label} · {model})、`settings.ai.deleteConfirm`。
`settings.ai.configured` 旧键按需保留或改。en 为类型源,四语必须齐。

## 不做(YAGNI)

- 不做主面板快速切换 / 顶部模型徽标(按用户所选,仅设置内切换)。
- 不做单次调用临时改模型、不做配置导入/导出、不做「测试全部」。
- 不加删除当前份的二次确认之外的花样;删除用 `window.confirm`。

## 测试

- `tests/ai-settings.test.ts`(新):`AISettingsStore` upsert(新建/编辑,key 留空不动)、activate、remove(删当前份的回落)、`configured()` 分档、`status()` 不含 key、旧结构迁移(每个有 key 的服务商 → 一份 profile、activeId 落在旧 provider、`load` 固化持久)。
- `tests/commands` 相关:`SAVE_/DELETE_/ACTIVATE_AI_PROFILE` 往返;`ctx.ai.complete` 走 active 份(可用假 provider 验证选中的 model/baseUrl)。
- `tests/settings-panel`(或新 `ai-profiles-section.test.tsx`):渲染列表、+新增、编辑回填模型(bug 回归)、切换当前、删除、当前行显示模型名。
- 既有 385 全绿,预计 +≈10。

## 验证

`tsc` 0(四语 key 齐 + AIStatus 改型的全消费方)、`oxlint` 0、`prettier` clean、`vitest` 全绿、`wxt build` OK。
真机:重载 → 旧配置自动出现在列表且仍启用、顶部显示模型名 → 新增第二份(另一个模型/中转站)→ 切换当前 → AI 整理走新当前份 → 删除、编辑回填正常。

## 备注

按既有约定:分层提交、commit 尾部带 Co-Authored-By + Claude-Session;**推送仅在明确指示时**。key 全程 SW-only、不入快照(F-13)。
