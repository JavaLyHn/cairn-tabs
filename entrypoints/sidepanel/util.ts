import type { ContextColor, TabRecord } from '@/shared/types';

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

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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
