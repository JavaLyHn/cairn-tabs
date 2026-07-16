// GitHub PR/Issue 元数据 —— 纯 URL 解析(F-09,见 PRD §7.4)。UI 与 SW 共用。
// 不调 API、不加权限、不发请求;只从 URL 稳定拿到「类型 + 编号 + owner/repo」。
// 状态(open/merged/closed)刻意不做:GitHub 标签标题通常不含状态词,靠标题解析不可靠。

import { escapeRegExp, stripTail } from './regex';

export interface GitHubRef {
  kind: 'pr' | 'issue';
  owner: string;
  repo: string;
  number: number;
}

/** 从 URL 解析 GitHub PR/Issue 引用;非此类链接返回 null。 */
export function parseGitHub(url: string): GitHubRef | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
  // /{owner}/{repo}/(pull|issues)/{number}[/...]  —— 容忍子路径(/files)、query、hash
  const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)(?:\/|$)/);
  if (!m) return null;
  const [, owner, repo, seg, num] = m; // 正则已匹配 → 各捕获组必定存在
  return { kind: seg === 'pull' ? 'pr' : 'issue', owner: owner!, repo: repo!, number: Number(num) };
}

/** "owner/repo",悬停时替代 hostname 显示。 */
export function repoSlug(ref: GitHubRef): string {
  return `${ref.owner}/${ref.repo}`;
}

/** 徽章文案:PR 带 "PR" 前缀,Issue 只有 "#编号"(与各自图标语义搭配)。 */
export function badgeLabel(ref: GitHubRef): string {
  return ref.kind === 'pr' ? `PR #${ref.number}` : `#${ref.number}`;
}

/**
 * 从 GitHub 冗长标题剥掉固定尾部,只留真正的标题。
 *   "Fix X by lyhn · Pull Request #482 · myorg/auth-service" → "Fix X"
 *   "Repro Y · Issue #212 · myorg/auth-service"              → "Repro Y"
 * 尾部锚定「编号 + owner/repo」,匹配不上则原样返回(不猜、不误删)。
 */
export function cleanGitHubTitle(title: string, ref: GitHubRef): string {
  const tail = new RegExp(
    `(?:\\s+by\\s+\\S.*?)?\\s*·\\s*(?:Pull Request|Issue)\\s*#${ref.number}\\s*·\\s*` +
      `${escapeRegExp(ref.owner)}/${escapeRegExp(ref.repo)}\\s*$`,
    'i',
  );
  return stripTail(title, tail);
}
