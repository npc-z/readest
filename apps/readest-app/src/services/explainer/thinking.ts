import type { ExplainerThinkingLevel } from './constants';

/**
 * Best-effort thinking mapping, keyed by the MODEL's provider namespace (the
 * `model.provider` property), not the app's provider id — they differ for the
 * AI Gateway ('gateway').
 *
 * - `off` → no options.
 * - Ollama (`ollama`) → reserved seam, NOT sent in v1. `think` would be read at
 *   model construction, not via `providerOptions` (which the vendored schema
 *   strips), and a top-level `think: true` is rejected with HTTP 400 by
 *   non-reasoning models — so we return nothing here until a capability probe
 *   can enable it. (See `OllamaProvider.getModel`.)
 * - OpenAI-style providers (openrouter, gateway) → `reasoningEffort`.
 *
 * NOTE (gateway path): `@ai-sdk/gateway` forwards the raw providerOptions to
 * ai-gateway.vercel.sh, where translating the `'gateway'` key space into the
 * target model's `reasoning_effort`/`thinkingConfig` is UNVERIFIED end-to-end.
 * OpenRouter's shape is schema-verified; the gateway path is best-effort only.
 * Per the ticket, unsupported options are silently ignored — a model that can't
 * consume it simply doesn't reason, and generation never fails because of it.
 */
export const buildProviderOptions = (
  thinking: ExplainerThinkingLevel,
  providerNamespace?: string,
): Record<string, Record<string, string | boolean>> => {
  if (thinking === 'off') return {};
  if (!providerNamespace || providerNamespace === 'ollama') return {};

  return { [providerNamespace]: { reasoningEffort: thinking } };
};
