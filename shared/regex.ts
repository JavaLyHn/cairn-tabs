// 动态拼 RegExp 的共用小工具(github.ts / bitbucket.ts 等复用)。

/** 转义正则元字符,使字符串可安全嵌入 RegExp。 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 用尾部正则从标题剥掉固定尾缀,只留真正标题。
 * 剥没了(空)或没匹配上则返回原标题(去首尾空白)—— 不猜、不误删。
 */
export function stripTail(title: string, tail: RegExp): string {
  const t = (title || '').trim();
  const stripped = t.replace(tail, '').trim();
  return stripped || t;
}
