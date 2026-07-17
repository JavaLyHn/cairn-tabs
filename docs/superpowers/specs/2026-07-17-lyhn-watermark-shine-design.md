# LyHn 署名水印 —— 鎏金流光动效

日期: 2026-07-17
状态: 已批准,待实现
关联: 2026-07-17-lyhn-watermark-design.md

## 目标

给页脚 LyHn 艺术字加「鎏金流光」动效:一道金色高光沿文字匀速扫过(V4)。

## 方案(纯 CSS)

`entrypoints/sidepanel/style.css` 新增:

```css
/* 作者署名水印:默认静态强调色;允许动效时鎏金流光扫过 */
.sig-shine {
  color: var(--color-accent);
  opacity: 0.85;
}
@media (prefers-reduced-motion: no-preference) {
  .sig-shine {
    background: linear-gradient(
      100deg,
      var(--color-accent) 30%,
      #ffe08a 45%,
      #fff6d8 50%,
      #ffe08a 55%,
      var(--color-accent) 70%
    );
    background-size: 220% auto;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    animation: sig-shine 3.4s linear infinite;
  }
  @keyframes sig-shine {
    to {
      background-position: 200% center;
    }
  }
}
```

- 边缘色 `var(--color-accent)` 跟随外观强调色;高光固定鎏金(#ffe08a/#fff6d8),即 V4「鎏金」质感。
- 减动用户 / 不支持时:退回静态强调色(`color: var(--color-accent)`,opacity .85),无动画。
- 与既有动效一致:门控在 `@media (prefers-reduced-motion: no-preference)`。

## 组件

`Signature.tsx`:`className` 由 `text-accent/70` 改为 `sig-shine`(颜色/透明度移入 CSS);
字体栈、斜体、字号、`aria-label`、无图标均不变。

## 测试

更新 `tests/signature.test.tsx`:断言类名含 `sig-shine`(替换原 `text-accent` 断言);
文本「LyHn」与 `aria-label` 断言保留。

## 非目标 / 取舍

- 不改位置/字体/图标。
- `background-clip:text` 在 Chromium 全支持(目标 Chrome/Edge),无兼容顾虑。
- 高光鎏金为固定色(不随强调色变),这是 V4 的设计意图。
