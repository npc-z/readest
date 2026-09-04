import { beforeEach, describe, expect, test, vi } from 'vitest';

import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import type { AISettings } from '@/services/ai/types';
import {
  buildProviderOptions,
  createExplainerAiGateway,
  DirectExplainerAiGateway,
  isReasoningDefaultEndpoint,
  isAiConfigured,
  WebExplainerAiGateway,
} from '@/services/explainer/gateway';

const generateTextMock = vi.hoisted(() => vi.fn());
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

const getAIProviderMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/ai/providers', () => ({
  getAIProvider: (...args: unknown[]) => getAIProviderMock(...args),
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

const ollamaSettings = (overrides: Partial<AISettings> = {}): AISettings => ({
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  provider: 'ollama',
  ...overrides,
});

const openrouter = (): AISettings => ({
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  provider: 'openrouter',
  openrouterApiKey: 'sk-key',
});

const fakeProvider = (providerNamespace: string) => ({
  id: providerNamespace,
  getModel: vi.fn(() => ({ provider: providerNamespace, modelId: 'model-x' })),
});

describe('isAiConfigured', () => {
  test('true for an enabled local provider with no key', () => {
    expect(isAiConfigured(ollamaSettings())).toBe(true);
  });

  test('false when AI is disabled', () => {
    expect(isAiConfigured(ollamaSettings({ enabled: false }))).toBe(false);
  });

  test('false for a keyed provider that is missing its key', () => {
    expect(isAiConfigured({ ...openrouter(), openrouterApiKey: undefined })).toBe(false);
  });
});

describe('buildProviderOptions', () => {
  test('off sends nothing for generic endpoints (off is their own default)', () => {
    expect(buildProviderOptions('off', 'openrouter')).toEqual({});
    expect(buildProviderOptions('off', 'gateway', 'https://openrouter.ai/api/v1')).toEqual({});
    expect(buildProviderOptions('off', 'openrouter', 'https://openrouter.ai/api/v1')).toEqual({});
  });

  test('off sends a disabled thinking signal (no reasoning_effort) only for reasoning-default endpoints', () => {
    expect(buildProviderOptions('off', 'openrouter', 'https://api.deepseek.com')).toEqual({
      openrouter: { thinking: { type: 'disabled' } },
    });
    expect(buildProviderOptions('off', 'openrouter', 'https://api.deepseek.com/v1')).toEqual({
      openrouter: { thinking: { type: 'disabled' } },
    });
  });

  test('returns nothing for Ollama (think is handled at model construction)', () => {
    expect(buildProviderOptions('low', 'ollama')).toEqual({});
    expect(buildProviderOptions('high', 'ollama')).toEqual({});
    expect(buildProviderOptions('off', 'ollama', 'https://api.deepseek.com')).toEqual({});
  });

  test('maps openai-style namespaces to enabled thinking + reasoningEffort', () => {
    expect(buildProviderOptions('medium', 'openrouter')).toEqual({
      openrouter: { thinking: { type: 'enabled' }, reasoningEffort: 'medium' },
    });
    expect(buildProviderOptions('high', 'gateway')).toEqual({
      gateway: { thinking: { type: 'enabled' }, reasoningEffort: 'high' },
    });
  });

  test('normalizes model.provider (openrouter.chat) to the SDK namespace', () => {
    expect(buildProviderOptions('high', 'openrouter.chat')).toEqual({
      openrouter: { thinking: { type: 'enabled' }, reasoningEffort: 'high' },
    });
  });
});

describe('isReasoningDefaultEndpoint', () => {
  test('detects DeepSeek hosts and rejects others', () => {
    expect(isReasoningDefaultEndpoint('https://api.deepseek.com')).toBe(true);
    expect(isReasoningDefaultEndpoint('https://api.deepseek.com/v1')).toBe(true);
    expect(isReasoningDefaultEndpoint('https://deepseek.com')).toBe(true);
    expect(isReasoningDefaultEndpoint('https://api.deepseek.com.')).toBe(true);
    expect(isReasoningDefaultEndpoint('https://openrouter.ai/api/v1')).toBe(false);
    expect(isReasoningDefaultEndpoint(undefined)).toBe(false);
    expect(isReasoningDefaultEndpoint('not a url')).toBe(false);
  });
});

