import { parsePartialJson } from 'ai';

import { EXPLAINER_INPUT_LIMITS, EXPLAINER_PROMPT_VERSION } from './constants';
import { explainerPayloadSchema, type ExplainerPayload } from './schema';

export interface SalvageInput {
  /** Raw provider text: ideally JSON, but possibly prose or truncated JSON. */
  rawText: string;
  /** Best-effort structured object already parsed by the gateway, if any. */
  structured?: unknown;
  sourceLang: string;
  nativeLang: string;
}

/**
 * Strip a single ```json ... ``` or ``` ... ``` fence (and surrounding
 * whitespace) so JSON recovery works even when a model wraps its answer.
 */
const stripCodeFences = (text: string): string => {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1]!.trim() : trimmed;
};

const tryParseJson = (text: string): unknown | undefined => {
  try {
    return JSON.parse(stripCodeFences(text)) as unknown;
  } catch {
    return undefined;
  }
};

// A response that opens with `{` or `[` is a JSON structural attempt. If it
// cannot be shaped into a valid payload, storing the raw JSON as a "plain
// restatement" would be worse than failing to the error state.
const jsonLike = (text: string): boolean => /^\s*[[{]/.test(text);

/**
 * Shape a parsed JSON value into a complete, limit-sliced payload. Injects
 * the request languages/version when the model omitted them so a partial
 * answer can still be salvaged. Returns null when the value is not a usable
 * explanation object (e.g. `{}` or a missing `simple`).
 */
const normalizePayload = (
  value: unknown,
  sourceLang: string,
  nativeLang: string,
): ExplainerPayload | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const obj = value as Record<string, unknown>;
  const metadata = (
    typeof obj['metadata'] === 'object' && obj['metadata'] !== null
      ? (obj['metadata'] as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>;

  const candidate = {
    ...obj,
    metadata: {
      sourceLang: typeof metadata['sourceLang'] === 'string' ? metadata['sourceLang'] : sourceLang,
      nativeLang: typeof metadata['nativeLang'] === 'string' ? metadata['nativeLang'] : nativeLang,
      promptVersion:
        typeof metadata['promptVersion'] === 'number'
          ? metadata['promptVersion']
          : EXPLAINER_PROMPT_VERSION,
      ...(typeof metadata['format'] === 'string' ? { format: metadata['format'] } : {}),
    },
  };

  const result = explainerPayloadSchema.safeParse(candidate);
  if (!result.success) return null;

  const { simple } = result.data;
  if (typeof simple !== 'string' || simple.trim().length === 0) return null;

  return {
    simple,
    notes: (result.data.notes ?? []).slice(0, EXPLAINER_INPUT_LIMITS.maxNotes),
    grammar: (result.data.grammar ?? []).slice(0, EXPLAINER_INPUT_LIMITS.maxGrammarNotes),
    translationM: result.data.translationM ?? null,
    metadata: {
      sourceLang: result.data.metadata.sourceLang,
      nativeLang: result.data.metadata.nativeLang,
      promptVersion: result.data.metadata.promptVersion,
      format: result.data.metadata.format ?? 'json',
    },
  };
};

/**
 * Degradation ladder (ticket 03):
 *
 * 1. Use a structured object the gateway already parsed (`Output.object`).
 * 2. Strict JSON.parse of the raw text.
 * 3. `parsePartialJson` rescue for truncated / partially-repaired JSON.
 * 4. Pure-text fallback: store the raw prose with `metadata.format: 'text'`
 *    so the panel renders it flat instead of as a cascading tier.
 * 5. Otherwise null → the service raises `no-object-salvaged`.
 *
 * The fallback reuses the text the model already produced rather than making
 * a second model call; a single round-trip is enough to satisfy "pure-text
 * fallback and mark format".
 */
export const salvagePayload = async (input: SalvageInput): Promise<ExplainerPayload | null> => {
  const { rawText, structured, sourceLang, nativeLang } = input;

  if (structured !== undefined) {
    const parsed = normalizePayload(structured, sourceLang, nativeLang);
    if (parsed) return parsed;
  }

  const strict = tryParseJson(rawText);
  if (strict !== undefined) {
    const parsed = normalizePayload(strict, sourceLang, nativeLang);
    if (parsed) return parsed;
  }

  const partial = await parsePartialJson(stripCodeFences(rawText));
  if (partial.state !== 'failed-parse' && partial.value !== undefined) {
    const parsed = normalizePayload(partial.value, sourceLang, nativeLang);
    if (parsed) return parsed;
  }

  const trimmed = rawText.trim();
  if (trimmed && !jsonLike(trimmed)) {
    return {
      simple: trimmed,
      notes: [],
      grammar: [],
      translationM: null,
      metadata: {
        sourceLang,
        nativeLang,
        promptVersion: EXPLAINER_PROMPT_VERSION,
        format: 'text',
      },
    };
  }

  return null;
};
