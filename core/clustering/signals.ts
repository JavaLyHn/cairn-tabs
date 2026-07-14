// 聚簇信号提取(纯函数,见 PRD §6.2)。

// 已知的多段公共后缀(近似 eTLD;完整实现需 Public Suffix List,MVP 够用)
const MULTI_SUFFIX = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'co.jp', 'com.au', 'net.au', 'co.nz', 'com.br', 'com.hk', 'co.in', 'com.tw', 'com.sg',
]);

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/** 近似注册域(eTLD+1):example.com、sub.example.co.uk → example.co.uk。 */
export function registrableDomain(hostname: string): string {
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_SUFFIX.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

/** 两个路径的前缀重合度 [0,1](同 repo/同目录越深越高)。 */
export function pathOverlap(a: string, b: string): number {
  const pa = a.split('/').filter(Boolean);
  const pb = b.split('/').filter(Boolean);
  if (pa.length === 0 || pb.length === 0) return 0;
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  return i / Math.max(pa.length, pb.length);
}
