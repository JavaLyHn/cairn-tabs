# AI 改名可取消 + 保存反馈上色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 改名建议在进行中可取消(「✦ 取消」),并给 AI 设置里「保存并启用」的反馈上色 + 成功自动消失。

**Architecture:** 两处纯前端小改。#1 复用既有的 `CANCEL_AI` 命令/`aiRunner` 取消机制,只在 UI 上把进行中的「✦ …」按钮改成可点的「✦ 取消」,并从 App 传入 `onAiCancel`。#2 把 `AISection` 的 `msg` 状态从字符串改为带成功标记的对象,按成功/失败上色,成功提示 setTimeout 自动消失。

**Tech Stack:** React 19 + TypeScript strict、Tailwind、Vitest + @testing-library/react + jsdom。

## Global Constraints

- 语言:用户可见文案、注释、提交信息用中文。
- 提交信息结尾必须是:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 架构不变式:UI 只发 Command;本次不改后端/DB。取消复用已存在的 `{ type: 'CANCEL_AI' }` 命令,不新增命令。
- 组件测试文件顶部加 `// @vitest-environment jsdom`;断言颜色用 `className` 字符串包含检查(仓库未配置 jest-dom 的 `toHaveClass`)。
- 运行命令用 `pnpm`(`pnpm test`、`pnpm exec tsc --noEmit`、`pnpm build`)。
- 不引入新依赖。

---

### Task 1: AI 改名进行中可取消(✦ 取消)

**Files:**
- Modify: `entrypoints/sidepanel/components/ContextGroup.tsx`(Props 加 `onAiCancel`;改名 AI 按钮按 `aiNaming` 分支)
- Modify: `entrypoints/sidepanel/App.tsx`(`groupProps` 加 `onAiCancel`)
- Test: `tests/context-group.test.tsx`(新建)

**Interfaces:**
- Consumes: 既有 `{ type: 'CANCEL_AI' }` 命令(App 的 `dispatch`)。
- Produces: `ContextGroup` 新增可选属性 `onAiCancel?: () => void`;进行中按钮 `aria-label="取消 AI 命名"`、文案「✦ 取消」、可点触发 `onAiCancel`。

- [ ] **Step 1: 写失败测试**

新建 `tests/context-group.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ContextGroup } from '@/entrypoints/sidepanel/components/ContextGroup';
import type { Context } from '@/shared/types';

afterEach(cleanup);

const ctx: Context = {
  id: 'c1',
  name: '任务A',
  origin: 'manual',
  status: 'active',
  color: 'blue',
  createdAt: 0,
  lastActiveAt: 0,
  tabOrder: [],
};
const noop = () => {};

function baseProps(over: Record<string, unknown> = {}) {
  return {
    context: ctx,
    tabs: [],
    variant: 'active' as const,
    dupMarks: new Map(),
    portMap: {},
    editing: true,
    onStartEdit: noop,
    onCommitName: noop,
    onCancelEdit: noop,
    onArchive: noop,
    onArchiveAll: noop,
    onRestore: noop,
    onExport: noop,
    onDelete: noop,
    onDropTab: noop,
    onActivateTab: noop,
    onCloseTab: noop,
    aiEnabled: true,
    onAiSuggestName: () => new Promise<string | null>(() => {}), // 永不 resolve → 停在进行中
    ...over,
  };
}

describe('ContextGroup AI 改名取消', () => {
  it('进行中按钮变「✦ 取消」且可点,点击触发 onAiCancel', async () => {
    const onAiCancel = vi.fn();
    render(<ContextGroup {...baseProps({ onAiCancel })} />);

    const start = screen.getByRole('button', { name: 'AI 命名' });
    expect(start.textContent).toContain('✦ AI');

    fireEvent.click(start); // 开始建议(promise 不结束 → 进行中)
    const cancelBtn = await screen.findByRole('button', { name: '取消 AI 命名' });
    expect(cancelBtn.textContent).toContain('✦ 取消');
    expect((cancelBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(cancelBtn); // 再点 → 取消
    expect(onAiCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test context-group`