describe('DirectExplainerAiGateway', () => {
  beforeEach(() => {
    generateTextMock.mockReset().mockResolvedValue({ text: '{"simple":"hi"}' });
    getAIProviderMock.mockReset();
  });

  test('throws ai-not-configured when AI is disabled', async () => {
    const gateway = new DirectExplainerAiGateway(ollamaSettings({ enabled: false }));
    await expect(
      gateway.generate({ text: 'Hello', sourceLang: 'en', nativeLang: 'zh-CN', thinking: 'off' }),
    ).rejects.toMatchObject({ code: 'ai-not-configured' });
    expect(getAIProviderMock).not.toHaveBeenCalled();
  });

  test('does not set Ollama think in v1 and forwards no providerOptions', async () => {
    const provider = fakeProvider('ollama');
    getAIProviderMock.mockReturnValue(provider);
    const gateway = new DirectExplainerAiGateway(ollamaSettings());

    await gateway.generate({
      text: 'Hello world',
      sourceLang: 'en',
      nativeLang: 'zh-CN',
      thinking: 'high',
    });

    // `think` is intentionally not passed: top-level think:true 400s on
    // non-reasoning models (e.g. llama3.2), verified against Ollama behavior.
    expect(provider.getModel).toHaveBeenCalledWith();
    const call = generateTextMock.mock.calls[0]![0];
    expect(call.providerOptions).toEqual({});
    expect(call.maxRetries).toBe(2);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    expect(call.system).toContain('IDENTITY');
    expect(call.prompt).toBe('<INPUT_TEXT>\nHello world\n</INPUT_TEXT>');
  });

  test('forwards reasoningEffort under the model provider namespace', async () => {
    const provider = fakeProvider('openrouter');
    getAIProviderMock.mockReturnValue(provider);
    const gateway = new DirectExplainerAiGateway(openrouter());

    await gateway.generate({
      text: 'Hello world',
      sourceLang: 'en',
      nativeLang: 'zh-CN',
      thinking: 'medium',
    });

    expect(provider.getModel).toHaveBeenCalledWith();
    const call = generateTextMock.mock.calls[0]![0];
    expect(call.providerOptions).toEqual({
      openrouter: { thinking: { type: 'enabled' }, reasoningEffort: 'medium' },
    });
  });

  test('does not feed a lingering openrouter baseURL into a gateway/ollama off branch', async () => {
    const settings: AISettings = {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      provider: 'ai-gateway',
      aiGatewayApiKey: 'gateway-key',
      openrouterBaseUrl: 'https://api.deepseek.com',
    };
    getAIProviderMock.mockReturnValue(fakeProvider('gateway'));
    const gateway = new DirectExplainerAiGateway(settings);

    await gateway.generate({
      text: 'Hello world',
      sourceLang: 'en',
      nativeLang: 'zh-CN',
      thinking: 'off',
    });

    // Even though openrouterBaseUrl points at DeepSeek, the active provider is
    // ai-gateway, so the baseURL must not reach the mapper (off stays a no-op).
    expect(generateTextMock.mock.calls[0]![0].providerOptions).toEqual({});
  });
});

describe('WebExplainerAiGateway', () => {
  const request = {
    text: 'Hello world',
    sourceLang: 'en',
    nativeLang: 'zh-CN',
    thinking: 'high' as const,
  };

  beforeEach(() => {
    fetchMock.mockReset();
  });

  test('rejects Ollama as not configured on the web path', async () => {
    const gateway = new WebExplainerAiGateway(ollamaSettings());

    await expect(gateway.generate(request)).rejects.toMatchObject({ code: 'ai-not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('posts text/languages/thinking/apiKey/model/provider/baseURL and returns the raw text', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ text: '{"simple":"hi"}' }), { status: 200 }),
    );
    const gateway = new WebExplainerAiGateway(openrouter());

    const result = await gateway.generate(request);

    expect(result).toEqual({ rawText: '{"simple":"hi"}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/ai/explain');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      text: 'Hello world',
      sourceLang: 'en',
      nativeLang: 'zh-CN',
      thinking: 'high',
      apiKey: 'sk-key',
      provider: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test('maps a non-ok response error code through to the service error', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'timeout' } }), { status: 504 }),
    );
    const gateway = new WebExplainerAiGateway(openrouter());

    await expect(gateway.generate(request)).rejects.toMatchObject({ code: 'timeout' });
  });

  test('ignores codes outside the static table and falls back to status', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'brand-new-code' } }), { status: 502 }),
    );
    const gateway = new WebExplainerAiGateway(openrouter());

    await expect(gateway.generate(request)).rejects.toMatchObject({ code: 'provider-error' });
  });

  test('maps a non-JSON 504 body to timeout by status', async () => {
    fetchMock.mockResolvedValue(new Response('<html>gateway timeout</html>', { status: 504 }));
    const gateway = new WebExplainerAiGateway(openrouter());

    await expect(gateway.generate(request)).rejects.toMatchObject({ code: 'timeout' });
  });

  test('maps a 429 body to rate-limited by status', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'rate-limited' } }), { status: 429 }),
    );
    const gateway = new WebExplainerAiGateway(openrouter());

    await expect(gateway.generate(request)).rejects.toMatchObject({ code: 'rate-limited' });
  });
});

describe('createExplainerAiGateway', () => {
  test('routes to the web gateway outside the Tauri build', () => {
    delete process.env['NEXT_PUBLIC_APP_PLATFORM'];
    expect(createExplainerAiGateway(ollamaSettings())).toBeInstanceOf(WebExplainerAiGateway);
  });
});
