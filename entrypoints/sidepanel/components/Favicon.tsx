import { useEffect, useState } from 'react';
import { monogram } from '../util';

/** favicon:有图正常显示;缺图或加载失败(裂图)→ 域名/标题首字母字标兜底。 */
export function Favicon({
  url,
  title,
  faviconUrl,
  asleep = false,
}: {
  url: string;
  title: string;
  faviconUrl?: string;
  asleep?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [faviconUrl]); // 导航后 favicon 变了 → 重新尝试

  if (faviconUrl && !failed) {
    return (
      <img
        src={faviconUrl}
        alt=""
        onError={() => setFailed(true)}
        className={`w-4 h-4 shrink-0 rounded-sm ${asleep ? 'grayscale opacity-50' : ''}`}
      />
    );
  }
  const { letter, color } = monogram(url, title);
  return (
    <div
      aria-hidden
      style={{ backgroundColor: color }}
      className={`w-4 h-4 shrink-0 rounded-sm flex items-center justify-center
                  text-[9px] font-semibold leading-none text-white ${asleep ? 'opacity-40' : ''}`}
    >
      {letter}
    </div>
  );
}
