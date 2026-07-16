# 质量提升批次(i18n / a11y / 导入 / 测试 / 工程债)— 设计

日期:2026-07-16
状态:待用户评审
范围:除「上架 Chrome 应用商店的材料(隐私政策托管、商店文案、截图/宣传图、提交流程)」外的全部优化项。

## 背景

三份实证盘点(代码健康 / 测试覆盖 / 产品·UX·分发)后,确认底子干净(零 TODO 债、领域逻辑测试扎实、隐私边界克制),值得优化的集中在**产品完成度**与**工程债**。README 已四语,但**应用 UI 仍纯中文**——这是最突出的缺口。

## 已确认的关键决定

- **i18n 机制**:自定义 React i18n + 应用内切换。语种 `en / zh-CN / ja / ko`,首次默认跟随浏览器界面语言(`chrome.i18n.getUILanguage()` 就近映射)、回退英文。manifest 描述/快捷键描述另用 `chrome.i18n` `_locales/` 本地化。
- **重构深度**:只做安全去重,不拆 `commands.ts` / `App.tsx` 大结构。
- **i18n 语言偏好存储**:界面语言是纯展示偏好,直接存 `chrome.storage.local`(键 `uiLocale`),面板挂载时读、切换时写——不走 SW 快照(避免切换闪帧)。这是对「SW 唯一写入方」的有意豁免:该不变量约束的是标签/任务领域态,不含 UI 外观偏好。

## 分期与顺序

先铺便宜的安全网/一致性(Phase 0)→ 最大的 UI 双改(Phase 1)→ 补功能(Phase 2)→ 补测试(Phase 3)。每期各自是可独立测试、可交付的一块,单独出实现计划、走 SDD。

---

## Phase 0 · 工程地基

### 0a. Lint + Prettier 基线(本期最先做)

先做,让后续所有代码即符合规范。

- 加 `eslint`(flat config + `typescript-eslint` recommended)、`prettier`、`eslint-config-prettier`。
- `package.json` 脚本:`lint`(eslint)、`format`(prettier --write)。
- Prettier 配置贴合现有风格:单引号、分号、2 空格、`printWidth: 100`(与现有代码一致)。
- 作用范围:`*.ts` `*.tsx` `*.json` `*.css`。**`.prettierignore` 排除 `*.md`**(README 手工排版不动)、`.output` `node_modules` `.wxt`。
- 规则务实:`typescript-eslint` recommended + `eslint-config-prettier` 关格式类规则;不开会迫使大改写的规则(如 `no-explicit-any` 设 warn)。先 `format` 全量、再修 eslint error。
- 交付:`pnpm lint` 与 `pnpm format` 通过;`pnpm compile` + `pnpm test` 仍绿。

### 0b. 错误日志 helper

根因:满仓静默 `catch {}` / `.catch(() => {})`(settings/commands/group-sync 等几十处),真失败无痕——「重启显示空」难查即源于此。

- 新增 `shared/log.ts`:
  - `logError(scope: string, err: unknown, ...ctx: unknown[]): void` —— 始终 `console.error('[cairn-tabs] ' + scope, err, ...ctx)`(扩展场景保留 prod 日志,便于用户报 bug)。
  - `logDebug(scope: string, ...ctx: unknown[]): void` —— 仅 `import.meta.env.DEV` 时输出。
- 替换策略(**不制造噪音**):
  - **意外失败**(存储写入失败、未知 catch)→ `logError`。重点:`settings.ts` 四处 `catch { /* 忽略写入失败 */ }`、`penalties.ts`、`useAiActions.ts:85` 的裸 `catch {}`。
  - **已知竞态**(标签刚被关闭、面板已关 sendMessage 失败)→ 保留静默但走 `logDebug` + 注释说明,不再是无声 `() => {}`。
- 交付:关键失败路径可在控制台看到来源;`pnpm test` 绿。

### 0c. 安全去重

- **`escapeRegExp`**:抽到新 `shared/regex.ts`(或并入既有 shared util);`github.ts`、`bitbucket.ts` 各自的 `escapeRe` 删除、改 import。
- **标题尾部剥离**:两文件里基于 `RegExp` 的 `cleanXTitle` 尾缀剥离逻辑抽公共 `stripTrailingSuffix(title, suffix)` 到 `shared/regex.ts`;两个解析器(host/path 逻辑确有差异)保持独立。
- **settings.ts 基类**:抽 `abstract class PersistedStore<T>`(`shared` 或 `core/background/persisted-store.ts`),封装 `load()`(`chrome.storage.local.get` → catch 走 `logError` + 回退默认)与 `persist()`(`set` → catch `logError`);`FlagsStore / MemoryStore / PortMappingStore / AISettingsStore` 继承,保留各自领域方法。
- 交付:`pnpm compile` + 既有 `ai-settings` / `discard` / `memory` / `github` / `bitbucket` 测试全绿(回归护栏)。

