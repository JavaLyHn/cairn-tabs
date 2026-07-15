# Bitbucket PR/Issue 徽章 — 设计

日期:2026-07-15
状态:已通过设计评审,待实现

## 背景与目标

现有 F-09 只识别 GitHub PR/Issue(`shared/github.ts` 纯 URL 解析 + TabRow 徽章)。为 Bitbucket Cloud 增加对等能力:从 URL 稳定识别 PR/Issue,在标签行显示徽章(类型 + 编号),hover 显示 `workspace/repo`。

与 GitHub 完全对齐的取舍:**不调 API、不加权限、不发请求、不做状态**;纯本地 URL 解析。`parseGitHub` 目前只用于 TabRow 徽章(不参与聚簇),故 Bitbucket 也只做徽章。

非目标:Bitbucket Server(自托管,host 可变、PR 路径为 `/projects/.../repos/.../pull-requests/...`)不在本次范围,与「GitHub 只认 github.com、不认 GHE」一致。

## URL 格式(已核实)

Bitbucket Cloud 网页:
- PR:`https://bitbucket.org/{workspace}/{repo}/pull-requests/{id}`(可带 `/diff`、`/commits` 等子路径、query、hash)
- Issue:`https://bitbucket.org/{workspace}/{repo}/issues/{id}`(可带 `/slug` 子路径)

## 设计

### 1. `shared/bitbucket.ts`(镜像 `shared/github.ts`)

```ts
export interface BitbucketRef {
  kind: 'pr' | 'issue';
  workspace: string;
  repo: string;
  number: number;
}

/** 从 URL 解析 Bitbucket Cloud PR/Issue;非此类返回 null。 */
export function parseBitbucket(url: string): BitbucketRef | null;

/** "workspace/repo",hover 时替代 hostname。 */
export function bitbucketRepoSlug(ref: BitbucketRef): string;

/** 徽章文案:PR → "PR #n";Issue → "#n"(与 GitHub 一致)。 */
export function bitbucketBadgeLabel(ref: BitbucketRef): string;
```

`parseBitbucket` 细节:
- `new URL(url)` 失败 → null。
- host 必须是 `bitbucket.org` 或 `www.bitbucket.org`,否则 null。
- 路径正则:`^/([^/]+)/([^/]+)/(pull-requests|issues)/(\d+)(?:/|$)`;段 `pull-requests` → `pr`,`issues` → `issue`。
- 命中则返回 `{ kind, workspace, repo, number: Number(n) }`;否则 null。

### 2. TabRow 集成

`entrypoints/sidepanel/components/TabRow.tsx`:
- 识别顺序:localhost(project)优先 → GitHub(`parseGitHub`)→ 都不中再试 `parseBitbucket`。
- 命中 Bitbucket 时**复用现有 PR/Issue 徽章**(同一套通用 `PrIcon`/`IssueIcon`),徽章文案用 `bitbucketBadgeLabel`,`title` 与 hostname 兜底用 `bitbucketRepoSlug`。
- 不做标题清洗(见下)。为让渲染清晰,可在组件内归一出一个本地判定:先 `gh`,否则 `bb`,分支渲染各自 label/slug(不引入新抽象,保持与现有 `gh` 分支并列的小分支)。

### 3. 标题清洗:本次不做

GitHub 有 `cleanGitHubTitle` 剥长尾;Bitbucket 页面标题格式未确认。**本次显示徽章 + 原标题**(绝不误删)。待确认真实标题格式后,可另加一个「匹配不上则原样返回」的安全清洗器。

### 隐私/权限

纯本地 URL 解析,不出网、不加 host 权限。✓

## 测试计划(TDD)

- `tests/bitbucket.test.ts`(新建):
  - `parseBitbucket` 解析 PR、Issue;容忍 `/diff`、`/{slug}`、query、hash。
  - 非 bitbucket.org host → null;bitbucket.org 但非 PR/issue 路径(如 `/w/r/src/...`)→ null;非法 URL → null。
  - `www.bitbucket.org` 也识别。
  - `bitbucketRepoSlug` → `workspace/repo`;`bitbucketBadgeLabel` → `PR #n` / `#n`。
- `tests/tab-row.test.tsx`:一个 Bitbucket PR URL 的标签渲染出徽章(含 `PR #n` 文案)。

## 提交计划(分层)

1. `feat(bitbucket): 纯 URL 解析 Bitbucket PR/Issue`(shared/bitbucket.ts + 单测)
2. `feat(sidepanel): 标签行显示 Bitbucket PR/Issue 徽章`(TabRow 集成 + 组件测试)
