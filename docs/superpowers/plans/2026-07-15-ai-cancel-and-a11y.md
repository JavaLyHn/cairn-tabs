# AI 取消 + 图标按钮可访问性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给「✦ AI 分析中…」加可取消能力(区分用户取消与网络失败),并给纯图标按钮补 `aria-label`。

**Architecture:** 取消走既有的命令/事件通道:SW 把在飞的 `AbortController` 提到模块级,新增 `CANCEL_AI` 命令 abort 它;用 `AICancelledError` 标记「用户主动取消」,命令层据此返回新的 `AIErrorReason: 'cancelled'`,与超时/网络失败(`network`)区分。UI 在 pill 上加「取消」按钮,收到 `cancelled` 弹轻提示。a11y 为纯图标按钮补 `aria-label`。

**Tech Stack:** WXT (MV3)、React 19、TypeScript strict、Vitest + fake-chrome/fake-indexeddb、@testing-library/react + jsdom。

## Global Constraints

- 语言:所有用户可见文案、注释、提交信息用中文。
- 提交信息结尾必须是:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 架构不变式:SW 是唯一写方;UI 只发 Command、订阅 STATE_SNAPSHOT;DB 只经 repositories.ts。
- 隐私不变式(F-13):key 只在 SW 读,永不进 UI/store/广播/日志;`AIStatus` 永不含 key。本次改动不触碰 key 传输路径。
- 测试环境:全局 `environment: 'node'`;组件测试文件顶部加 `// @vitest-environment jsdom` docblock。
- 运行命令用 `pnpm`(`pnpm test`、`pnpm build`、`pnpm exec tsc --noEmit`)。
- 不引入新依赖。

---

### Task 1: 协议层 —— cancelled 原因 + AICancelledError + CANCEL_AI 命令

**Files:**
- Modify: `shared/ai.ts`(在 `AIErrorReason` 后追加类型与两个导出)
- Modify: `shared/messaging.ts`(Command 联合 + `COMMAND_TYPES`)
- Test: `tests/ai-cancel.test.ts`(新建)

**Interfaces:**
- Produces:
  - `AIErrorReason` 增加取值 `'cancelled'`。
  - `class AICancelledError extends Error`(无参构造)。
  - `function isAICancelled(e: unknown): boolean`。
  - Command 新增 `{ type: 'CANCEL_AI' }`。

- [ ] **Step 1: 写失败测试**

新建 `tests/ai-cancel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AICancelledError, isAICancelled } from '@/shared/ai';

describe('isAICancelled', () => {
  it('识别 AICancelledError', () => {
    expect(isAICancelled(new AICancelledError())).toBe(true);
  });
  it('普通 Error 不算取消', () => {
    expect(isAICancelled(new Error('boom'))).toBe(false);
  });
  it('AbortError(超时)不算用户取消', () => {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    expect(isAICancelled(e)).toBe(false);
  });
  it('非 Error 值不报错', () => {
    expect(isAICancelled(undefined)).toBe(false);
    expect(isAICancelled('cancelled')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test ai-cancel`
Expected: FAIL —— `AICancelledError`/`isAICancelled` is not exported。

- [ ] **Step 3: 实现协议层**

在 `shared/ai.ts` 里,把 `AIErrorReason` 那行改为(增加 `'cancelled'`):

```ts
export type AIErrorReason = 'no_key' | 'permission' | 'network' | 'parse' | 'empty' | 'cancelled';
```

并在该行之后新增:

```ts
/** 用户主动取消在飞 AI 请求的标记错误 —— 与超时/网络失败(同为 AbortError)区分。 */
export class AICancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AICancelledError';
  }
}

/** 判定是否用户主动取消(按 name,跨模块打包稳)。 */
export function isAICancelled(e: unknown): boolean {
  return e instanceof Error && e.name === 'AICancelledError';
}
```

在 `shared/messaging.ts` 的 Command 联合里,`TEST_AI_CONNECTION` 那条之后新增一行(注意上一条末尾的 `;` 会变成 `|`,按现有格式对齐):

```ts
  | { type: 'TEST_AI_CONNECTION' }
  | { type: 'CANCEL_AI' };
```

