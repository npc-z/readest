import { stubTranslation as _ } from '@/utils/misc';
import type { ExplainerErrorCode, ExplainerThinkingLevel } from './constants';

/**
 * i18n declaration module for the Explainer feature (ticket 08).
 *
 * The keys that appear as a direct string literal in React components are
 * picked up by i18next-scanner directly. The keys below cannot be — they are
 * reached indirectly (a code→key map, a template string, or a value passed via
 * a function parameter) — so they are registered here with `stubTranslation`,
 * which only declares them for extraction and returns the key unchanged.
 *
 * Renderers still apply the real `_()` from `useTranslation` at runtime; this
 * module carries no display text and is never translated itself.
 */

/**
 * Error code → English key map. The service layer returns a stable error code
 * and never any display text; the UI maps the code to a key here and renders it
 * with `_()`. The keys are registered for extraction via `stubTranslation`.
 */
export const EXPLAINER_ERROR_MESSAGE_KEYS: Record<ExplainerErrorCode, string> = {
  'ai-not-configured': _('AI is not configured.'),
  timeout: _('The request timed out.'),
  'provider-error': _('The AI provider returned an error.'),
  'no-object-salvaged': _('The answer could not be parsed.'),
  'invalid-input': _('There is nothing to explain.'),
  'rate-limited': _('Too many requests. Please try again later.'),
};

/**
 * Thinking-level → English key map. The panel renders `_(EXPLAINER_THINKING_LEVELS)`
 * via this map (template `\`Thinking ${level}\`` would produce the same keys but
 * is invisible to the extractor), so each label key is registered here too.
 */
export const EXPLAINER_THINKING_LABEL_KEYS: Record<ExplainerThinkingLevel, string> = {
  off: _('Thinking off'),
  low: _('Thinking low'),
  medium: _('Thinking medium'),
  high: _('Thinking high'),
};

/** Toast text when a passage was truncated to the unit limit before generation. */
export const EXPLAINER_TRUNCATED_TOAST_KEY = _('Only the first part was explained.');

/**
 * Note-kind badges (word/phrase/idiom). `ExplainerCascade` builds the label with
 * a ternary and renders `_(label)`, so the keys are registered here for
 * extraction; the shared `Word` key also serves the dictionary feature.
 */
export const EXPLAINER_NOTE_KIND_BADGE_KEYS = {
  word: _('Word'),
  phrase: _('Phrase'),
  idiom: _('Idiom'),
} as const;

/**
 * Action toasts / error-state keys for the library page. They reach the
 * renderer as plain string args (`actionFailedMessage(_, key, code)` and
 * `setError(key)`), so they are not picked up by the `_('...')` scanner — they
 * are registered here to stay in sync with any zhs-CN backfill.
 */
export const EXPLAINER_ACTION_KEYS = {
  loadMoreFailed: _('Could not load more.'),
  regenerateFailed: _('Regenerate failed.'),
  deleteFailed: _('Delete failed.'),
  openBookFailed: _('Could not open the book.'),
  loadExplanationsFailed: _('Could not load explanations.'),
} as const;
