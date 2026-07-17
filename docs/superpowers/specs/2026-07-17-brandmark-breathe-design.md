# 空状态页字标「呼吸微光」动效

日期:2026-07-17
状态:已确认(用户选定 D 呼吸微光 + 空状态页)

## 背景与澄清

用户希望给「叠石图标 + Cairn Tabs」字标加动态效果(和页脚 LyHn 鎏金流光同类)。

**重要澄清:** 用户截图里的字标是 **Chrome 侧边栏顶部的标题栏**——浏览器按 manifest 的
扩展图标(静态 PNG)+ 扩展名自行渲染,扩展代码无法访问该 UI,**无法为其添加 CSS 动效**。
这与「F12 无法篡改水印」属同类客户端限制,已如实告知用户。

因此改为在**面板内部**(我们完全可控的文档)放一个自有的动效字标。用户在网页 mockup
(4 选 1)中选定:

- **动效:D 呼吸微光** —— 图标背后一圈青绿光晕缓缓明灭,文字不动。最低调。
- **位置:空状态页** —— 没有任何标签/任务时,面板中央的品牌区。不与 Chrome 顶栏重复喧宾夺主。

## 设计

### 组件:`BrandMark`(新增)

`entrypoints/sidepanel/components/BrandMark.tsx`

- 内联 SVG 叠石图标(3 个圆角矩形,几何同 `.github/assets/logo.svg`),`fill` 走
  `var(--color-accent)` → 随外观强调色 / 深浅主题变化,矢量清晰。
- 图标外包一层 `.brand-breathe` 容器,用 `::before` 放射状青绿光晕(`--color-accent`),
  仅在 `prefers-reduced-motion: no-preference` 下做 opacity + scale 的明灭动画。
- 文字 `Cairn Tabs` 取自 `shared/meta` 的 `APP_NAME`(单一来源),静态。
- 纯展示组件,无 props(或仅 `className`);不触碰 DB / SW / store。
- 图标 `aria-hidden`,字标文字本身即可读;不额外加 alt。

### 空状态页改造

`EmptyState.tsx`:把当前静态 `<img src="icon/128.png">` 换成 `<BrandMark />`
(图标 + 呼吸光晕 + Cairn Tabs 字标),其下保留 heading / body / 新建按钮 / 搜索提示不变。

### 样式

`style.css` 新增 `.brand-breathe`(沿用 `.sig-shine` 的写法约定):

- 默认(含 reduced-motion 兜底):光晕静止、低透明度,保证无障碍下仍是完整品牌区。
- `@media (prefers-reduced-motion: no-preference)`:`@keyframes brand-breathe`
  让 `::before` 光晕在 ~3.4s 周期内 opacity/scale 缓缓明灭。

### 无障碍

- `prefers-reduced-motion: reduce` → 光晕静止(不闪不缩)。
- 图标装饰性 `aria-hidden`,不干扰读屏;文字 `Cairn Tabs` 正常朗读。

## 不做(YAGNI)

- 不动 Chrome 侧栏标题栏(无法访问)。
- 不加到 App 顶栏(与 Chrome 顶栏重复且顶栏已挤)。
- 不引入新 i18n key(`Cairn Tabs` 是品牌名,非可翻译文案)。

## 测试

- `tests/brandmark.test.tsx`(新增):
  - 渲染 `Cairn Tabs` 字标文字;
  - 渲染内联 `<svg>` 图标(而非 `<img>` PNG),避免裂图 / 主题不适配;
  - 存在 `.brand-breathe` 光晕容器。
- 复用现有 EmptyState 相关断言(若有)保持通过。

## 架构一致性

纯前端展示,不涉及 SW / 仓储 / 命令流;`APP_NAME` 来自 `shared/meta` 单一来源;
动效经 `prefers-reduced-motion` 守卫。符合既有约定。
