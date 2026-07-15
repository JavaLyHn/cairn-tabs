import { describe, it, expect } from 'vitest';
import {
  anthropicProvider,
  openaiProvider,
  customProvider,
  normalizeBaseUrl,
  permissionOriginFor,
  PROVIDERS,
} from '@/core/ai/provider';
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
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(call.init.body as string).system).toBe('S');
  });
  it('非 2xx 抛错', async () => {
    const { fn } = fakeFetch(401, {});
    await expect(anthropicProvider.complete(req, 'k', fn)).rejects.toThrow();
  });
});

describe('temperature 透传(用于稳定 AI 整理输出)', () => {
  it('设了 temperature 就进请求体(anthropic),含 0', async () => {
    const set = fakeFetch(200, { content: [{ text: 'x' }] });
    await anthropicProvider.complete({ ...req, temperature: 0 }, 'k', set.fn);
    expect(JSON.parse(set.calls[0]!.init.body as string).temperature).toBe(0);
  });
  it('没设 temperature 就不出现在请求体(anthropic)', async () => {
    const unset = fakeFetch(200, { content: [{ text: 'x' }] });
    await anthropicProvider.complete(req, 'k', unset.fn);
    expect('temperature' in JSON.parse(unset.calls[0]!.init.body as string)).toBe(false);
  });
  it('设了 temperature 就进请求体(openai 兼容),含 0', async () => {
    const s = fakeFetch(200, { choices: [{ message: { content: 'x' } }] });
    await openaiProvider.complete({ ...req, temperature: 0 }, 'k', s.fn);
    expect(JSON.parse(s.calls[0]!.init.body as string).temperature).toBe(0);
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
  it('非 2xx 抛错', async () => {
    const { fn } = fakeFetch(500, {});
    await expect(openaiProvider.complete(req, 'k', fn)).rejects.toThrow();
  });
});

describe('normalizeBaseUrl', () => {
  it('去掉尾部斜杠', () => {
    expect(normalizeBaseUrl('https://x.com/v1/')).toBe('https://x.com/v1');
    expect(normalizeBaseUrl('https://x.com/v1')).toBe('https://x.com/v1');
    expect(normalizeBaseUrl('https://x.com/v1///')).toBe('https://x.com/v1');
  });
});

describe('customProvider', () => {
  it('用 baseUrl 拼 endpoint、OpenAI 兼容塑形、Bearer', async () => {
    const { fn, calls } = fakeFetch(200, { choices: [{ message: { content: 'ok' } }] });
    const out = await customProvider.complete(
      { ...req, baseUrl: 'https://newapi.elevatesphere.com/v1' },
      'sk-relay',
      fn,
    );
    expect(out).toBe('ok');
    const call = calls[0]!;
    expect(call.url).toBe('https://newapi.elevatesphere.com/v1/chat/completions');
    expect((call.init.headers as Record<string, string>).authorization).toBe('Bearer sk-relay');
    const msgs = JSON.parse(call.init.body as string).messages;
    expect(msgs[0]).toEqual({ role: 'system', content: 'S' });
    expect(msgs[1]).toEqual({ role: 'user', content: 'U' });
  });
  it('baseUrl 尾斜杠被归一', async () => {
    const { fn, calls } = fakeFetch(200, { choices: [{ message: { content: 'ok' } }] });
    await customProvider.complete({ ...req, baseUrl: 'https://x.com/v1/' }, 'k', fn);
    expect(calls[0]!.url).toBe('https://x.com/v1/chat/completions');
  });
  it('缺 baseUrl → reject', async () => {
    const { fn } = fakeFetch(200, {});
    await expect(customProvider.complete(req, 'k', fn)).rejects.toThrow(/baseUrl/);
  });
  it('非 2xx 抛错', async () => {
    const { fn } = fakeFetch(404, {});
    await expect(
      customProvider.complete({ ...req, baseUrl: 'https://x.com/v1' }, 'k', fn),
    ).rejects.toThrow(/404/);
  });
});

describe('permissionOriginFor', () => {
  it('官方两档用固定 host', () => {
    expect(permissionOriginFor('anthropic')).toBe('https://api.anthropic.com/*');
    expect(permissionOriginFor('openai')).toBe('https://api.openai.com/*');
  });
  it('custom:由 baseUrl 派生 origin,剥掉路径', () => {
    expect(permissionOriginFor('custom', 'https://newapi.elevatesphere.com/v1')).toBe(
      'https://newapi.elevatesphere.com/*',
    );
    expect(permissionOriginFor('custom', 'https://x.com/v1/chat/completions')).toBe('https://x.com/*');
  });
  it('custom:剥掉凭据(userinfo)', () => {
    expect(permissionOriginFor('custom', 'https://user:pass@relay.example.com/v1')).toBe(
      'https://relay.example.com/*',
    );
  });
  it('custom:非法 URL 抛错', () => {
    expect(() => permissionOriginFor('custom', 'not a url')).toThrow(/合法 URL/);
    expect(() => permissionOriginFor('custom', '')).toThrow(/合法 URL/);
    expect(() => permissionOriginFor('custom', undefined)).toThrow(/合法 URL/);
  });
  it('custom:非 https 抛错', () => {
    expect(() => permissionOriginFor('custom', 'http://relay.example.com/v1')).toThrow(/https/);
  });
});

describe('PROVIDERS', () => {
  it('三家默认模型', () => {
    expect(PROVIDERS.anthropic.defaultModel).toBe('claude-haiku-4-5');
    expect(PROVIDERS.openai.defaultModel).toBe('gpt-4o-mini');
    expect(PROVIDERS.custom.defaultModel).toBe('gpt-4o-mini');
  });
});
