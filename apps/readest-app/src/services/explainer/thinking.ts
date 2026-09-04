import type { JSONValue } from 'ai';
import type { ExplainerThinkingLevel } from './constants';

/**
 * Endpoints whose models think by default (so `thinking: 'off'` MUST send an
 * explicit disable signal, or the model burns the whole budget reasoning and
 * times out). DeepSeek reasoning models are the confirmed case. For every other
 * endpoint `off` is simply the model's own default, so we send nothing — that
 * avoids adding an unverified request field to the default (off) path.
 */
const REASONING_DEFAULT_HOSTS = ['deepseek.com'];

export const isReasoningDefaultEndpoint = (baseURL?: string): boolean => {
  if (!baseURL) return false;
  let host = '';
  try {
    host = new URL(baseURL).hostname
      .replace(/^\[|\]$/g, '')
      .toLowerCase()
      .replace(/\.$/, '');
  } catch {
    return false;
  }
  return REASONING_DEFAULT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
};

/**
 * Thinking → provider-options mapping for the explainer.
 *
 * The key insight (verified against the vendored `@ai-sdk/openai-compatible`
 * `getArgs`): unknown keys under a provider's namespace are NOT stripped — the
 * SDK spreads them straight into the OpenAI-compatible request body, and only
 * filters out its own schema keys (`user`, `reasoningEffort`, `textVerbosity`,
 * `strictJsonSchema`). So `thinking` and `reasoningEffort` pass through to the
 * wire for ANY OpenAI-compatible backend with no provider-specific transport.
 *
 * Namespace normalization: `model.provider` is like `openrouter.chat`, but the
 * SDK resolves options by the provider NAME (`provider.split('.')[0]`) — the
 * same key it uses internally. Passing `openrouter.chat` would silently drop
 * the options, so we normalize here to match how the SDK reads them.
 *
 * - `off` → nothing for most endpoints (they don't reason by default). For a
 *   reasoning-default endpoint (DeepSeek) → `thinking: { type: 'disabled' }`.
 *   Sending `reasoning_effort` when `off` MUST be avoided (DeepSeek rejects the
 *   combination with HTTP 400).
 * - `low | medium | high` → `thinking: { type: 'enabled' }` + `reasoningEffort`.
 * - Ollama → reserved seam, NOT sent in v1. `think` is read at model
 *   construction, not via `providerOptions`, and a top-level `think: true` is
 *   rejected with HTTP 400 by non-reasoning models — so we return nothing here
 *   until a capability probe can enable it. (See `OllamaProvider.getModel`.)
 *
 * NOTE (gateway path): `@ai-sdk/gateway` forwards the raw providerOptions to
 * ai-gateway.vercel.sh, where translating the `'gateway'` key space into the
 * target model's `thinking`/`reasoning_effort` is UNVERIFIED end-to-end. The
 * OpenAI-compatible path is schema-verified; the gateway path is best-effort
 * only. Per the ticket, unsupported options are silently ignored — a model that
 * can't consume it simply doesn't reason, and generation never fails because of it.
 */
export const buildProviderOptions = (
  thinking: ExplainerThinkingLevel,
  providerNamespace?: string,
  baseURL?: string,
): Record<string, Record<string, JSONValue>> => {
  // `model.provider` = 'openrouter.chat' → the SDK reads namespace 'openrouter'.
  const namespace = providerNamespace?.split('.')[0];
  if (!namespace || namespace === 'ollama') return {};

  if (thinking === 'off') {
    // Only a reasoning-default endpoint needs an explicit off signal; for anyone
    // else off is the model's own default, so sending an unverified field risks a
    // strict endpoint rejecting the request for zero benefit.
    return isReasoningDefaultEndpoint(baseURL)
      ? { [namespace]: { thinking: { type: 'disabled' } } }
      : {};
  }

  return {
    [namespace]: {
      thinking: { type: 'enabled' },
      reasoningEffort: thinking,
    },
  };
};
