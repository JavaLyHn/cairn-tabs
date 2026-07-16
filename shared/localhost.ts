// localhost 端口 → 项目名 映射的纯逻辑(F-08,见 PRD §7.3)。UI 与 SW 共用。

import type { PortMapping } from './types';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

/** 若是本地开发地址,返回端口号(默认端口按协议推断),否则 null。 */
export function localhostPort(url: string): number | null {
  try {
    const u = new URL(url);
    if (!LOCAL_HOSTS.has(u.hostname)) return null;
    const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    return Number.isFinite(port) ? port : null;
  } catch {
    return null;
  }
}

export function buildPortMap(mappings: PortMapping[]): Record<number, string> {
  const m: Record<number, string> = {};
  for (const { port, project } of mappings) m[port] = project;
  return m;
}

/** 该 URL 对应的项目名(已绑定的 localhost 端口),否则 null。 */
export function projectFor(url: string, portMap: Record<number, string>): string | null {
  const p = localhostPort(url);
  return p != null ? (portMap[p] ?? null) : null;
}

/** 从标签标题清洗出一个建议项目名(去掉 host:port 前缀、截断)。 */
export function suggestProjectName(title: string, port: number): string {
  let t = (title || '').trim();
  // 去掉常见的 "localhost:3000" / "127.0.0.1:3000" 前缀噪声
  t = t.replace(/^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?[/\s|·-]*/i, '').trim();
  if (!t) return `localhost-${port}`;
  return t.length > 20 ? t.slice(0, 20) : t;
}