---

## Phase 1 · UI 国际化(i18n)+ 无障碍(a11y)

两者动同一批组件,合并一次过。

### 1a. i18n 基础设施

- 目录 `entrypoints/sidepanel/i18n/`:
  - `en.ts` 为**类型源**:`export const en = { ... } as const;`,导出 `export type Messages = typeof en;`。
  - `zh-CN.ts` / `ja.ts` / `ko.ts`:`const zhCN: Messages = { ... }` —— TS 强制键与 `en` 完全一致(漏键即编译错)。
  - 键用点分命名空间:`settings.*` `tabRow.*` `context.*` `search.*` `stats.*` `ai.error.*` 等。
  - 带参文案用占位:如 `stats.duplicates: '{n} 重复'`;`format(tpl, params)` 做 `{name}` 替换。
  - `locales.ts`:`SUPPORTED = ['en','zh-CN','ja','ko']`;`resolveInitialLocale()` 读 `chrome.i18n.getUILanguage()` 就近映射(`zh*`→`zh-CN`,`ja*`→`ja`,`ko*`→`ko`,余→`en`)。
  - `I18nContext` + `I18nProvider`(读 `chrome.storage.local` 的 `uiLocale`,无则 `resolveInitialLocale()`)+ `useT()` 返回 `t(key, params?)` 与 `locale` / `setLocale(next)`(写 storage + 更新 context + 设 `document.documentElement.lang`)。
- 语言切换 UI:`SettingsPanel` 顶部加「界面语言 / Language」段,选项以各自母语显示(English / 简体中文 / 日本語 / 한국어)。切换即时整树重渲染。

### 1b. 文案抽取(约 74 UI 串 + ~12 AI 错误串)

逐组件把硬编码中文替换为 `t('key')`。覆盖:`SettingsPanel`(15)、`ContextGroup`(12)、`App`(10,含搜索占位/新任务/整理全部/折叠全部/状态栏)、`TabRow`(7,含 aria-label)、`AIPlanDialog` `SearchOverlay` `StatsBar` `EmptyState` `UndoToast` `PortBindSuggestions` `DomainPromoteSuggestions` `StarredSection` `StaleGroup` 等。`useAiActions` 的错误文案由 `AI_ERROR.reason` 映射到 `t('ai.error.<reason>')`。`en.ts` 值为对现有中文的英译(与 README 口径一致)。

### 1c. manifest 本地化(chrome.i18n)

- 新增 `_locales/{en,zh_CN,ja,ko}/messages.json`(注意 chrome 目录名用下划线 `zh_CN`),含 `appName` `appDesc` `cmdOpenPanel` `cmdOpenSearch`。
- `wxt.config.ts`:`default_locale: 'en'`;`name`/`description`/命令 `description` 改 `__MSG_appName__` 等。
- 交付:装载后扩展页描述随浏览器语言变化;`pnpm build` 通过。

### 1d. a11y(与上述组件编辑同批完成)

- **可折叠分组头**(`ContextGroup` / `StaleGroup`):头部改可聚焦——`role="button"` + `tabIndex={0}` + `aria-expanded` + `onKeyDown`(Enter/Space 切换)。
- **标签行**(`TabRow`):容器加 `tabIndex={0}` + 合适 `role`;Enter 激活标签。(键盘拖拽换组是更大特性,本期不做,spec 记为后续。)
- **hover-only 操作**:`group-hover:*` 同时加 `group-focus-within:*`,键盘聚焦即显露改名/归档/删除/AI 按钮;图标按钮补 `aria-label`(走 i18n)。
- **toast/动态提示**:`UndoToast`、`App` 内联 flash、`PortBindSuggestions`、`DomainPromoteSuggestions` 加 `role="status"` + `aria-live="polite"`。
- **SearchOverlay**:结果列表 `role="listbox"`,项 `role="option"` + `aria-selected`。
- **焦点可见**:`style.css` 加全局 `:focus-visible` 描边(Tailwind preflight 清了默认)。
- **补 aria-label**:`AIPlanDialog` 组名输入、`StatsBar` 合并按钮、各建议行动作按钮(带上下文,如「绑定端口 3000」)。

### 交付
- 四语可在设置里切换,整树即时生效;读屏能播报确认/建议;键盘可展开分组、聚焦标签行、触达操作按钮。
- 新增/更新组件测试:i18n 渲染(切 locale 断言文案)、a11y(`aria-expanded`、键盘触发、`role` 存在)。`pnpm compile` + `test` + `build` 绿。

---

## Phase 2 · JSON 导入(补齐导出/导入闭环)

现状:`shared/export.ts` 注释「日后可导入」、`ExportDialog` 称 JSON 为「备份/迁移」,但**无导入入口**——单向。

### 设计(非破坏性合并 + 导入即归档)

