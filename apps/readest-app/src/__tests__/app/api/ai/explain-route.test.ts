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

const createOpenAICompatibleMock = vi.hoisted(() => vi.fn());
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: (...args: unknown[]) => createOpenAICompatibleMock(...args),
}));

import { POST } from '@/app/api/ai/explain/route';

const authed = { user: { id: 'u1' }, token: 'test-token' };

const makeReq = (
  body: unknown,
  authorization: string | null = 'Bearer test-token',
  ip?: string,
): NextRequest =>
  new NextRequest('https://web.readest.com/api/ai/explain', {
    method: 'POST',
    headers: {
      ...(authorization ? { authorization } : {}),
      'Content-Type': 'application/json',
      ...(ip ? { 'x-forwarded-for': ip } : {}),
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  validateUserAndTokenMock.mockReset().mockResolvedValue(authed);
  generateTextMock.mockReset();
  createGatewayMock
    .mockReset()
    .mockReturnValue(vi.fn(() => ({ id: 'mock-model', provider: 'gateway' })));
  createOpenAICompatibleMock.mockReset().mockReturnValue({
    chatModel: (modelId: string) => ({ id: 'mock-openrouter', provider: 'openrouter', modelId }),
  });
  vi.stubEnv('AI_GATEWAY_API_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/ai/explain', () => {
  it('returns 403 for the server-key fallback when unauthenticated', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'server-key');
    validateUserAndTokenMock.mockResolvedValue({});
    const res = await POST(makeReq({ text: 'Hello', sourceLang: 'en', nativeLang: 'zh-CN' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Not authenticated' });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('does not require a session when the client supplies its own API key', async () => {
    validateUserAndTokenMock.mockResolvedValue({});
    generateTextMock.mockResolvedValue({ text: '{"simple":"hi"}' });

    const res = await POST(
      makeReq({ text: 'Hello', sourceLang: 'en', nativeLang: 'zh-CN', apiKey: 'client-key' }),
    );

    expect(res.status).toBe(200);
    expect(validateUserAndTokenMock).not.toHaveBeenCalled();
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
    expect(maxOutputTokens).toBe(40960);
    expect(maxRetries).toBe(2);
    expect(abortSignal).toBeInstanceOf(AbortSignal);
    expect(providerOptions).toEqual({
      gateway: { thinking: { type: 'enabled' }, reasoningEffort: 'high' },
    });
  });

  it('uses the OpenAI-compatible client for a custom provider and forwards baseURL', async () => {
    generateTextMock.mockResolvedValue({ text: '{"simple":"hi"}' });

    const res = await POST(
      makeReq({
        text: 'Hello world',
        sourceLang: 'en',
        nativeLang: 'zh-CN',
        thinking: 'high',
        apiKey: 'ds-key',
        model: 'deepseek-v4-flash',
        provider: 'openrouter',
        baseURL: 'https://api.deepseek.com/v1',
      }),
    );

    expect(res.status).toBe(200);
    expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'openrouter',
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: 'ds-key',
      }),
    );
    const call = generateTextMock.mock.calls[0]![0];
    expect(call.model).toMatchObject({ id: 'mock-openrouter', provider: 'openrouter' });
    expect(call.providerOptions).toEqual({
      openrouter: { thinking: { type: 'enabled' }, reasoningEffort: 'high' },
    });
  });

  it('disables thinking for DeepSeek-style models via providerOptions when off', async () => {
    generateTextMock.mockResolvedValue({ text: '{"simple":"hi"}' });

    const res = await POST(
      makeReq({
        text: 'Hello world',
        sourceLang: 'en',
        nativeLang: 'zh-CN',
        thinking: 'off',
        apiKey: 'ds-key',
        model: 'deepseek-v4-flash',
        provider: 'openrouter',
        baseURL: 'https://api.deepseek.com/v1',
      }),
    );

    expect(res.status).toBe(200);
    // No reasoning_effort when thinking is disabled — DeepSeek rejects the
    // combination with HTTP 400, so the off branch must omit it entirely.
    const call = generateTextMock.mock.calls[0]![0];
    expect(call.providerOptions).toEqual({
      openrouter: { thinking: { type: 'disabled' } },
    });
    expect(call.providerOptions.openrouter).not.toHaveProperty('reasoningEffort');
    // off is a plain completion: keep the output/time ceiling tight.
    expect(call.maxOutputTokens).toBe(4096);
  });

  it('rejects an unwhitelisted provider instead of falling into the proxy path', async () => {
    const res = await POST(
      makeReq({
        text: 'Hello world',
        sourceLang: 'en',
        nativeLang: 'zh-CN',
        apiKey: 'key',
        provider: 'ollama',
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'invalid-input' } });
    expect(createGatewayMock).not.toHaveBeenCalled();
    expect(createOpenAICompatibleMock).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('rejects a non-https base URL (SSRF guard)', async () => {
    const res = await POST(
      makeReq({
        text: 'Hello world',
        sourceLang: 'en',
        nativeLang: 'zh-CN',
        apiKey: 'key',
        provider: 'openrouter',
        baseURL: 'http://api.deepseek.com',
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'invalid-input' } });
    expect(createOpenAICompatibleMock).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('rejects an IP-literal or localhost base URL (SSRF guard)', async () => {
    for (const baseURL of [
      'https://169.254.169.254',
      'https://10.0.0.1',
      'https://127.0.0.1:11434',
      'https://localhost:11434',
      'https://[::1]',
      'https://localhost.',
    ]) {
      const res = await POST(
        makeReq({
          text: 'Hello world',
          sourceLang: 'en',
          nativeLang: 'zh-CN',
          apiKey: 'key',
          provider: 'openrouter',
          baseURL,
        }),
      );
      expect(res.status).toBe(400);
      expect(createOpenAICompatibleMock).not.toHaveBeenCalled();
    }
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('rate-limits the BYOK path per IP', async () => {
    generateTextMock.mockResolvedValue({ text: '{"simple":"hi"}' });
    // A unique IP keeps this bucket independent from the other tests.
    const ip = '203.0.113.7';
    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const res = await POST(
        makeReq(
          { text: 'Hello world', sourceLang: 'en', nativeLang: 'zh-CN', apiKey: 'key' },
          null,
          ip,
        ),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
    const res = await POST(
      makeReq(
        { text: 'Hello world', sourceLang: 'en', nativeLang: 'zh-CN', apiKey: 'key' },
        null,
        ip,
      ),
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: 'rate-limited' } });
  });

  it('does not rate-limit the session-gated env-key path', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'server-key');
    generateTextMock.mockResolvedValue({ text: '{"simple":"hi"}' });
    for (let i = 0; i < 61; i++) {
      const res = await POST(
        makeReq({ text: 'Hello world', sourceLang: 'en', nativeLang: 'zh-CN' }),
      );
      expect(res.status).toBe(200);
    }
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
