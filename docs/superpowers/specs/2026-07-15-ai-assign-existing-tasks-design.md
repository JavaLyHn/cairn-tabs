# AI 整理:让 AI 判断并入已有任务 — 设计

日期:2026-07-15
状态:已通过设计评审,待实现

## 背景与目标

AI 整理(`AI_ORGANIZE_INBOX`)本就能产出「并入已有任务」(`AIPlan.assign`),弹窗 `AIPlanDialog` 也有「并入已有任务」一节可逐条确认/取消。但 `buildOrganizePrompt` 喂给 AI 的「已有任务」**只有任务名**(`{id, name}`)——AI 只能靠任务名猜归属,名字含糊(「工作」「新任务」或 AI 起的名)时根本判断不了某个未分类标签是否属于该任务。

目标:**给 AI 附上每个已有任务的内容信号(域名 + 示例标题)**,让 AI 能真正判断「这些未分类标签是否适合并入某个已有任务」。配合已修复的 `temperature=0`(输出稳定),AI 会在合适时稳定地建议并入。

非目标:不改 `AIPlanDialog` UI(已有「并入已有任务」节);不做非 AI 的确定性建议(那是另一条路,本次不做);不改聚簇。

## 现状(读码确认)

- `core/ai/organize.ts` `buildOrganizePrompt(tabs, tasks)`:`existingTasks` 仅 `{id, name}`。系统提示已含「明显属于某个已有任务时,优先并入该任务」。
- `core/background/commands.ts` `AI_ORGANIZE_INBOX`:`tasks = contexts.filter(c => c.id !== INBOX_ID && c.status === 'active')`,传 `tasks.map(c => ({id: c.id, name: c.name}))`。快照里有全部 `tabs`。
- 已有工具:`registrableDomain(hostnameOf(url))`(commands.ts 已用于 AI_SUGGEST_NAME)。

## 设计

### 1. 纯函数:任务内容摘要

在 `core/ai/organize.ts` 新增纯函数,便于单测:

```ts
export interface TaskSignals { domains: string[]; samples: string[]; }
export function summarizeTaskTabs(
  tabs: { title: string; domain: string }[],
): TaskSignals
```

- `domains`:对传入标签的 `domain` 去重、按出现频次降序,取前 **5**。
- `samples`:取前 **3** 个非空 `title`(顺序即传入顺序)。
- 空输入 → `{ domains: [], samples: [] }`。

### 2. 扩展 OrganizeTask + prompt

`OrganizeTask` 从 `{id, name}` 扩为:

```ts
export interface OrganizeTask { id: string; name: string; domains: string[]; samples: string[]; }
```

`buildOrganizePrompt`:`existingTasks` 序列化为 `{ id, name, domains, samples }`。系统提示微调,增加一行让 AI 参考这些信号判断归属,例如:
`- 判断是否并入已有任务时,参考该任务的 domains(域名)与 samples(示例标题)是否与标签一致。`

### 3. handler 计算并传入信号

`AI_ORGANIZE_INBOX` 里,为每个已有任务从快照 `tabs` 计算信号:

```ts
const tasksWithSignals = tasks.map((c) => {
  const own = tabs.filter((t) => t.contextId === c.id);
  const sig = summarizeTaskTabs(
    own.map((t) => ({ title: t.title, domain: registrableDomain(hostnameOf(t.url)) })),
  );
  return { id: c.id, name: c.name, domains: sig.domains, samples: sig.samples };
});
```

传给 `buildOrganizePrompt(looseTabs, tasksWithSignals)`。其余(parse、返回 AI_PLAN)不变。

### 隐私(F-13)

新增出网内容仅为「已有任务的域名(eTLD+1) + 标签标题 + 任务名」——都在允许出网集合内。**绝不**含完整 URL / query / 页面内容。key 仍只在 SW。✓

### token 控制

每任务至多 5 域名 + 3 标题;任务数通常很少,不额外截断(活跃命名任务一般个位数)。

## 测试计划(TDD)

- `tests/ai-organize.test.ts`:
  - `summarizeTaskTabs`:按频次取 top-5 域名、去重;取前 3 标题;空输入 → 空。
  - `buildOrganizePrompt`:user 串含某任务的 domain 与 sample 标题。
- (可选)`tests/ai-apply.integration.test.ts`:`AI_ORGANIZE_INBOX` 传给 `complete` 的 prompt 含已有任务的域名(用可捕获 prompt 的假 `ai.complete`)。

## 提交计划(分层)

1. `feat(ai): 给 AI 整理附上已有任务的域名/示例,便于判断并入`(summarizeTaskTabs + prompt 扩展 + handler + 测试)
