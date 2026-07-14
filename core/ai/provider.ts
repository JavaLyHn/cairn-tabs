// AI Provider —— 各家 HTTP + 鉴权差异(F-13)。fetch 可注入以便单测。

import type { AIProviderId } from '@/shared/ai';

export interface ChatRequest {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  signal?: AbortSignal;
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

export const openaiProvider: AIProvider = {
  id: 'openai',
  defaultModel: 'gpt-4o-mini',
  host: 'https://api.openai.com/*',
  async complete(req, key, fetchImpl = fetch) {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
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
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('openai: no text');
    return text;
  },
};

export const PROVIDERS: Record<AIProviderId, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};
