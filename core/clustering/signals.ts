// 聚簇信号提取(纯函数,见 PRD §6.2)。

// 精简版公共后缀表(近似 eTLD;完整需 Public Suffix List,但那要 ~200KB,对扩展过重)。
// 两类:① 国家/地区二级后缀;② 程序员常开的托管平台后缀 —— 后者让 alice.github.io 与
// bob.github.io 被识别为不同站点(各自 eTLD+1),避免聚簇/去重/同域升格把它们当成同一站。
const MULTI_SUFFIX = new Set([
  // 国家/地区
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'co.jp', 'com.au', 'net.au', 'co.nz', 'com.br', 'com.hk', 'co.in', 'com.tw', 'com.sg',
  'co.kr', 'com.mx', 'co.za', 'com.tr', 'co.id', 'com.vn', 'co.th', 'com.ua',
  // 托管平台(用户/项目子域各自独立)
  'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app',
  'web.app', 'firebaseapp.com', 'herokuapp.com', 'azurewebsites.net', 'fly.dev',
  'onrender.com', 'pythonanywhere.com', 'glitch.me', 'surge.sh', 'readthedocs.io',
  'gitpod.io', 'ngrok.io',
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
