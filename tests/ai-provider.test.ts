import { describe, it, expect } from 'vitest';
import { anthropicProvider, openaiProvider, PROVIDERS } from '@/core/ai/provider';
import type { ChatRequest } from '@/core/ai/provider';

const req: ChatRequest = { system: 'S', user: 'U', model: 'm', maxTokens: 100 };

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('anthropicProvider', () => {
  it('请求塑形正确、取出文本', async () => {
    const { fn, calls } = fakeFetch(200, { content: [{ text: 'hello' }] });
    const out = await anthropicProvider.complete(req, 'sk-ant', fn);
    expect(out).toBe('hello');
    const call = calls[0]!;
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(JSON.parse(call.init.body as string).system).toBe('S');
  });
  it('非 2xx 抛错', async () => {
    const { fn } = fakeFetch(401, {});
    await expect(anthropicProvider.complete(req, 'k', fn)).rejects.toThrow();
  });
});

describe('openaiProvider', () => {
  it('请求塑形正确、取出文本', async () => {
    const { fn, calls } = fakeFetch(200, { choices: [{ message: { content: 'hi' } }] });
    const out = await openaiProvider.complete(req, 'sk-oai', fn);
    expect(out).toBe('hi');
    const call = calls[0]!;
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions');
    expect((call.init.headers as Record<string, string>).authorization).toBe('Bearer sk-oai');
    const msgs = JSON.parse(call.init.body as string).messages;
    expect(msgs[0]).toEqual({ role: 'system', content: 'S' });
    expect(msgs[1]).toEqual({ role: 'user', content: 'U' });
  });
});

describe('PROVIDERS', () => {
  it('两家默认模型', () => {
    expect(PROVIDERS.anthropic.defaultModel).toBe('claude-haiku-4-5');
    expect(PROVIDERS.openai.defaultModel).toBe('gpt-4o-mini');
  });
});
