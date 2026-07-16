// 统一日志入口 —— 取代满仓静默的 `catch {}` / `.catch(() => {})`。
// logError:意外失败(存储写入失败、未知异常),始终输出,便于用户经控制台报 bug。
// logDebug:已知竞态(标签刚被关闭、面板已关 sendMessage 失败),仅开发期输出,不污染生产控制台。

const PREFIX = '[cairn-tabs]';

/** 开发期为 true(Vite/WXT 注入);测试与生产为 false。读取失败时按非开发处理。 */
function isDev(): boolean {
  try {
    return !!import.meta.env?.DEV;
  } catch {
    return false;
  }
}

/** 意外失败:始终 console.error,附 scope 便于定位。 */
export function logError(scope: string, err: unknown, ...ctx: unknown[]): void {
  console.error(`${PREFIX} ${scope}`, err, ...ctx);
}

/** 已知/可忽略竞态:仅开发期 console.debug,生产静默。 */
export function logDebug(scope: string, ...ctx: unknown[]): void {
  if (isDev()) console.debug(`${PREFIX} ${scope}`, ...ctx);
}
