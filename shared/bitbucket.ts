// Bitbucket Cloud PR/Issue 元数据 —— 纯 URL 解析(对等 GitHub F-09)。UI 与 SW 共用。
// 不调 API、不加权限、不发请求;只从 URL 稳定拿到「类型 + 编号 + workspace/repo」。

export interface BitbucketRef {
  kind: 'pr' | 'issue';
  workspace: string;
  repo: string;
  number: number;
}

/** 从 URL 解析 Bitbucket Cloud PR/Issue 引用;非此类链接返回 null。 */
export function parseBitbucket(url: string): BitbucketRef | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== 'bitbucket.org' && u.hostname !== 'www.bitbucket.org') return null;
  // /{workspace}/{repo}/(pull-requests|issues)/{number}[/...] —— 容忍子路径、query、hash
  const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull-requests|issues)\/(\d+)(?:\/|$)/);
  if (!m) return null;
  const [, workspace, repo, seg, num] = m; // 正则匹配 → 各捕获组必定存在
  return {
    kind: seg === 'pull-requests' ? 'pr' : 'issue',
    workspace: workspace!,
    repo: repo!,
    number: Number(num),
  };
}

/** "workspace/repo",悬停时替代 hostname 显示。 */
export function bitbucketRepoSlug(ref: BitbucketRef): string {
  return `${ref.workspace}/${ref.repo}`;
}

/** 徽章文案:PR 带 "PR" 前缀,Issue 只有 "#编号"(与 GitHub 一致)。 */
export function bitbucketBadgeLabel(ref: BitbucketRef): string {
  return ref.kind === 'pr' ? `PR #${ref.number}` : `#${ref.number}`;
}