Expected: FAIL —— 进行中按钮当前 `disabled` 且 `aria-label` 为空(用 `title`),`findByRole({name:'取消 AI 命名'})` 找不到。

- [ ] **Step 3: 实现 ContextGroup 改动**

在 `entrypoints/sidepanel/components/ContextGroup.tsx`:

(a) Props 接口(`onAiSuggestName` 那行之后,约第 30 行)新增:

```ts
  onAiSuggestName?: () => Promise<string | null>; // AI 命名:返回建议名(不自动应用)
  onAiCancel?: () => void; // 进行中点「✦ 取消」中止(复用 CANCEL_AI)
```

(b) 解构参数(`onAiSuggestName,` 那行之后,约第 56 行)新增 `onAiCancel,`。

(c) 把改名 AI 按钮整块(当前约 143-163 行)替换为:

```tsx
            {aiEnabled && !isInbox && onAiSuggestName && (
              <button
                aria-label={aiNaming ? '取消 AI 命名' : 'AI 命名'}
                title={aiNaming ? '点击取消' : 'AI 命名(据任务里的标签建议)'}
                // mousedown 不让 input 失焦(否则会触发 commit 提前退出编辑)
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  if (aiNaming) {
                    onAiCancel?.(); // 进行中 → 中止;promise 以 null 结束,不回填
                    return;
                  }
                  setAiNaming(true);
                  const name = await onAiSuggestName();
                  setAiNaming(false);
                  if (name && inputRef.current) {
                    inputRef.current.value = name;
                    inputRef.current.focus();
                    inputRef.current.select();
                  }
                }}
                className="shrink-0 text-[11px] text-accent hover:underline"
              >
                {aiNaming ? '✦ 取消' : '✦ AI'}
              </button>
            )}
```

（改动点:去掉 `disabled={aiNaming}` 与 `disabled:opacity-40`;`onClick` 在进行中分支调用 `onAiCancel`;文案与 `aria-label` 随 `aiNaming` 切换。）

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test context-group`
Expected: PASS。

- [ ] **Step 5: App 接线**

在 `entrypoints/sidepanel/App.tsx` 的 `groupProps`(`onAiSuggestName: () => aiSuggestName(ctx.id),` 那行之后)新增:

```ts
    onAiSuggestName: () => aiSuggestName(ctx.id),
    onAiCancel: () => dispatch({ type: 'CANCEL_AI' }),
```

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 均通过。

- [ ] **Step 7: 提交**

```bash
git add entrypoints/sidepanel/components/ContextGroup.tsx entrypoints/sidepanel/App.tsx tests/context-group.test.tsx
git commit -m "$(cat <<'EOF'
feat(sidepanel): AI 改名进行中可取消(✦ 取消)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 保存反馈上色 + 成功自动消失

**Files:**
- Modify: `entrypoints/sidepanel/components/SettingsPanel.tsx`(`AISection` 的 `msg` 状态、`save`/`test`/切档处、渲染)
- Test: `tests/settings-panel.test.tsx`(新建)

**Interfaces:**
- Consumes: 无。
- Produces: 无(纯 UI)。「保存并启用」成功 → 绿色「已保存」并约 2.5s 后自动消失;失败 → 红色错误文案且保留。

- [ ] **Step 1: 写失败测试**

