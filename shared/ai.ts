// AI 整理未分类的共享类型(F-13,见 spec)。UI 与 SW 共用。

export type AIProviderId = 'anthropic' | 'openai' | 'custom';

/**
 * AI 提案:新建分组 + 并入已有任务;未提及的标签留在原处。
 * unclear:AI 拿不准归属、刻意不归类的标签(保持原位)+ 一句理由,供 UI 提示。
 * 可选(既有 Command/测试字面量无需带);消费方一律用 `plan.unclear ?? []`。
 */
export interface AIPlan {
  newGroups: { name: string; tabIds: string[] }[];
  assign: { taskId: string; tabIds: string[] }[];
  unclear?: { tabId: string; reason: string }[];
}

/** 脱敏状态,随快照广播给 UI —— 永不含 key(baseUrl 非机密,用于 UI 回填)。 */
export interface AIStatus {
  provider: AIProviderId;
  hasKey: boolean;
  model: string;
  baseUrl?: string;
}

export type AIErrorReason = 'no_key' | 'permission' | 'network' | 'parse' | 'empty' | 'cancelled';

/** 用户主动取消在飞 AI 请求的标记错误 —— 与超时/网络失败(同为 AbortError)区分。 */
export class AICancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AICancelledError';
  }
}

/** 判定是否用户主动取消(按 name,跨模块打包稳)。 */
export function isAICancelled(e: unknown): boolean {
  return e instanceof Error && e.name === 'AICancelledError';
}

/**
 * 把底层调用错误(状态码 / abort / 网络)翻成中文人话,用于「测试连接」的即时反馈。
 * 纯函数,便于单测。
 */
export function friendlyAIError(message: string): string {
  const m = message.match(/\b(\d{3})\b/);
  const code = m ? Number(m[1]) : 0;
  if (code === 401 || code === 403) return `认证失败(${code})—— 检查 API key`;
  if (code === 404) return '地址或模型不存在(404)—— 检查接口地址与模型名';
  if (code === 429) return '被限流(429)—— 稍后再试';
  if (code >= 500 && code < 600) return `服务端错误(${code})`;
  if (/abort/i.test(message)) return '连接超时';
  if (/no text|parse/i.test(message)) return '响应格式异常(可能不是兼容接口)';
  if (/failed to fetch|network/i.test(message)) return '网络错误 —— 检查地址是否可达';
  return message;
}
