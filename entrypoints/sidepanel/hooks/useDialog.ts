import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/**
 * 弹窗可访问性:Esc 关闭(可关)、打开聚焦、Tab 焦点陷阱、关闭恢复焦点。
 * 用法:容器加 role="dialog" aria-modal aria-label 并挂 ref,调用 useDialog(ref, onClose)。
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts: { esc?: boolean } = {},
): void {
  const esc = opts.esc !== false;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // 打开:聚焦容器内首个可聚焦元素,否则聚焦容器本身
    const first = el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus?.();

    const onKey = (e: KeyboardEvent) => {
      if (esc && e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (n) => n.offsetParent !== null || n === document.activeElement,
        );
        if (items.length === 0) return;
        const firstEl = items[0]!;
        const lastEl = items[items.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.(); // 关闭:焦点还回去
    };
  }, [ref, onClose, esc]);
}
