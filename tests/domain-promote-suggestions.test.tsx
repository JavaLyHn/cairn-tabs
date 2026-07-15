// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DomainPromoteSuggestions } from '@/entrypoints/sidepanel/components/DomainPromoteSuggestions';

afterEach(cleanup);

describe('DomainPromoteSuggestions', () => {
  it('无建议 → 不渲染', () => {
    const { container } = render(
      <DomainPromoteSuggestions suggestions={[]} onPromote={() => {}} onIgnore={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('渲染域名+数量;成簇/忽略回调携带正确参数', () => {
    const onPromote = vi.fn();
    const onIgnore = vi.fn();
    render(
      <DomainPromoteSuggestions
        suggestions={[{ domain: 'stripe.com', tabIds: ['a', 'b', 'c'] }]}
        onPromote={onPromote}
        onIgnore={onIgnore}
      />,
    );
    expect(screen.getByText('stripe.com')).toBeTruthy();
    expect(screen.getByText(/3 个/)).toBeTruthy();

    fireEvent.click(screen.getByText('归类'));
    expect(onPromote).toHaveBeenCalledWith('stripe.com', ['a', 'b', 'c']);

    fireEvent.click(screen.getByText('忽略'));
    expect(onIgnore).toHaveBeenCalledWith('stripe.com');
  });
});
