# AI 取消 + 图标按钮可访问性 — 设计

日期:2026-07-15
状态:已通过设计评审,待实现

## 背景与目标

两项独立的小优化,一并交付:

1. **AI 取消(#1)**:点「✦ AI 整理」后,若 AI 请求卡住,用户当前只能干等满 30s 超时,期间无法中止。为「✦ AI 分析中…」提供一个「取消」按钮,让用户能立即中止在飞的 AI 请求。
2. **图标按钮 aria-label(#2)**:纯图标按钮(仅含 SVG、无可见文字)对屏幕阅读器是「空按钮」,只念「按钮」。补 `aria-label` 让读屏用户可用,也让组件测试可按名字选取。

非目标:不做增量广播、列表虚拟化、App.tsx 拆分(另行评估)。

## #1 AI 取消

### 现状约束

- UI 通过 `dispatch({type:'AI_ORGANIZE_INBOX'})`(`chrome.runtime.sendMessage`)发命令并 await 响应。
- SW 的 `ctx.ai.complete()`(`core/background/index.ts`)每次调用创建一个**局部** `AbortController`,挂 30s 超时。外部无法触达 → 无法取消。
- `AI_ORGANIZE_INBOX` / `AI_SUGGEST_NAME` 的 catch 把一切错误(含 AbortError)映射为 `reason:'network'` → UI 弹「AI 调用失败,请稍后重试」。
- 关键难点:**用户主动取消**与**超时/网络失败**都会抛 AbortError,必须区分,否则取消会误弹网络错误。

### 协议层(shared/)

- `shared/ai.ts`:`AIErrorReason` 增加 `'cancelled'`。
- `shared/ai.ts`:新增取消标记类型,供 SW 抛出、命令层识别:
  - `class AICancelledError extends Error`(构造置 `name = 'AICancelledError'`,`message = 'cancelled'`)。
  - `isAICancelled(e: unknown): boolean` —— 按 `e instanceof Error && e.name === 'AICancelledError'` 判断(按 name 判断,跨模块打包稳)。
- `shared/messaging.ts`:命令联合新增 `{ type: 'CANCEL_AI' }`;登记进 `COMMAND_TYPES`。

### SW 层(core/background/index.ts)

- 模块级持有在飞请求:`let aiAbort: AbortController | null = null` 与 `let aiUserCancelled = false`。
- `cmdCtx.ai.complete(system, user)`:
  - 开始:若已有在飞请求先 `aiAbort?.abort()`(只允许一个在飞,防串);新建 controller 赋给 `aiAbort`,置 `aiUserCancelled = false`,挂 30s 超时。
  - `.catch(e => { if (aiUserCancelled) throw new AICancelledError(); throw e; })` —— 用户取消时改抛 `AICancelledError`;超时那条 abort 不动 `aiUserCancelled` → 仍抛原 AbortError → 命令层映射为 `network`。
  - `.finally`:清 timer;若 `aiAbort === ctrl` 则置回 `null`。
- `cmdCtx.ai.cancel()`:`aiUserCancelled = true; aiAbort?.abort();`(新增到 `CommandContext.ai`)。

### 命令层(core/background/commands.ts)

- 新增 `case 'CANCEL_AI': ctx.ai?.cancel(); return;`
- `AI_ORGANIZE_INBOX` 与 `AI_SUGGEST_NAME` 的 catch 改为:
  ```ts
  } catch (e) {
    if (isAICancelled(e)) return { type: 'AI_ERROR', reason: 'cancelled' };
    return { type: 'AI_ERROR', reason: 'network' };
  }
  ```

### UI 层(entrypoints/sidepanel/App.tsx)

- 底部「✦ AI 分析中…」pill 内加一个「取消」按钮 → `dispatch({ type: 'CANCEL_AI' })`。
- `aiOrganize`:收到 `reason === 'cancelled'` → `showFlash('已取消 AI 整理')`,不落入 network 错误分支。
- AI 改名(`aiSuggestName`)走同一 `complete` 路径,机制天然覆盖:收到 `cancelled` 时同样静默(不弹 network 错)。但**不单独给改名加取消 UI**——它很快,`✦ …` 会自行复位。

### 取消后反馈(已确认)

弹一条 1.8s 的轻提示「已取消 AI 整理」,随后自动消失。

### 不在范围

设置里的「测试连接」不加取消:请求极小、自带 15s 超时,收益不大。

## #2 图标按钮 aria-label

给以下纯图标按钮补 `aria-label`(保留现有 `title` 作为鼠标气泡):

- 头部齿轮(设置)→ `aria-label="设置"`
- 标签行 ×(关闭)→ `aria-label="关闭标签"`
- 标签行 ★(重点)→ `aria-label` 随状态:未标注「标为重点」/ 已标注「取消重点」
- pill 里新增的取消按钮 → `aria-label="取消 AI 整理"`

搜索、「+ 新建」已含可见文字,不改。

## 测试计划(TDD,先写失败测试)

- **集成测试**(`tests/*.integration.test.ts`):
  - `CANCEL_AI` 在 AI 请求在飞时触发 → `AI_ORGANIZE_INBOX` 返回 `AI_ERROR reason:'cancelled'`。
  - 超时 / 网络失败仍返回 `reason:'network'`(确认与 cancelled 不混)。
  - 需要一个可控的假 AI provider(能挂起、能被 abort)注入 `cmdCtx.ai`。
- **单元测试**:`isAICancelled` 对 `AICancelledError` 返回 true、对普通 Error / AbortError 返回 false。
- **组件测试**(RTL + jsdom):关闭 / 重点按钮可用 `getByRole('button', { name })` 命中;重点按钮名称随 `starred` 切换。

## 提交计划(分层)

1. `feat(ai): 协议层 —— cancelled 原因 + CANCEL_AI 命令 + AICancelledError`
2. `feat(ai): SW 支持取消在飞 AI 请求(模块级 controller + cancel)`
3. `feat(ai): 命令层区分用户取消与网络失败`
4. `feat(sidepanel): AI 分析中 pill 加取消按钮 + 已取消轻提示`
5. `feat(a11y): 图标按钮补 aria-label`

(每步含对应测试;可按实际粒度合并相邻步骤。)