并在 `COMMAND_TYPES` 集合里加入 `'CANCEL_AI'`(与 `'TEST_AI_CONNECTION'` 等并列)。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test ai-cancel`
Expected: PASS(4 个断言)。

- [ ] **Step 5: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add shared/ai.ts shared/messaging.ts tests/ai-cancel.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): 协议层 —— cancelled 原因 + AICancelledError + CANCEL_AI 命令

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 命令层 —— CANCEL_AI 处理 + 区分用户取消与网络失败

**Files:**
- Modify: `core/background/commands.ts`(`CommandContext.ai` 加 `cancel`;新增 `CANCEL_AI` case;两处 AI catch 改判)
- Test: `tests/ai-apply.integration.test.ts`(追加用例)

**Interfaces:**
- Consumes: `isAICancelled`、`AICancelledError`(Task 1)。
- Produces: `CommandContext.ai.cancel: () => void`;`CANCEL_AI` 命令行为;`AI_ORGANIZE_INBOX`/`AI_SUGGEST_NAME` 在用户取消时返回 `{ type:'AI_ERROR', reason:'cancelled' }`。

- [ ] **Step 1: 写失败测试**

在 `tests/ai-apply.integration.test.ts` 末尾追加(该文件已有 `beforeEach` 建好 `repo`/`ctx`,并在未分类放了标签;沿用其 `aiCtx` 构造风格):

```ts
describe('AI 取消', () => {
  it('complete 抛 AICancelledError → AI_ERROR reason cancelled', async () => {
    const aiCtx: CommandContext = {
      ...ctx,
      ai: {
        status: () => ({ provider: 'anthropic', hasKey: true, model: 'x' }),
        configured: () => true,
        complete: async () => {
          throw new AICancelledError();
        },
        set: async () => {},
        test: async () => ({ ok: true, detail: 'ok' }),
        cancel: () => {},
      },
    };
    const ev = await handleCommand({ type: 'AI_ORGANIZE_INBOX' }, aiCtx);
    expect(ev).toEqual({ type: 'AI_ERROR', reason: 'cancelled' });
  });

  it('普通错误仍归为 network(不与 cancelled 混)', async () => {
    const aiCtx: CommandContext = {
      ...ctx,
      ai: {
        status: () => ({ provider: 'anthropic', hasKey: true, model: 'x' }),
        configured: () => true,
        complete: async () => {
          throw new Error('The operation was aborted'); // 超时:AbortError,非用户取消
        },
        set: async () => {},
        test: async () => ({ ok: true, detail: 'ok' }),
        cancel: () => {},
      },
    };
    const ev = await handleCommand({ type: 'AI_ORGANIZE_INBOX' }, aiCtx);
    expect(ev).toEqual({ type: 'AI_ERROR', reason: 'network' });
  });

  it('CANCEL_AI 调用 ctx.ai.cancel()', async () => {
    let cancelled = false;
    const aiCtx: CommandContext = {
      ...ctx,
      ai: {
        status: () => ({ provider: 'anthropic', hasKey: true, model: 'x' }),
        configured: () => true,
        complete: async () => '',
        set: async () => {},
        test: async () => ({ ok: true, detail: 'ok' }),
        cancel: () => {
          cancelled = true;
        },
      },
    };
    await handleCommand({ type: 'CANCEL_AI' }, aiCtx);
    expect(cancelled).toBe(true);
  });
});
```

并确保该测试文件顶部 import 含 `AICancelledError`:

```ts
import { AICancelledError } from '@/shared/ai';
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test ai-apply`
Expected: FAIL —— 取消用例返回 `network`(而非 `cancelled`),且 `CANCEL_AI` 不被识别 / `cancel` 未定义类型报错。

- [ ] **Step 3: 实现命令层**

在 `core/background/commands.ts`:

(a) `CommandContext.ai` 接口(约 47-53 行)加一个方法,`test` 之后追加:

```ts
    test: () => Promise<{ ok: boolean; detail: string }>;
    /** 中止当前在飞的 AI 请求(用户点「取消」)。 */
    cancel: () => void;
```

(b) 顶部 import 增补 `isAICancelled`(与现有 `AIStatus`、`AIProviderId` 等从 `@/shared/ai`/`@/shared/messaging` 的导入并列;`isAICancelled` 来自 `@/shared/ai`)。

(c) `AI_SUGGEST_NAME` 的 catch(约 366 行)由:

```ts
      } catch {
        return { type: 'AI_ERROR', reason: 'network' };
      }
```

改为:

```ts
      } catch (e) {
        if (isAICancelled(e)) return { type: 'AI_ERROR', reason: 'cancelled' };
        return { type: 'AI_ERROR', reason: 'network' };
      }
```

(d) `AI_ORGANIZE_INBOX` 的 catch(约 400 行)同样改为:

```ts
      } catch (e) {
        if (isAICancelled(e)) return { type: 'AI_ERROR', reason: 'cancelled' };
        return { type: 'AI_ERROR', reason: 'network' };
      }
