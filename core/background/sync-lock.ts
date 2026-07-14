// 事件抑制锁 —— 我们自己发起的 tabs/tabGroups 操作期间暂停入站处理,防回环。
// 独立成模块,供 tab-sync 与 group-sync 共享,避免二者循环依赖。

let paused = 0;

export function pauseSync(): void {
  paused += 1;
}

export function resumeSync(): void {
  paused = Math.max(0, paused - 1);
}

export function isSyncPaused(): boolean {
  return paused > 0;
}

/** 在暂停态下执行一段异步操作,结束后恢复(即使抛错)。 */
export async function withSyncPaused<T>(fn: () => Promise<T>): Promise<T> {
  pauseSync();
  try {
    return await fn();
  } finally {
    resumeSync();
  }
}
