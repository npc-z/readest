/**
 * Explainer single-source constants (ticket 02).
 *
 * Both the Tauri direct path and the web `/api/ai/explain` route read these,
 * so generation parameters, limits and error codes live in exactly one place.
 * Limits are plain constants today and can later be promoted to settings by
 * replacing their source without touching callers.
 */

/** Prompt policy version; increments only with the canonical v1 template. */
export const EXPLAINER_PROMPT_VERSION = 1;

/** Input/output caps fixed by the limits decision (issue 07 / issue 02). */
export const EXPLAINER_INPUT_LIMITS = {
  /** 500 units (words for space-delimited prose, characters for CJK). */
  maxUnits: 500,
  maxNotes: 15,
  maxGrammarNotes: 2,
} as const;

/** Generation parameters shared by the web route and native direct path. */
export const EXPLAINER_GENERATION_PARAMS = {
  temperature: 0.2,
  /**
   * Output budget for reasoning-enabled calls (thinking ≠ 'off'): a reasoning
   * chain can consume a large share of `max_tokens` before the plain answer, so
   * it needs 10× the ceiling (verified against DeepSeek reasoning models).
   */
  maxOutputTokens: 40_960,
  /** Budget for plain completions (thinking === 'off'): an explanation is a
   *  small completion, so keep the cost/time ceiling tight. */
  maxOutputTokensOff: 4_096,
  /** SDK retries: network layer only. */
  maxRetries: 2,
} as const;

export const EXPLAINER_THINKING_LEVELS = ['off', 'low', 'medium', 'high'] as const;
export type ExplainerThinkingLevel = (typeof EXPLAINER_THINKING_LEVELS)[number];

export const DEFAULT_EXPLAINER_THINKING: ExplainerThinkingLevel = 'off';

/**
 * Defaults merged into `SystemSettings.explainerSettings` by the settings
 * loader. Optional fields are left undefined so the reading side resolves each
 * to its per-use default (sourceLang → book metadata / 'auto', nativeLang → UI
 * snapshot). Thinking defaults to off per the model-parameters decision.
 */
export const DEFAULT_EXPLAINER_SETTINGS = {
  thinking: DEFAULT_EXPLAINER_THINKING,
} as const;

/** Default OpenAI-compatible base URL (OpenRouter default from the AI settings). */
export const EXPLAINER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export const EXPLAINER_TIMEOUTS = {
  defaultMs: 120_000,
  highThinkingMs: 240_000,
} as const;

/** Timeout per the §7 parameter table: 'high' thinking gets the longer budget. */
export const explainerTimeoutMs = (thinking: ExplainerThinkingLevel): number =>
  thinking === 'high' ? EXPLAINER_TIMEOUTS.highThinkingMs : EXPLAINER_TIMEOUTS.defaultMs;

/** Output budget is thinking-aware: only reasoning chains need the large cap. */
export const explainerMaxOutputTokens = (thinking: ExplainerThinkingLevel): number =>
  thinking === 'off'
    ? EXPLAINER_GENERATION_PARAMS.maxOutputTokensOff
    : EXPLAINER_GENERATION_PARAMS.maxOutputTokens;

/**
 * Error codes the service layer may produce. Copy/messages belong to the UI
 * layer only; the service never returns display text.
 */
export const EXPLAINER_ERROR_CODES = [
  'ai-not-configured',
  'timeout',
  'provider-error',
  'no-object-salvaged',
  'invalid-input',
  'rate-limited',
] as const;

export type ExplainerErrorCode = (typeof EXPLAINER_ERROR_CODES)[number];

/**
 * Cache key format `(bookHash, textHash, nativeLang)` shared by the service
 * layer, the panel, and the in-memory test stores so the delimiter can never
 * drift in one place.
 */
export const explainerCacheKey = (bookHash: string, textHash: string, nativeLang: string): string =>
  `${bookHash}:${textHash}:${nativeLang}`;
