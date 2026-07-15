import { describe, it, expect } from 'vitest';
import { monogram } from '@/entrypoints/sidepanel/util';

describe('monogram(favicon 兜底字标)', () => {
  it('取域名(eTLD+1)首字母,大写', () => {
    expect(monogram('https://github.com/x').letter).toBe('G');
    expect(monogram('https://claude.ai/').letter).toBe('C');
  });

  it('子域归并到 eTLD+1 取首字母', () => {
    expect(monogram('https://docs.github.com/y').letter).toBe('G');
    expect(monogram('https://pagehub.elevatesphere.com/p/x').letter).toBe('E');
  });

  it('同域配色稳定、与路径无关', () => {
    const a = monogram('https://github.com/a');
    const b = monogram('https://github.com/b/c?q=1#h');
    expect(a.color).toBe(b.color);
    expect(a.color).toMatch(/^hsl\(\d+ 52% 48%\)$/);
  });

  it('拿不到域名(file://)→ 用 fallback 标题', () => {
    const m = monogram('file:///Users/me/notes.md', 'My Notes');
    expect(m.letter).toBe('M');
  });

  it('域名与标题都为空 → "?"', () => {
    expect(monogram('', '').letter).toBe('?');
  });

  it('域名优先于 fallback', () => {
    expect(monogram('https://stripe.com/x', 'Zebra').letter).toBe('S');
  });
});
