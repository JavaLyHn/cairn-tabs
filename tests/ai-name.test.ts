import { describe, it, expect } from 'vitest';
import { buildNamePrompt, parseNameResponse } from '@/core/ai/organize';

describe('buildNamePrompt', () => {
  it('要求简短、只输出名字;user 带标题+域名', () => {
    const { system, user } = buildNamePrompt([
      { title: 'Fix login', domain: 'github.com' },
      { title: 'Auth docs', domain: 'stripe.com' },
    ]);
    expect(system).toContain('简短');
    expect(system).toContain('只输出');
    const u = JSON.parse(user);
    expect(u.tabs).toEqual([
      { title: 'Fix login', domain: 'github.com' },
      { title: 'Auth docs', domain: 'stripe.com' },
    ]);
  });
});

describe('parseNameResponse', () => {
  it('普通一行原样', () => {
    expect(parseNameResponse('前端调研')).toBe('前端调研');
  });
  it('去代码围栏', () => {
    expect(parseNameResponse('```\nAuth 重构\n```')).toBe('Auth 重构');
  });
  it('去首尾引号 / 书名号', () => {
    expect(parseNameResponse('"Auth 重构"')).toBe('Auth 重构');
    expect(parseNameResponse('「登录问题」')).toBe('登录问题');
  });
  it('多行取首行', () => {
    expect(parseNameResponse('支付接入\n(这些标签都关于支付)')).toBe('支付接入');
  });
  it('空 → null', () => {
    expect(parseNameResponse('')).toBeNull();
    expect(parseNameResponse('   \n  ')).toBeNull();
  });
  it('超长截断 40', () => {
    expect(parseNameResponse('x'.repeat(80))).toHaveLength(40);
  });
});
