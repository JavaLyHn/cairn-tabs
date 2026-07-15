import { describe, it, expect } from 'vitest';
import { registrableDomain, hostnameOf } from '@/core/clustering/signals';

const reg = (url: string) => registrableDomain(hostnameOf(url));

describe('registrableDomain', () => {
  it('普通域名', () => {
    expect(reg('https://github.com/x')).toBe('github.com');
    expect(reg('https://docs.stripe.com/y')).toBe('stripe.com');
    expect(reg('https://a.b.example.com/')).toBe('example.com');
  });

  it('国家二级后缀', () => {
    expect(reg('https://foo.co.uk/')).toBe('foo.co.uk');
    expect(reg('https://sub.foo.co.uk/')).toBe('foo.co.uk');
    expect(reg('https://shop.com.cn/')).toBe('shop.com.cn');
    expect(reg('https://x.co.kr/')).toBe('x.co.kr');
  });

  it('托管平台:用户/项目子域各自独立(不再被当同站)', () => {
    expect(reg('https://alice.github.io/proj')).toBe('alice.github.io');
    expect(reg('https://bob.github.io/proj')).toBe('bob.github.io');
    expect(reg('https://alice.github.io')).not.toBe(reg('https://bob.github.io'));
    expect(reg('https://my-app.vercel.app/')).toBe('my-app.vercel.app');
    expect(reg('https://docs.pages.dev/')).toBe('docs.pages.dev');
    expect(reg('https://site.netlify.app/')).toBe('site.netlify.app');
    expect(reg('https://proj.web.app/')).toBe('proj.web.app');
  });

  it('多层子域下仍取托管后缀 + 一级', () => {
    expect(reg('https://foo.bar.alice.github.io/')).toBe('alice.github.io');
  });
});
