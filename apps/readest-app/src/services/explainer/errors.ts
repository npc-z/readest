import type { ExplainerErrorCode } from './constants';

/**
 * The only error shape the explainer service layer surfaces. It carries a
 * stable {@link ExplainerErrorCode} — never display copy — so the UI maps
 * codes to text (inline states, retry/regenerate buttons, toasts).
 */
export class ExplainerServiceError extends Error {
  readonly code: ExplainerErrorCode;

  constructor(code: ExplainerErrorCode, message: string) {
    super(message);
    this.name = 'ExplainerServiceError';
    this.code = code;
  }
}

/**
 * Map any error thrown by an AI gateway (or the raw SDK/network layer under
 * the direct path) to a service-level error code.
 *
 * - Errors that already carry a code (e.g. `ai-not-configured`) pass through.
 * - Aborts and timeout-shaped errors become `'timeout'`.
 * - Everything else becomes `'provider-error'`.
 *
 * The service only ever hands these codes upward; it never formats UI text.
 */
export function classifyGenerationError(error: unknown): ExplainerServiceError {
  if (error instanceof ExplainerServiceError) return error;

  const cause = error instanceof Error ? error : new Error(String(error));
  const message = cause.message || 'Unknown provider error';

  // AbortSignal.timeout() rejects with a DOMException named 'TimeoutError';
  // transports (e.g. Tauri plugin-http) may surface the abort differently, so
  // match on the message too as a fallback.
  if (cause.name === 'AbortError' || cause.name === 'TimeoutError' || /timeout/i.test(message)) {
    return new ExplainerServiceError('timeout', message);
  }

  return new ExplainerServiceError('provider-error', message);
}
