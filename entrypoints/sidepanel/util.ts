import type { ContextColor, TabRecord } from '@/shared/types';
import { registrableDomain } from '@/core/clustering/signals';

/** 近似 Chrome 原生分组配色,用于侧边栏与原生 UI 视觉一致。 */
const COLOR_HEX: Record<ContextColor, string> = {
  grey: '#9aa0a6',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#188038',
  pink: '#d01884',
  purple: '#a142f4',
  cyan: '#12a4af',
  orange: '#fa903e',
};

export function colorHex(color: ContextColor): string {
  return COLOR_HEX[color];
}

/** 把字符串下载为文件。 */
export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 清理文件名中不安全的字符。 */
export function sanitizeFilename(name: string): string {
  return (name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'export').slice(0, 60);
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export interface Monogram {
  letter: string;
  color: string;
}

function firstAlnum(s: string): string {
  const m = s.match(/[a-z0-9]/i);
  return m ? m[0]!.toUpperCase() : '';
}

/**
 * 缺失/加载失败 favicon 时的字母字标兜底:
 * 域名(eTLD+1)首字母 + 域名哈希得到的稳定配色(同站永远同色);
 * 拿不到域名(file:// / about: 等)则用 fallback(标题)。纯函数,可单测。
 */
export function monogram(url: string, fallback = ''): Monogram {
  const host = hostname(url);
  const domain = host ? registrableDomain(host) : '';
  const key = domain || fallback.trim() || '?';
  const letter = firstAlnum(domain) || firstAlnum(fallback) || '?';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  return { letter, color: `hsl(${h % 360} 52% 48%)` };
}

/** "github.com ×4  stackoverflow.com ×2"(取出现最多的前 3 个域名) */
export function domainSummary(tabs: TabRecord[]): string {
  const counts = new Map<string, number>();
  for (const t of tabs) {
    const h = hostname(t.url);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h, n]) => `${h} ×${n}`)
    .join('  ');
}
