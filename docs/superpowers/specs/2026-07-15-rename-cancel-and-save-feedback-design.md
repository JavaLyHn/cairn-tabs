# AI 改名可取消 + 保存反馈上色 — 设计

日期:2026-07-15
状态:已通过设计评审,待实现

## 背景与目标

两项独立的小抓光,一并交付:

1. **AI 改名可取消(#1)**:任务改名时的「✦ AI」建议在请求进行中(`aiNaming`)只显示禁用的「✦ …」,无法中止。为它接上已有的取消机制,让进行中的按钮变成可点的「✦ 取消」。
2. **保存反馈上色 + 自动消失(#2)**:`AISection` 里「保存并启用」的反馈(`msg`)对成功与失败使用同一种灰色、且不自动消失。给它按成功/失败上色,并让成功提示自动消失。

范围更正(基于读码):「测试连接」的结果(`result`)**已**是绿 ✓ / 红 ✗ 区分,本次不动;#2 只修「保存」反馈(`msg`)。

非目标:不动 AI 取消的后端机制(已在 `createAiRunner` / `CANCEL_AI` 中就绪);不重构 SettingsPanel 的 `result` 块;不改 AI 整理(organize)那条已有的取消 pill。

## #1 AI 改名可取消

### 现状(entrypoints/sidepanel/components/ContextGroup.tsx:143-163)

改名编辑态里有一个按钮:非进行中显示「✦ AI」;点击后 `setAiNaming(true)` → `await onAiSuggestName()` → `setAiNaming(false)`,拿到名字则回填输入框。进行中(`aiNaming`)时按钮 `disabled` 且显示「✦ …」。

后端取消链路已就绪:`CANCEL_AI` 命令 → `aiRunner.cancel()` → 在飞请求以 `AICancelledError` 拒绝 → 命令层返回 `AI_ERROR reason:'cancelled'` → `App.aiSuggestName` 收到 `cancelled` 弹「已取消」轻提示并返回 `null`。

### 改动

- **ContextGroup 新增可选属性** `onAiCancel?: () => void`。
- 改名 AI 按钮的行为按 `aiNaming` 分支:
  - 非进行中:文案「✦ AI」,`disabled={false}`,`onClick` = 现有的「开始建议」逻辑。
  - 进行中:文案「✦ 取消」,**不禁用**,`onClick` = `onAiCancel?.()`(仅中止,不重复发起)。
  - `onMouseDown={(e) => e.preventDefault()}` 两种状态都保留(避免 input 失焦触发 commit)。
  - `aria-label` 随状态:进行中「取消 AI 命名」/ 否则「AI 命名」。
- **App.tsx**:给 `groupProps` 增加 `onAiCancel: () => dispatch({ type: 'CANCEL_AI' })`(与已有的 pill 取消同一命令)。
- 取消后:`onAiSuggestName()` 的 promise 以 `null` 结束 → 现有 `if (name && inputRef.current)` 天然不回填;`setAiNaming(false)` 在 `finally`/promise 结束时执行,按钮复位为「✦ AI」。

### 边界

只有一个在飞 AI 请求(`aiRunner` 单实例)。若此刻恰有 organize 在飞,`CANCEL_AI` 会中止当前在飞那个——这是可接受的既有语义,不在本次扩展。

## #2 保存反馈上色 + 自动消失

### 现状(entrypoints/sidepanel/components/SettingsPanel.tsx:313, 432)

`const [msg, setMsg] = useState('')`;渲染为 `{msg && <span className="text-[11px] opacity-60">{msg}</span>}`。`save()` 成功 `setMsg('已保存')`,失败 `setMsg(错误文案)` —— 两者同为 `opacity-60` 灰色,且不会自动消失(仅在下次 save/test/切档时清)。

### 改动

- 将 `msg` 状态由 `string` 改为 `{ text: string; ok: boolean } | null`(与 `result` 同构,便于上色)。
- `save()`:成功 `setMsg({ text: '已保存', ok: true })`;失败 `setMsg({ text: 错误文案, ok: false })`。开头照旧 `setMsg(null); setResult(null)`。
- 渲染上色:成功用 `text-emerald-600 dark:text-emerald-400`,失败用 `text-red-600 dark:text-red-400`(与 `result` 块同一配色)。
- **成功自动消失**:`setMsg({text:'已保存', ok:true})` 后用 `setTimeout` 约 2500ms 清除(仅成功)。用 `useRef` 存 timer,组件卸载时 `clearTimeout` 清理,避免卸载后 setState。失败**不自动消失**(保留给用户看错误)。
- 其他清除 `msg` 的地方(provider 切换的 `setMsg('')`、`test()` 里的 `setMsg('')`)改为 `setMsg(null)` 以匹配新类型。

## 测试计划(TDD,先写失败测试)

- **组件测试**(RTL + jsdom):
  - `tests/context-group.test.tsx`(若不存在则新建,带 `// @vitest-environment jsdom`):渲染 ContextGroup 于编辑态(`editing`)、`aiEnabled` 且非 inbox。驱动进行中态的具体做法:`onAiSuggestName` 传一个**永不 resolve 的 promise**;初始断言按钮名为「✦ AI」→ 点击它(组件内 `setAiNaming(true)`,promise 不结束 → 停在进行中)→ 断言按钮文案变「✦ 取消」且未 `disabled` → 再点它 → 断言 `onAiCancel` 被调用一次。
  - `tests/settings-panel.test.tsx`(若不存在则新建):渲染 AISection(或 SettingsPanel),触发保存成功 → 断言反馈用 emerald 类;保存失败 → 断言用 red 类。(具体断言用 `toHaveClass` 或类名包含检查。)
- 说明:自动消失(setTimeout)用假计时器(`vi.useFakeTimers`)断言成功提示在 ~2500ms 后消失;失败提示不消失。

## 提交计划(分层)

1. `feat(sidepanel): AI 改名进行中可取消(✦ 取消)`
2. `feat(sidepanel): 保存反馈上色 + 成功自动消失`

(每步含对应组件测试。)
