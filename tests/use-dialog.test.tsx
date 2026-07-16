// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useRef } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useDialog } from '@/entrypoints/sidepanel/hooks/useDialog';

afterEach(cleanup);

function Dialog({ onClose, esc }: { onClose: () => void; esc?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose, { esc });
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="测试弹窗">
      <button>里面的按钮</button>
    </div>
  );
}

describe('useDialog', () => {
  it('按 Esc → onClose', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('esc:false → 按 Esc 不关闭', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} esc={false} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
  it('容器有 dialog role 与 aria-modal', () => {
    render(<Dialog onClose={() => {}} />);
    const d = screen.getByRole('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('测试弹窗');
  });
});