```

(e) 新增 `CANCEL_AI` case(放在 `TEST_AI_CONNECTION` case 之后):

```ts
    case 'CANCEL_AI':
      ctx.ai?.cancel();
      return;
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test ai-apply`
Expected: PASS(含新增 3 个用例)。

- [ ] **Step 5: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add core/background/commands.ts tests/ai-apply.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): 命令层区分用户取消与网络失败,新增 CANCEL_AI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: SW 装配 —— 模块级 AbortController + cancel 接线

**Files:**
- Modify: `core/background/index.ts`(`cmdCtx.ai.complete` 改写、加 `cancel`、加模块级状态)

**Interfaces:**
- Consumes: `AICancelledError`(Task 1)、`CommandContext.ai.cancel`(Task 2)。
- Produces: `cmdCtx.ai.cancel` 的真实实现;`complete` 用户取消时抛 `AICancelledError`,超时仍抛原错误。

> 说明:`index.ts` 是 SW 装配点(与既有 `complete`/`test` 闭包一致,项目未对其做单元测试)。本任务以类型检查 + 构建为门禁,行为在最终手动验证阶段确认。

- [ ] **Step 1: 顶部 import 增补**

在 `core/background/index.ts` 顶部,把:

```ts
import { friendlyAIError } from '@/shared/ai';
```

改为:

```ts
import { friendlyAIError, AICancelledError } from '@/shared/ai';
```

- [ ] **Step 2: 加模块级在飞状态**

在 `const aiSettings = new AISettingsStore();`(约 23 行)之后新增:

```ts
// 在飞的 AI 请求:提到模块级,好让 CANCEL_AI 命令能 abort 它;
// aiUserCancelled 区分「用户主动取消」与「超时」(两者都产生 AbortError)。
let aiAbort: AbortController | null = null;
let aiUserCancelled = false;
```

- [ ] **Step 3: 改写 complete,新增 cancel**

把 `cmdCtx.ai.complete`(约 106-125 行)整块替换为:

```ts
    complete: (system, user) => {
      const p = aiSettings.provider();
      const key = aiSettings.keyFor();
      if (!key) return Promise.reject(new Error('no key'));
      aiAbort?.abort(); // 只允许一个在飞,防串
      const ctrl = new AbortController();
      aiAbort = ctrl;
      aiUserCancelled = false;
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      return PROVIDERS[p]
        .complete(
          {
            system,
            user,
            model: aiSettings.effectiveModel(),
            maxTokens: 1024,
            baseUrl: aiSettings.baseUrlFor(),
            signal: ctrl.signal,
          },
          key,
        )
        .catch((e) => {
          if (aiUserCancelled) throw new AICancelledError(); // 用户取消 → 可区分标记
          throw e; // 超时/网络失败 → 原样上抛(命令层归为 network)
        })
        .finally(() => {
          clearTimeout(timer);
          if (aiAbort === ctrl) aiAbort = null;
        });
    },
```

并在 `cmdCtx.ai` 里(建议放在 `set` 之后、`test` 之前)新增 `cancel`:

```ts
    cancel: () => {
      if (aiAbort) {
        aiUserCancelled = true;
        aiAbort.abort();
      }
    },
```

- [ ] **Step 4: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 5: 跑全量测试(确保无回归)**

Run: `pnpm test`
Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add core/background/index.ts
git commit -m "$(cat <<'EOF'
feat(ai): SW 支持取消在飞 AI 请求(模块级 controller + cancel)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: UI —— 分析中 pill 加取消按钮 + 已取消轻提示

**Files:**
- Modify: `entrypoints/sidepanel/App.tsx`(`aiOrganize` 处理 `cancelled`;pill 内加取消按钮)

**Interfaces:**
- Consumes: `CANCEL_AI` 命令(Task 2)、`AIErrorReason: 'cancelled'`(Task 1)。
- Produces: 无(纯 UI)。

> 说明:App.tsx 为顶层容器,项目未对其做组件测试(组件测试覆盖 TabRow 等子组件)。本任务以类型检查 + 构建 + 手动验证为门禁。取消→cancelled 的核心判定已在 Task 2 覆盖。

- [ ] **Step 1: aiOrganize 处理 cancelled**

在 `App.tsx` 的 `aiOrganize`(约 77-93 行)里,`msg` 映射表新增 `cancelled`,并让它与其他错误一样走 `showFlash`。把 `msg` 对象改为包含:

```ts
      const msg: Record<string, string> = {
        no_key: '请先在设置里填 AI API key',
        permission: '未授权访问 API 域名',
        network: 'AI 调用失败,请稍后重试',
        parse: 'AI 没能给出可用的分组建议,已保持原样',
        empty: '未分类里没有可整理的标签',
        cancelled: '已取消 AI 整理',
      };
