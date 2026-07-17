import { AUTHOR } from '@/shared/meta';

// 作者署名水印:页脚常驻的「LyHn」艺术字(手写签名体,跟随外观强调色)。
// 客户端本地可改;真正的不可去除由 AGPL-3.0 在法律层面保障(见 shared/meta.ts)。
export function Signature({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label={AUTHOR}
      className={`select-none leading-none text-accent/70 ${className}`}
      style={{
        fontFamily: "'Snell Roundhand', 'Segoe Script', 'Brush Script MT', cursive",
        fontStyle: 'italic',
        fontSize: '16px',
      }}
    >
      {AUTHOR}
    </span>
  );
}
