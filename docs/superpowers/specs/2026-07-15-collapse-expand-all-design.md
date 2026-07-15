# 一键展开 / 折叠全部 — 设计

日期:2026-07-15
状态:已通过设计评审,待实现

## 背景与目标

当前折叠是**每个 `ContextGroup` 的本地状态**(点组头切换;归档组默认折叠)。标签多时逐个折叠很累。目标:头部加一个按钮,**一键把「活跃任务 + 未分类」的所有组统一折叠 / 展开**。

范围(已确认):只影响**活跃任务 + 未分类**这两类 `ContextGroup`。归档组维持自己的默认(本就折叠)与本地切换,不受一键控制。重点区、陈旧区是列表,不涉及。

非目标:不持久化折叠状态(纯视图态,刷新即回默认展开);不改归档折叠行为。

## 现状(读码确认)

- `entrypoints/sidepanel/components/ContextGroup.tsx`:`const [collapsed, setCollapsed] = useState(variant === 'archived')`;组头 `onClick` 里 `if (!editing) setCollapsed((c) => !c)`。
- `entrypoints/sidepanel/App.tsx`:头部有 搜索(flex-1)/ + 新建 / 齿轮(设置);主列表按序渲染 StarredSection、`activeContexts.map` 的 `variant="active"`、inbox 的 `variant="inbox"`、StaleGroup、`archivedContexts.map` 的 `variant="archived"`。

## 设计

### 1. App:全局折叠开关

```ts
const [allCollapsed, setAllCollapsed] = useState(false); // false=展开
const toggleCollapseAll = () => setAllCollapsed((v) => !v);
```

### 2. 头部按钮

在 `+ 新建` 与 齿轮 之间(或 齿轮 左侧)加一个图标按钮:
- `onClick={toggleCollapseAll}`
- `aria-label` 与 `title`:`allCollapsed ? '全部展开' : '全部折叠'`
- 图标:一个「折叠/展开」示意图标(如上下双箭头相向 / 相背,或用 chevrons);随 `allCollapsed` 可旋转/切换,视觉上表达当前动作。
- 样式与齿轮按钮一致(`w-7 h-7 rounded-md opacity-60 hover:opacity-100 ...`)。

### 3. ContextGroup:接受一键信号

`Props` 增加可选 `collapseAll?: boolean`。组件内新增:

```ts
useEffect(() => {
  if (collapseAll !== undefined) setCollapsed(collapseAll);
}, [collapseAll]);
```

- 只有传了 `collapseAll`(活跃任务 + 未分类)的组会随一键翻转同步;`collapseAll` 每次在 App 里翻转都会触发该 effect。
- 归档组**不传** `collapseAll`(值为 `undefined`)→ effect 内的 guard 使其不受影响,保留默认折叠 + 本地切换。
- 单组点组头的本地 `setCollapsed` 仍在;下次一键会统一覆盖(符合「一键」语义)。

### 4. App 传参

给活跃任务与未分类的 `ContextGroup` 传 `collapseAll={allCollapsed}`;归档的**不传**。

可放进 `groupProps`?不行——`groupProps` 被三类共用,归档不应带。做法:活跃/未分类渲染处显式加 `collapseAll={allCollapsed}`,归档渲染处不加。

## 边界

- 一键折叠期间新建的任务(草稿)会以当前 `allCollapsed` 值挂载同步——草稿在编辑态,组头仍显示改名输入,折叠只影响(空的)标签列表,无碍。
- `allCollapsed` 是 App 内存态,快照更新不影响(组件按 id keyed,保持挂载)。

## 测试计划(TDD)

- `tests/context-group.test.tsx`:
  - 传 `collapseAll={false}` 渲染 → 标签(如某标签标题)可见;rerender 为 `collapseAll={true}` → 标签列表隐藏(collapsed)。
  - 不传 `collapseAll` 的归档组不受影响(可选:archived 变体默认折叠且不随外部变化)。
- 头部按钮 `aria-label` 随 `allCollapsed` 切换:App 层无组件测试,靠 tsc/build + 手动验证。

## 提交计划(分层)

1. `feat(sidepanel): 一键展开/折叠全部(活跃任务 + 未分类)`(ContextGroup collapseAll + App 按钮/状态 + 组件测试)
