# LyHn 署名水印 — 设计

日期: 2026-07-17
状态: 已批准,待实现

## 背景

作者想要一个专属「LyHn」艺术字水印。

**已与用户明确的技术真相**:客户端扩展所有代码/资源都下发到本地,F12 与解包目录可读可改,
**做不到「无法查看/修改」**。任何客户端防拆(混淆/自恢复/加密)只是减速带。真正「不可去除」
靠 **AGPL-3.0**(衍生作品法律上必须保留署名并同协议开源)。用户据此选择:**可见艺术字水印 +
依赖 AGPL**,不做防拆。

## 目标

- 主面板页脚右侧常驻一个克制的「LyHn」艺术字签名(纯艺术字,无图标)。
- 跟随外观强调色;明暗两模式适配。
- 署名与版权同一来源;补齐源码级 LyHn 版权署名(AGPL 牙齿)。

## 非目标

- 不做防拆/混淆/自恢复(已与用户对齐:客户端做不到真正不可改)。
- 不加图标、不做 i18n(专有名词 LyHn 不翻译)。
- 不改写 LICENSE 正文(AGPL 全文原样);版权以独立声明表达。

## 方案

### 1. 署名来源 `shared/meta.ts`(新增)
```ts
export const AUTHOR = 'LyHn';
export const COPYRIGHT = `© ${AUTHOR} · Cairn Tabs · AGPL-3.0`;
```
水印组件与(未来任何)版权展示都引用此处,单一来源。

### 2. 水印组件 `entrypoints/sidepanel/components/Signature.tsx`(新增)
- 渲染 `AUTHOR` 文本,手写签名字体栈:`'Snell Roundhand','Segoe Script','Brush Script MT', cursive`,
  斜体;`text-accent` + 约 70% 透明度(`text-accent/70`),`select-none`。
- `aria-label={AUTHOR}`。可接受 `className` 便于定位(如 `ml-auto`)。

### 3. 页脚接入 `App.tsx`
页脚改为 flex 一行:左侧归档/回收统计(原 `opacity-50` 移到统计 `<span>` 上),右侧
`<Signature className="ml-auto shrink-0" />`。仅主面板页脚出现(不入弹窗)。

### 4. 版权署名(AGPL 牙齿)
- 在 sidepanel 入口 `main.tsx` 顶部加简短 GPL 式版权注释(引用 LyHn + AGPL-3.0)。
- README 已含 `© JavaLyHn`,保持。

## 测试
- `tests/signature.test.tsx`:渲染 `<Signature/>` → 出现文本「LyHn」、带 `text-accent` 类、有
  `aria-label="LyHn"`。

## 风险 / 取舍
- 签名体跨平台不完全一致(mac: Snell Roundhand;Windows: Segoe Script;其余: 系统 cursive 兜底)。
  页脚小尺寸下可接受;如需像素级一致可后续转 SVG 路径(本环境无法目视校验路径,故先用字体栈)。
- 水印可被本地删改 —— 明确接受;法律层面由 AGPL 兜底。
