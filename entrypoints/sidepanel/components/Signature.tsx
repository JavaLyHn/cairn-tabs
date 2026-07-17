import { AUTHOR, AUTHOR_URL } from '@/shared/meta';

// 作者署名水印:页脚常驻的「LyHn」艺术字(手写签名体,鎏金流光动效,跟随外观强调色)。
// 点击在新标签打开作者 GitHub 主页。客户端本地可改;真正的不可去除由 AGPL-3.0 在法律层面保障。
export function Signature({ className = '' }: { className?: string }) {
  return (
    <a
      href={AUTHOR_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${AUTHOR} · GitHub`}
      title={`${AUTHOR} · GitHub`}
      className={`sig-shine select-none leading-none cursor-pointer ${className}`}
      style={{
        fontFamily: "'Snell Roundhand', 'Segoe Script', 'Brush Script MT', cursive",
        fontStyle: 'italic',
        fontSize: '16px',
      }}
    >
      {AUTHOR}
    </a>
  );
}
