import { generateText, type LanguageModel } from 'ai';

import type { AISettings, AIProvider } from '@/services/ai/types';
import { getAIProvider } from '@/services/ai/providers';
import { isTauriAppPlatform } from '@/services/environment';

import {
  EXPLAINER_ERROR_CODES,
  EXPLAINER_GENERATION_PARAMS,
  explainerTimeoutMs,
  type ExplainerErrorCode,
  type ExplainerThinkingLevel,
} from './constants';
import { classifyGenerationError, ExplainerServiceError } from './errors';
import { buildExplainerInputPrompt, buildExplainerSystemPrompt } from './prompts';
import { buildProviderOptions } from './thinking';

// Re-exported so callers/tests can share the single thinking-mapping source.
export { buildProviderOptions };

/** Everything a gateway needs to generate one explanation. */
export interface ExplainerAiRequest {
  /** Display passage (already truncated to the unit limit by the service). */
  text: string;
  sourceLang: string;
  nativeLang: string;
  thinking: ExplainerThinkingLevel;
}

/**
 * Raw gateway result. The service layer owns parsing/validation/salvage, so a
 * gateway only has to return the text the provider produced (plus any object
 * it already parsed) — never a final payload or a UI error.
 */
export interface ExplainerAiResult {
  rawText: string;
  structured?: unknown;
}

/**
 * Platform-agnostic AI port. The direct and web gateways differ only in
 * transport (provider object vs `/api/ai/explain`); the service is blind to
 * which one is behind it, which is exactly what ticket 03 asks for.
 */
export interface ExplainerAiGateway {
  generate(request: ExplainerAiRequest): Promise<ExplainerAiResult>;
}

/**
 * Reuses existing AI settings. A provider is "configured" when enabled and
 * its key exists. Ollama needs no key; gateway / OpenRouter do.
 */
export const isAiConfigured = (settings: AISettings): boolean => {
  if (!settings.enabled) return false;
  switch (settings.provider) {
    case 'ollama':
      return true;
    case 'ai-gateway':
      return Boolean(settings.aiGatewayApiKey);
    case 'openrouter':
      return Boolean(settings.openrouterApiKey);
    default:
      return false;
  }
};

/**
 * Direct path for native/target paths (Tauri and node runtimes). Calls the
 * existing provider structure via `getAIProvider` — the same one the chat and
 * Reedy features use — so no second provider setup is needed.
 */
class DirectExplainerAiGateway implements ExplainerAiGateway {
  constructor(private readonly settings: AISettings) {}

  async generate(request: ExplainerAiRequest): Promise<ExplainerAiResult> {
    if (!isAiConfigured(this.settings)) {
      throw new ExplainerServiceError('ai-not-configured', 'AI is not configured.');
    }

    let provider: AIProvider;
    try {
      provider = getAIProvider(this.settings);
    } catch (error) {
      // `getAIProvider` throws when the selected provider is missing its key.
      throw new ExplainerServiceError(
        'ai-not-configured',
        error instanceof Error ? error.message : 'AI is not configured.',
      );
    }

    // Ollama's `think` is read at model construction (not from providerOptions,
    // which the vendored schema strips). We intentionally do NOT pass it in v1:
    // a top-level `think: true` is rejected with HTTP 400 by non-reasoning models
    // (e.g. the default llama3.2). A future model-capability probe can thread
    // `think` through model construction; until then thinking is a silent no-op
    // on Ollama and generation never fails because of it.
    const model: LanguageModel = provider.getModel();
    const providerNamespace = (model as { provider?: string }).provider;
    const system = buildExplainerSystemPrompt({
      sourceLang: request.sourceLang,
      nativeLang: request.nativeLang,
    });

    try {
      const result = await generateText({
        model,
        system,
        prompt: buildExplainerInputPrompt(request.text),
        temperature: EXPLAINER_GENERATION_PARAMS.temperature,
        maxOutputTokens: EXPLAINER_GENERATION_PARAMS.maxOutputTokens,
        maxRetries: EXPLAINER_GENERATION_PARAMS.maxRetries,
        abortSignal: AbortSignal.timeout(explainerTimeoutMs(request.thinking)),
        providerOptions: buildProviderOptions(request.thinking, providerNamespace),
      });

      return { rawText: result.text ?? '' };
    } catch (error) {
      throw classifyGenerationError(error);
    }
  }
}

/**
 * Web path. The route builds the (versioned) system prompt server-side — the
 * client only sends text + params, never a system prompt — so a prompt/schema
 * change can be shipped without editing every client. apiKey/model ride in the
 * body, mirroring `/api/ai/chat`.
 */
class WebExplainerAiGateway implements ExplainerAiGateway {
  constructor(private readonly settings: AISettings) {}

  private credentials(): { apiKey: string; model: string } {
    const s = this.settings;
    if (s.provider === 'openrouter') {
      return { apiKey: s.openrouterApiKey ?? '', model: s.openrouterModel ?? '' };
    }
    // ai-gateway (default for the web route) and any fallback fields.
    return { apiKey: s.aiGatewayApiKey ?? '', model: s.aiGatewayModel ?? '' };
  }

  async generate(request: ExplainerAiRequest): Promise<ExplainerAiResult> {
    if (!isAiConfigured(this.settings)) {
      throw new ExplainerServiceError('ai-not-configured', 'AI is not configured.');
    }
    if (this.settings.provider === 'ollama') {
      // Ollama is local-only on the direct path; the web route uses a cloud
      // gateway. Treat this as "not configured" so the panel offers settings.
      throw new ExplainerServiceError(
        'ai-not-configured',
        'Ollama is not available on the web build; configure AI-Gateway or OpenRouter.',
      );
    }

    const { apiKey, model } = this.credentials();
    let response: Response;
    try {
      response = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: request.text,
          sourceLang: request.sourceLang,
          nativeLang: request.nativeLang,
          thinking: request.thinking,
          apiKey,
          model,
        }),
        signal: AbortSignal.timeout(explainerTimeoutMs(request.thinking)),
      });
    } catch (error) {
      throw classifyGenerationError(error);
    }

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      const rawCode = data?.error?.code;
      // Only trust a code that is in the static table; anything else (including
      // a future route adding a new code) falls through to a status-based guess.
      const code: ExplainerErrorCode =
        rawCode && EXPLAINER_ERROR_CODES.includes(rawCode as ExplainerErrorCode)
          ? (rawCode as ExplainerErrorCode)
          : this.codeForStatus(response.status);
      throw new ExplainerServiceError(code, `Explain request failed: ${response.status}`);
    }

    const data = (await response.json()) as { text?: string };
    return { rawText: data.text ?? '' };
  }

  /**
   * Fallback when the route body carries no recognized code (e.g. a transport
   * wrapper returns an HTML 504 that masks the abort, or a non-JSON error).
   */
  private codeForStatus(status: number): ExplainerErrorCode {
    if (status === 401) return 'ai-not-configured';
    if (status === 504) return 'timeout';
    return 'provider-error';
  }
}

/**
 * Pick the right transport for the current build: native/target uses the
 * direct provider path; the web build routes through `/api/ai/explain`.
 */
export const createExplainerAiGateway = (settings: AISettings): ExplainerAiGateway => {
  if (isTauriAppPlatform()) {
    return new DirectExplainerAiGateway(settings);
  }
  return new WebExplainerAiGateway(settings);
};

// Re-export for tests that need to assert the configured gateway picks a path.
export { DirectExplainerAiGateway, WebExplainerAiGateway };
