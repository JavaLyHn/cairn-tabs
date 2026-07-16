import { describe, it, expect } from 'vitest';
import { parseGitHub, badgeLabel, repoSlug, cleanGitHubTitle } from '@/shared/github';

describe('parseGitHub', () => {
  it('解析 PR', () => {
    expect(parseGitHub('https://github.com/myorg/auth-service/pull/482')).toEqual({
      kind: 'pr',
      owner: 'myorg',
      repo: 'auth-service',
      number: 482,
    });
  });

  it('解析 Issue', () => {
    expect(parseGitHub('https://github.com/myorg/auth-service/issues/212')).toEqual({
      kind: 'issue',
      owner: 'myorg',
      repo: 'auth-service',
      number: 212,
    });
  });

  it('容忍子路径 / query / hash', () => {
    expect(parseGitHub('https://github.com/a/b/pull/5/files?w=1#diff')).toMatchObject({
      kind: 'pr',
      number: 5,
    });
    expect(parseGitHub('https://github.com/a/b/issues/9#issuecomment-1')).toMatchObject({
      number: 9,
    });
  });

  it('www.github.com 也识别', () => {
    expect(parseGitHub('https://www.github.com/a/b/pull/1')).toMatchObject({
      owner: 'a',
      repo: 'b',
    });
  });

  it('非 PR/Issue 的 GitHub 页返回 null', () => {
    expect(parseGitHub('https://github.com/myorg/auth-service')).toBeNull();
    expect(parseGitHub('https://github.com/myorg/auth-service/tree/main/src')).toBeNull();
    expect(parseGitHub('https://github.com/pulls')).toBeNull();
  });

  it('非 github / 非法 URL 返回 null', () => {
    expect(parseGitHub('https://gitlab.com/a/b/pull/1')).toBeNull();
    expect(parseGitHub('https://gist.github.com/a/b')).toBeNull();
    expect(parseGitHub('not a url')).toBeNull();
  });
});

describe('badgeLabel / repoSlug', () => {
  it('PR 带前缀,Issue 只有编号', () => {
    const pr = parseGitHub('https://github.com/a/b/pull/7')!;
    const issue = parseGitHub('https://github.com/a/b/issues/8')!;
    expect(badgeLabel(pr)).toBe('PR #7');
    expect(badgeLabel(issue)).toBe('#8');
    expect(repoSlug(pr)).toBe('a/b');
  });
});

describe('cleanGitHubTitle', () => {
  it('剥掉 PR 标题尾部(含 by 作者)', () => {
    const ref = parseGitHub('https://github.com/myorg/auth-service/pull/482')!;
    expect(
      cleanGitHubTitle(
        'Fix auth redirect loop on token refresh by lyhn · Pull Request #482 · myorg/auth-service',
        ref,
      ),
    ).toBe('Fix auth redirect loop on token refresh');
  });

  it('剥掉 Issue 标题尾部', () => {
    const ref = parseGitHub('https://github.com/myorg/auth-service/issues/212')!;
    expect(
      cleanGitHubTitle(
        'JWT expiry ignored behind reverse proxy · Issue #212 · myorg/auth-service',
        ref,
      ),
    ).toBe('JWT expiry ignored behind reverse proxy');
  });

  it('匹配不上尾部时保留原标题', () => {
    const ref = parseGitHub('https://github.com/a/b/pull/1')!;
    expect(cleanGitHubTitle('自定义标题', ref)).toBe('自定义标题');
  });
});
