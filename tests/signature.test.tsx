// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Signature } from '@/entrypoints/sidepanel/components/Signature';
import { AUTHOR, AUTHOR_URL } from '@/shared/meta';

afterEach(cleanup);

describe('Signature 署名水印', () => {
  it('渲染为链接:LyHn 艺术字,鎏金流光类,跳转作者 GitHub(新标签、noopener)', () => {
    render(<Signature />);
    const el = screen.getByRole('link', { name: `${AUTHOR} · GitHub` });
    expect(el.textContent).toBe('LyHn');
    expect(el.className).toContain('sig-shine');
    expect(el.getAttribute('href')).toBe(AUTHOR_URL);
    expect(el.getAttribute('target')).toBe('_blank');
    expect(el.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('透传 className 便于定位', () => {
    render(<Signature className="ml-auto" />);
    expect(screen.getByRole('link', { name: `${AUTHOR} · GitHub` }).className).toContain('ml-auto');
  });
});
