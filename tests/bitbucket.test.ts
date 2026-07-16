import { describe, it, expect } from 'vitest';
import { parseBitbucket, bitbucketRepoSlug, bitbucketBadgeLabel, cleanBitbucketTitle } from '@/shared/bitbucket';

describe('parseBitbucket', () => {
  it('解析 PR', () => {
    expect(parseBitbucket('https://bitbucket.org/acme/app/pull-requests/42')).toEqual({
      kind: 'pr', workspace: 'acme', repo: 'app', number: 42,
    });
  });
  it('解析 Issue', () => {
    expect(parseBitbucket('https://bitbucket.org/acme/app/issues/7')).toEqual({
      kind: 'issue', workspace: 'acme', repo: 'app', number: 7,
    });
  });
  it('容忍子路径 / query / hash', () => {
    expect(parseBitbucket('https://bitbucket.org/acme/app/pull-requests/42/diff?x=1#c')?.number).toBe(42);
    expect(parseBitbucket('https://bitbucket.org/acme/app/issues/7/some-slug')?.kind).toBe('issue');
  });
  it('www.bitbucket.org 也识别', () => {
    expect(parseBitbucket('https://www.bitbucket.org/a/b/pull-requests/1')?.workspace).toBe('a');
  });
  it('非 bitbucket.org → null', () => {
    expect(parseBitbucket('https://github.com/a/b/pull/1')).toBeNull();
  });
  it('bitbucket.org 但非 PR/issue 路径 → null', () => {
    expect(parseBitbucket('https://bitbucket.org/acme/app/src/main')).toBeNull();
    expect(parseBitbucket('https://bitbucket.org/acme/app/pull-requests')).toBeNull(); // 无编号
  });
  it('非法 URL → null', () => {
    expect(parseBitbucket('not a url')).toBeNull();
  });
});

describe('bitbucketRepoSlug / bitbucketBadgeLabel', () => {
  const pr = parseBitbucket('https://bitbucket.org/acme/app/pull-requests/42')!;
  const issue = parseBitbucket('https://bitbucket.org/acme/app/issues/7')!;
  it('slug', () => expect(bitbucketRepoSlug(pr)).toBe('acme/app'));
  it('PR label', () => expect(bitbucketBadgeLabel(pr)).toBe('PR #42'));
  it('Issue label', () => expect(bitbucketBadgeLabel(issue)).toBe('#7'));
});

describe('cleanBitbucketTitle', () => {
  const pr = parseBitbucket('https://bitbucket.org/antalphadev/ai-skills-library/pull-requests/1022')!;
  it('剥掉「— repo — Bitbucket」尾', () => {
    const raw = 'fix(hermes): set default so requests stop truncating — ai-skills-library — Bitbucket';
    expect(cleanBitbucketTitle(raw, pr)).toBe('fix(hermes): set default so requests stop truncating');
  });
  it('尾部不匹配 → 原样返回', () => {
    expect(cleanBitbucketTitle('普通标题没有尾', pr)).toBe('普通标题没有尾');
  });
  it('剥完为空 → 返回原标题', () => {
    const raw = '— ai-skills-library — Bitbucket';
    expect(cleanBitbucketTitle(raw, pr)).toBe(raw);
  });
});
