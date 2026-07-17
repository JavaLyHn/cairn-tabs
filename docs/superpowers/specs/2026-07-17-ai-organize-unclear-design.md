# AI「整理全部」不确定标签留原位 + 提示 — 设计

日期: 2026-07-17
状态: 已批准,待实现

## 背景

「✦ 整理全部」当前用激进 prompt(`aggressive`),要求 AI「尽量给每个标签找归属」,
基本会把所有标签硬塞进某组。用户希望:AI 拿不准的**不硬塞、保持原位**,并**给提示**,
否则用户不懂为什么某些标签整理后还留在未分类。

## 决策(已与用户确认)

1. 不确定标签:**保持原位不动**(本在未分类的留未分类,本在组里的留组里)。
2. 提示形式:**预览弹窗列出 + 本次会话内的行内标记**(重载后消失)。

## 方案

### 1. Prompt(`core/ai/organize.ts`)
去掉「尽量给每个标签找归属」的激进措辞。两档都要求 AI 把拿不准的列入 `unclear`
(`{tabId, reason}`,理由≤20 字),只在明显合适时才归类。
- aggressive(整理全部):允许把「明显更适合别处」的标签跨组移动 / 重新平衡;拿不准不硬塞。
- conservative(整理未分类):保守,只在明显合适时归类。
- 两档共用规则:拿不准 → 列入 `unclear` + 简短理由。
- JSON 结构追加:`"unclear":[{"tabId":"…","reason":"…"}]`。

### 2. Schema(`shared/ai.ts`)
`AIPlan` 增可选字段:`unclear?: { tabId: string; reason: string }[]`
(可选 → 既有 Command/测试字面量无需改动;消费方一律 `plan.unclear ?? []`)。

### 3. 解析(`parseOrganizeResponse`)
- 在处理完 assign + newGroups(共享 `seen` 去重)之后解析 `unclear`:
  tabId 须 valid 且未被归类(不与 assign/newGroups 重复),reason 取字符串、trim、截断 40。
- 仅当 `unclear` 非空时把该键写入结果(空则省略,既有 `.toEqual` 断言不破)。
- 空判定放宽:`newGroups、assign、unclear` **三者皆空**才返回 null(全不确定也能展示)。

### 4. 应用行为(`commands.ts`)
**零改动**:APPLY_AI_PLAN 只处理 newGroups/assign,unclear 标签自然不被移动 → 保持原位。
unclear 仅供 UI 提示,不下发到 SW 做移动。

### 5. 提示 UI
- **预览弹窗(`AIPlanDialog.tsx`)**:groups/assign 之后新增「拿不准 · 保持原位」区,
  列出每个 unclear 标签(favicon + 标题)+ AI 理由(只读)。`finalPlan` 透传 `plan.unclear`。
- **会话内行内标记**:
  - `useAiActions` 增 `unclearReasons: Record<tabId, reason>`;`applyAiPlan` 时由 `plan.unclear` 写入,
    每次 `aiOrganize`/`aiOrganizeAll` 开始时清空。
  - `App` 只把 `unclearReasons` 传给**未分类** `ContextGroup`;`ContextGroup` 把对应 `unclearReason`
    传给 `TabRow`;`TabRow` 有 reason 时渲染一个小「?」标记,`title`/`aria-label` = 本地化理由。
  - 标签一旦不在未分类(被移出)即不显示(渲染时天然过滤)。重载后 `unclearReasons` 清空 → 标记消失。

### 6. i18n(四语)
`aiPlan.unclear`(区标题「拿不准 · 保持原位」)、`tab.unclear.title`(`AI 认为分类不明确:{reason}`)。

## 测试
- `ai-organize.test.ts`:更新激进档断言(不再含「尽量」,改测「跨组」+ 两档含 `unclear`);
  新增 parse 的 unclear 分支(有效/无效 tabId、与归类去重、理由截断);空判定仍 null。
- `ai-plan-dialog.test.tsx`:新增 unclear 区渲染(标题 + 理由)。
- 既有 parse `.toEqual` 断言因「空则省略 unclear」保持通过。

## 取舍
- unclear 标签保持原位:整理全部时组内的不确定标签留在组里(不拽进未分类),行内标记只落未分类,
  与用户「不要动 + 未分类给提示」一致。
- 标记为会话态(不入 DB),重载消失;若日后要持久,再加字段(本次不做)。