新建 `tests/settings-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { SettingsPanel } from '@/entrypoints/sidepanel/components/SettingsPanel';
import { DEFAULT_FLAGS } from '@/shared/types';
import type { AIStatus } from '@/shared/ai';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const ai: AIStatus = { provider: 'anthropic', hasKey: true, model: 'x' };
const noop = () => {};

function props(over: Record<string, unknown> = {}) {
  return {
    flags: DEFAULT_FLAGS,
    ai,
    onToggleAutoCluster: noop,
    onSetSameDomainSize: noop,
    onToggleStaleHints: noop,
    onSetStaleDays: noop,
    onToggleAutoDiscard: noop,
    onSetDiscardAfterMinutes: noop,
    onToggleDiscardSkipsLocalhost: noop,
    onSaveAi: async () => {},
    onTestAi: async () => ({ ok: true, detail: 'ok' }),
    onExportAll: noop,
    onClose: noop,
    ...over,
  };
}

describe('AISection 保存反馈', () => {
  it('保存成功 → 绿色反馈', async () => {
    render(<SettingsPanel {...props({ onSaveAi: async () => {} })} />);
    fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));
    const el = await screen.findByText('已保存');
    expect(el.className).toContain('emerald');
  });

  it('保存失败 → 红色反馈', async () => {
    render(<SettingsPanel {...props({ onSaveAi: async () => { throw new Error('boom'); } })} />);
    fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));
    const el = await screen.findByText('boom');
    expect(el.className).toContain('red');
  });

  it('成功提示 ~2.5s 后自动消失,失败不消失', async () => {
    vi.useFakeTimers();
    // 成功:自动消失
    const ok = render(<SettingsPanel {...props({ onSaveAi: async () => {} })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));
    });
    expect(screen.getByText('已保存')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(screen.queryByText('已保存')).toBeNull();
    ok.unmount();

    // 失败:不消失
    render(<SettingsPanel {...props({ onSaveAi: async () => { throw new Error('bad'); } })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));
    });
    expect(screen.getByText('bad')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(screen.getByText('bad')).toBeTruthy(); // 失败保留
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test settings-panel`
Expected: FAIL —— 当前反馈用 `opacity-60` 灰色(className 不含 emerald/red),且成功不会自动消失。

- [ ] **Step 3: 实现 SettingsPanel 改动**

在 `entrypoints/sidepanel/components/SettingsPanel.tsx`:

(a) 第 1 行 import 增加 `useRef`:

```ts
import { useState, useEffect, useRef, type ReactNode } from 'react';
```

(b) `AISection` 里的 msg 状态(约 313 行)由:

```ts
  const [msg, setMsg] = useState('');
```

改为(加类型 + 计时器 ref + 展示助手 + 卸载清理):

```ts
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 成功提示约 2.5s 自动消失;失败保留(方便看清)。切档/再次保存或测试时照旧清除。
  const showMsg = (text: string, ok: boolean) => {
    if (msgTimer.current) clearTimeout(msgTimer.current);
    setMsg({ text, ok });
    if (ok) msgTimer.current = setTimeout(() => setMsg(null), 2500);
  };
  useEffect(() => () => { if (msgTimer.current) clearTimeout(msgTimer.current); }, []);
```

(c) `save()` 内:开头的 `setMsg('');` 改为 `setMsg(null);`;成功分支 `setMsg('已保存');` 改为 `showMsg('已保存', true);`;失败分支 `setMsg(e instanceof Error ? e.message : '保存失败');` 改为 `showMsg(e instanceof Error ? e.message : '保存失败', false);`。

(d) `test()` 内开头的 `setMsg('');` 改为 `setMsg(null);`。

(e) provider 切换按钮 onClick 里的 `setMsg('');`(约 377 行)改为 `setMsg(null);`。

(f) 渲染(约 432 行)由:

```tsx
        {msg && <span className="text-[11px] opacity-60">{msg}</span>}
```

改为:

```tsx
        {msg && (
          <span
            className={`text-[11px] ${
              msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {msg.text}
          </span>
        )}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test settings-panel`
Expected: PASS(3 个用例)。

- [ ] **Step 5: 类型检查 + 全量测试 + 构建**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: 均通过;构建产出 `.output/chrome-mv3`。

- [ ] **Step 6: 提交**

```bash
git add entrypoints/sidepanel/components/SettingsPanel.tsx tests/settings-panel.test.tsx
git commit -m "$(cat <<'EOF'
feat(sidepanel): 保存反馈上色 + 成功自动消失

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 最终验证

- [ ] `pnpm test` 全绿(原 201 + 新增约 4 个用例)。
- [ ] `pnpm exec tsc --noEmit` 无错误。
- [ ] `pnpm build` 成功。
- [ ] 手动:改名时点「✦ AI」→ 按钮变「✦ 取消」→ 点它 → 弹「已取消」、按钮复位、输入框不被改。
- [ ] 手动:AI 设置里保存成功 → 绿色「已保存」约 2.5s 消失;保存失败(如填错地址)→ 红色错误且保留。