- **校验(纯函数,可测)**:新增 `shared/import.ts`:`parseImport(raw: unknown): { ok: true; data: ImportPayload } | { ok: false; error: string }`,严格校验 v1 schema(`version===1`、`contexts[]`、`tabs[]`、可选 `portMappings`/`flags`),字段类型逐一检查,坏文件给人话错误。
- **应用走 SW(唯一写入方)**:新增命令 `IMPORT_DATA`(payload = 已校验数据)。`commands.ts` 在同步锁内 upsert:
  - **按 id 幂等 upsert**:已存在的 context id → 更新 name/status 并并入其 tabs(按 tab id 去重);新 id → 新增。
  - **不删除任何现有数据**(非破坏)。
  - **导入即归档**:导入的 context 一律置 `status: 'archived'`,其 tabs `chromeTabId: null`(旧的 chromeTabId/nativeGroupId 在本浏览器无意义)。→ 复用现有「恢复」链路让用户按需重开,零假 id。
  - 完成后 `reconcile` + 广播。
- **UI**:`ExportDialog`(或设置)加「导入 JSON」文件选择 → `FileReader` 读文本 → `parseImport` → 发 `IMPORT_DATA` → toast 反馈「已导入 N 个任务 / M 个标签(在『已归档』)」或错误。
- **隐私**:纯本地文件读写,不联网。

### 交付
- 导出的 JSON 可在另一环境/重装后导入,任务进「已归档」,一键恢复。
- 测试:`shared/import.ts` 单测(合法/各类非法输入);`IMPORT_DATA` 集成测试(upsert 幂等、导入即归档、不动既有数据)。

---

## Phase 3 · 测试补强

针对覆盖盘点里风险最高、且是本轮新写的逻辑。

### 3a. 会话恢复编排可测化 + 测试

- **小重构以可测**:把 `index.ts` 里 `runSessionRecovery` 的五步序列抽成纯编排函数 `runRecoverySequence(repo, onChange)` 置于 `core/background/session-recovery.ts`(与既有 `archiveUnrestoredContexts` 同居);`index.ts` 的 `runSessionRecovery` 仅负责置/清 `sessionRecovering` 标志与调它。
- **测**:用 spy 断言调用顺序严格为 `reconcile{purge:false}` → `reconcileGroups{prune:false}` → `archiveUnrestoredContexts` → `reconcile{purge:true}` → `reconcileGroups{prune:true}`。
- **宽限判定纯函数**:抽 `shouldPurgeNow(graceUntil, now): boolean`,单测边界(宽限内/外/无标志)。

### 3b. 面板 hook 测试(`renderHook`)

- `useDraftNaming`:commit 有效名发 `RENAME_CONTEXT`;空名/「新任务」不发但清编辑态;空草稿 `cancelEdit` 发 `DELETE_CONTEXT`;有标签草稿仅清编辑态。
- `useAiActions`:`aiBusy` 双击守卫;`aiOrganizeAll` 各 `AI_ERROR.reason` → flash 文案;`applyAiPlan{global}` → `setUndo` + 「已整理全部」;`saveAi` 权限被拒路径。
- `useDerived`:starred 排序(同组内 starred 优先);归档 context 含 stale 标签;`portSuggestions` 去重 + `ignoredPorts` 过滤;`domainSuggestions` 在 `autoCluster===false` 时早退。

### 3c. 既有集成测试补边界

- `ai-organize-all.integration.test.ts`:同一 tab 同时出现在 `newGroups` 与 `assign`(`before` 不被覆盖);`newGroups` 含 stale/archived tab;`undoReorg` 目标 context 为 archived 时不误移。
- `undo.test.ts`:TTL 到期后 `consume` 返回 `undefined`(fake timers)。

### 交付
- 新增测试全绿;`pnpm compile` + `test` + `build` 绿。恢复/AI 整理/撤销的高风险路径有回归护栏。

---

## 全局约束(每期通用)

- 中文交流;分层提交;提交信息尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`;**push 只在被要求时**。
- 架构不变量:SW 唯一写入方(UI 偏好 `uiLocale` 为记录在案的豁免);UI 只发命令 + 订阅快照;DB 只经 repositories;自发变更在同步锁内;命令幂等。
- 隐私 F-13 不变:AI 只发标题 + eTLD+1 域名 + 任务名;导入/导出纯本地。
- 每期结束 `pnpm compile` + `pnpm test` + `pnpm build` 必须全绿。

## 不做(YAGNI / 明确排除)

- 上架商店材料(隐私政策托管、商店文案、截图/宣传图、提交、CI 发布流程)。
- 拆 `commands.ts` / `App.tsx` 大结构。
- 键盘拖拽换组(a11y 仅到可聚焦 + Enter 激活)。
- Firefox 适配、跨设备同步(Roadmap v2)。
- 导入的「替换全部」模式(仅非破坏性合并)。