```

(现有 `showFlash(msg[ev.reason] ?? 'AI 调用失败')` 一行不变 —— `cancelled` 会命中 `'已取消 AI 整理'`。)

同样在 `aiSuggestName`(约 99-113 行)的 `msg` 映射表加一行,避免改名取消时弹「AI 调用失败」:

```ts
        permission: '未授权访问 API 域名',
        cancelled: '已取消',
```

- [ ] **Step 2: pill 内加取消按钮**

把 `aiBusy && !flash` 的 pill(约 513-521 行)替换为:

```tsx
      {aiBusy && !flash && (
        <div
          className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg text-[12px] shadow-lg
                     inline-flex items-center gap-2 bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
          ✦ AI 分析中…
          <button
            onClick={() => dispatch({ type: 'CANCEL_AI' })}
            aria-label="取消 AI 整理"
            className="ml-1 px-1.5 py-0.5 rounded text-[11px] underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            取消
          </button>
        </div>
      )}
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: 均无错误;构建产出 `.output/chrome-mv3`。

- [ ] **Step 4: 提交**

```bash
git add entrypoints/sidepanel/App.tsx
git commit -m "$(cat <<'EOF'
feat(sidepanel): AI 分析中 pill 加取消按钮 + 已取消轻提示

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 可访问性 —— 图标按钮补 aria-label

**Files:**
- Modify: `entrypoints/sidepanel/components/TabRow.tsx`(× 与 ★ 按钮)
- Modify: `entrypoints/sidepanel/App.tsx`(头部齿轮按钮)
- Test: `tests/tab-row.test.tsx`(追加断言)

**Interfaces:**
- Consumes: 无。
- Produces: 无(纯属性)。

- [ ] **Step 1: 写失败测试**

在 `tests/tab-row.test.tsx` 的 `describe('TabRow', ...)` 内追加:

```ts
  it('关闭按钮有无障碍名称', () => {
    render(<TabRow tab={tab()} portMap={{}} onActivate={noop} onClose={noop} />);
    expect(screen.getByRole('button', { name: '关闭标签' })).toBeTruthy();
  });

  it('重点按钮名称随 starred 切换', () => {
    const { rerender } = render(
      <TabRow tab={tab({ starred: false })} portMap={{}} onActivate={noop} onClose={noop} onToggleStar={noop} />,
    );
    expect(screen.getByRole('button', { name: '标为重点' })).toBeTruthy();
    rerender(
      <TabRow tab={tab({ starred: true })} portMap={{}} onActivate={noop} onClose={noop} onToggleStar={noop} />,
    );
    expect(screen.getByRole('button', { name: '取消重点' })).toBeTruthy();
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tab-row`
Expected: FAIL —— `getByRole('button', { name: '关闭标签' })` 找不到(当前只有 `title`,accessible name 为空)。

- [ ] **Step 3: 给 TabRow 按钮补 aria-label**

在 `entrypoints/sidepanel/components/TabRow.tsx`:

星按钮(约 170 行)在 `title={...}` 那行之后(或同处)增加 `aria-label`,与 title 同值:

```tsx
          title={tab.starred ? '取消重点' : '标为重点'}
          aria-label={tab.starred ? '取消重点' : '标为重点'}
```

关闭按钮(约 182 行)`title="关闭标签"` 那行之后增加:

```tsx
        title="关闭标签"
        aria-label="关闭标签"
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test tab-row`
Expected: PASS。

- [ ] **Step 5: 给头部齿轮按钮补 aria-label**

在 `entrypoints/sidepanel/App.tsx` 头部设置按钮(约 405-410 行,`title="设置"` 那个 `<button>`)加 `aria-label="设置"`:

```tsx
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md opacity-60 hover:opacity-100
                     hover:bg-black/5 dark:hover:bg-white/10"
          title="设置"
          aria-label="设置"
        >
```

(pill 的取消按钮已在 Task 4 带 `aria-label`。搜索、「+ 新建」已有可见文字,不改。)

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add entrypoints/sidepanel/components/TabRow.tsx entrypoints/sidepanel/App.tsx tests/tab-row.test.tsx
git commit -m "$(cat <<'EOF'
feat(a11y): 图标按钮补 aria-label(设置/关闭/重点/取消)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 最终验证

- [ ] `pnpm test` 全绿(应为原 189 + 新增约 9 个用例)。
- [ ] `pnpm exec tsc --noEmit` 无错误。
- [ ] `pnpm build` 成功,产出 `.output/chrome-mv3`。
- [ ] 手动:点「✦ AI 整理」→ pill 出现「取消」按钮 → 点它 → spinner 消失、弹「已取消 AI 整理」、不弹网络错误。
- [ ] 手动:屏幕阅读器 / 或浏览器无障碍面板确认关闭/重点/设置/取消按钮有名称。
