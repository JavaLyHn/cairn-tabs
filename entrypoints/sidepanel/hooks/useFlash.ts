import { useRef, useState } from 'react';

/** 底部一过性提示 toast(1.8s 自动消失)。 */
export function useFlash(): { flash: string | null; showFlash: (msg: string) => void } {
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1800);
  };
  return { flash, showFlash };
}
