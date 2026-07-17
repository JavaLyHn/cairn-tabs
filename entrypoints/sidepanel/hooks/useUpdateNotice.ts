import { useEffect, useRef } from 'react';
import { appVersion } from '@/shared/meta';
import { logDebug } from '@/shared/log';

const LAST_SEEN_KEY = 'lastSeenVersion';

/** 是否应提示更新:有旧版本记录、当前版本非空、且两者不同(纯函数,可单测)。 */
export function shouldNoticeUpdate(last: string | undefined, current: string): boolean {
  return typeof last === 'string' && !!current && last !== current;
}

/**
 * 版本变化感知(纯本地):挂载时比对当前版本与 chrome.storage.local 里的上次所见版本。
 * 升级则回调 onUpdated(触发提示);只要与当前不同就写回当前版本(首次安装静默记录、不提示)。
 */
export function useUpdateNotice(onUpdated: (version: string) => void): void {
  const cbRef = useRef(onUpdated);
  cbRef.current = onUpdated;
  useEffect(() => {
    const current = appVersion();
    if (!current) return;
    chrome.storage.local
      .get(LAST_SEEN_KEY)
      .then((r) => {
        const last = r[LAST_SEEN_KEY] as string | undefined;
        if (shouldNoticeUpdate(last, current)) cbRef.current(current);
        if (last !== current) void chrome.storage.local.set({ [LAST_SEEN_KEY]: current });
      })
      .catch((e) => logDebug('updateNotice.load', e));
  }, []);
}
