// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Signature } from '@/entrypoints/sidepanel/components/Signature';
import { AUTHOR } from '@/shared/meta';

afterEach(cleanup);

describe('Signature 署名水印', () => {
  it('渲染 LyHn 艺术字,带强调色类与 aria-label', () => {
    render(<Signature />);
    const el = screen.getByLabelText(AUTHOR);
    expect(el.textContent).toBe('LyHn');
    expect(el.className).toContain('text-accent');
  });

  it('透传 className 便于定位', () => {
    render(<Signature className="ml-auto" />);
    expect(screen.getByLabelText(AUTHOR).className).toContain('ml-auto');
  });
});
