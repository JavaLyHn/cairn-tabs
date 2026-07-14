// AI Provider —— 各家 HTTP + 鉴权差异(F-13)。fetch 可注入以便单测。

import type { AIProviderId } from '@/shared/ai';

export interface ChatRequest {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  signal?: AbortSignal;
  /** 自定义中转站的接口地址(base,如 https://host/v1);仅 custom 使用。 */
  baseUrl?: string;
}

/** 去掉尾部斜杠(`.../v1/` → `.../v1`),用于拼接中转站 endpoint。 */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export interface AIProvider {
  id: AIProviderId;
  defaultModel: string;
  host: string; // optional host permission 匹配串
  complete(req: ChatRequest, key: string, fetchImpl?: typeof fetch): Promise<string>;
}

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  defaultModel: 'claude-haiku-4-5',
  host: 'https://api.anthropic.com/*',
  async complete(req, key, fetchImpl = fetch) {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      }),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data = (await res.json()) as { content?: { text?: unknown }[] };
    const text = data?.content?.[0]?.text;
    if (typeof text !== 'string') throw new Error('anthropic: no text');
    return text;
  },
};

/** OpenAI 兼容的请求塑形 + 取文本(官方 OpenAI 与自定义中转站共用)。 */
async function postOpenAIChat(
  url: string,
  req: ChatRequest,
  key: string,
  fetchImpl: typeof fetch,
  label: string,
): Promise<string> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    }),
    signal: req.signal,
  });
  if (!res.ok) throw new Error(`${label} ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error(`${label}: no text`);
  return text;
}

export const openaiProvider: AIProvider = {
  id: 'openai',
  defaultModel: 'gpt-4o-mini',
  host: 'https://api.openai.com/*',
  complete(req, key, fetchImpl = fetch) {
    return postOpenAIChat('https://api.openai.com/v1/chat/completions', req, key, fetchImpl, 'openai');
  },
};

// 自定义中转站(OpenAI 兼容):endpoint 由用户所填 baseUrl 派生。
// host 用宽匹配串仅作文档;实际运行时权限按 baseUrl 的 origin 派生、带用户手势申请。
export const customProvider: AIProvider = {
  id: 'custom',
  defaultModel: 'gpt-4o-mini',
  host: 'https://*/*',
  async complete(req, key, fetchImpl = fetch) {
    if (!req.baseUrl) throw new Error('custom: no baseUrl');
    const url = `${normalizeBaseUrl(req.baseUrl)}/chat/completions`;
    return postOpenAIChat(url, req, key, fetchImpl, 'custom');
  },
};

export const PROVIDERS: Record<AIProviderId, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  custom: customProvider,
};

/**
 * 该 provider 运行时需申请的 host 权限匹配串。
 * 官方两档用固定 host;custom 由所填 baseUrl 的 origin 派生(仅 https,自动剥掉路径/凭据)。
 * baseUrl 非法或非 https 时抛错(供 UI 在申请权限前拦截)。
 */
export function permissionOriginFor(provider: AIProviderId, baseUrl?: string): string {
  if (provider !== 'custom') return PROVIDERS[provider].host;
  let parsed: URL;
  try {
    parsed = new URL((baseUrl ?? '').trim());
  } catch {
    throw new Error('接口地址不是合法 URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('接口地址需为 https');
  return `${parsed.origin}/*`;
}
