import { describe, it, expect } from 'vitest';
import { escapeRegExp, stripTail } from '@/shared/regex';

describe('escapeRegExp', () => {
  it('转义所有正则元字符', () => {
    expect(escapeRegExp('a.b*c+?')).toBe('a\\.b\\*c\\+\\?');
    expect(escapeRegExp('foo/bar-baz')).toBe('foo/bar-baz'); // / 与 - 非元字符
    expect(escapeRegExp('(x)[y]{z}')).toBe('\\(x\\)\\[y\\]\\{z\\}');
  });

  it('转义后可安全嵌入 RegExp 精确匹配', () => {
    const re = new RegExp(`^${escapeRegExp('a.b')}$`);
    expect(re.test('a.b')).toBe(true);
    expect(re.test('axb')).toBe(false); // . 不再是通配
  });
});

describe('stripTail', () => {
  it('匹配则剥掉尾缀并去空白', () => {
    expect(stripTail('Fix X · foo/bar', /\s*·\s*foo\/bar\s*$/)).toBe('Fix X');
  });

  it('不匹配则原样返回(去首尾空白)', () => {
    expect(stripTail('  Just a title  ', /· nope$/)).toBe('Just a title');
  });

  it('剥到空则回退原标题,不返回空串', () => {
    expect(stripTail('· foo/bar', /·\s*foo\/bar\s*$/)).toBe('· foo/bar');
  });
});
