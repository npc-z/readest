import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const validateUserAndTokenMock = vi.hoisted(() => vi.fn());
vi.mock('@/utils/access', () => ({
  validateUserAndToken: (...args: unknown[]) => validateUserAndTokenMock(...args),
}));

const generateTextMock = vi.hoisted(() => vi.fn());
const createGatewayMock = vi.hoisted(() => vi.fn());
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  createGateway: (...args: unknown[]) => createGatewayMock(...args),
}));

import { POST } from '@/app/api/ai/explain/route';

const authed = { user: { id: 'u1' }, token: 'test-token' };

const makeReq = (body: unknown, authorization: string | null = 'Bearer test-token'): NextRequest =>
  new NextRequest('https://web.readest.com/api/ai/explain', {
    method: 'POST',
    headers: {
      ...(authorization ? { authorization } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  validateUserAndTokenMock.mockReset().mockResolvedValue(authed);
  generateTextMock.mockReset();
  createGatewayMock
    .mockReset()
    .mockReturnValue(vi.fn(() => ({ id: 'mock-model', provider: 'gateway' })));
  vi.stubEnv('AI_GATEWAY_API_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/ai/explain', () => {
  it('returns 403 when unauthenticated before reading the body', async () => {
    validateUserAndTokenMock.mockResolvedValue({});
    const request = makeReq({ text: 'Hello', sourceLang: 'en', nativeLang: 'zh-CN' });
    const textSpy = vi.spyOn(request, 'json');

    const res = await POST(request);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Not authenticated' });
    expect(textSpy).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('returns invalid-input for empty text', async () => {
    const res = await POST(makeReq({ text: '', sourceLang: 'en', nativeLang: 'zh-CN' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'invalid-input' } });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('returns invalid-input when a language is missing', async () => {
    const res = await POST(makeReq({ text: 'Hello', nativeLang: 'zh-CN' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'invalid-input' } });
  });

  it('returns invalid-input for meaningless text', async () => {
    const res = await POST(makeReq({ text: '!!! — …', sourceLang: 'en', nativeLang: 'zh-CN' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'invalid-input' } });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('returns ai-not-configured when no api key is provided', async () => {
    const res = await POST(makeReq({ text: 'Hello world', sourceLang: 'en', nativeLang: 'zh-CN' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'ai-not-configured' } });
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(createGatewayMock).not.toHaveBeenCalled();
  });

  it('builds the versioned system prompt server-side, forwards reasoning, and returns raw generation', async () => {
    generateTextMock.mockResolvedValue({ text: '{"simple":"hi"}' });

    const res = await POST(
      makeReq({
        text: 'Hello world',
        sourceLang: 'en',
        nativeLang: 'zh-CN',
        thinking: 'high',
        apiKey: 'client-key',
        model: 'google/gemini-2.5-flash-lite',
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: '{"simple":"hi"}' });

    expect(createGatewayMock).toHaveBeenCalledWith({ apiKey: 'client-key' });
    const {
      system,
      prompt,
      model,
      temperature,
      maxOutputTokens,
      maxRetries,
      abortSignal,
      providerOptions,
    } = generateTextMock.mock.calls[0]![0];
    expect(model).toEqual({ id: 'mock-model', provider: 'gateway' });
    expect(system).toContain('IDENTITY');
    expect(system).toContain('"promptVersion": 1');
    expect(prompt).toBe('<INPUT_TEXT>\nHello world\n</INPUT_TEXT>');
    expect(temperature).toBe(0.2);
    expect(maxOutputTokens).toBe(4096);
    expect(maxRetries).toBe(2);
    expect(abortSignal).toBeInstanceOf(AbortSignal);
    expect(providerOptions).toEqual({ gateway: { reasoningEffort: 'high' } });
  });

  it('re-truncates over-limit input server-side before calling the model', async () => {
    generateTextMock.mockResolvedValue({ text: '{"simple":"hi"}' });
    const words = Array.from({ length: 600 }, (_, i) => `w${i}`);

    await POST(
      makeReq({
        text: words.join(' '),
        sourceLang: 'en',
        nativeLang: 'zh-CN',
        apiKey: 'key',
      }),
    );

    const { prompt } = generateTextMock.mock.calls[0]![0];
    expect(prompt).toBe(`<INPUT_TEXT>\n${words.slice(0, 500).join(' ')}\n</INPUT_TEXT>`);
  });

  it('maps an abort/timeout to the timeout code', async () => {
    generateTextMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    const res = await POST(
      makeReq({ text: 'Hello world', sourceLang: 'en', nativeLang: 'zh-CN', apiKey: 'key' }),
    );

    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: { code: 'timeout' } });
  });

  it('maps a TimeoutError DOMException to the timeout code', async () => {
    generateTextMock.mockRejectedValue(
      Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
    );

    const res = await POST(
      makeReq({ text: 'Hello world', sourceLang: 'en', nativeLang: 'zh-CN', apiKey: 'key' }),
    );

    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: { code: 'timeout' } });
  });

  it('maps other failures to provider-error', async () => {
    generateTextMock.mockRejectedValue(new Error('upstream exploded'));

    const res = await POST(
      makeReq({ text: 'Hello world', sourceLang: 'en', nativeLang: 'zh-CN', apiKey: 'key' }),
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: { code: 'provider-error' } });
  });
});
