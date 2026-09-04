import { EXPLAINER_INPUT_LIMITS } from './constants';

/**
 * Pure text pipeline for explainer keys and limits (ticket 02, issue 07).
 *
 * Display text (with paragraph breaks) and the cache key are deliberately
 * separate: `text` is stored as the user saw it, while `text_hash` is the
 * sha256 of `normalizeText` so formatting-only differences hit the same key.
 */

// Only remove HTML-shaped tags: a letter or "/" right after "<". Comparisons
// like "if x < 3 then y > 2" stay intact because the "<" is followed by a
// space. `<it>` inside literal prose is indistinguishable from real markup
// without a parser, so it is still treated as a tag.
const HTML_TAG_PATTERN = /<[a-zA-Z/][^<>]*>/g;
const ENTITY_PATTERN = /&(#x[0-9a-f]+|#\d+|[a-z][a-z\d]*);/gi;
const UNIT_CHAR_PATTERN = /[\p{L}\p{N}]/u;
const CJK_CHAR_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WHITESPACE_PATTERN = /\s/u;
const TOKEN_PATTERN = /[^\s]+/g;

/**
 * Named entities decoded without a DOM. Selection text extracted from EPUB
 * DOM nodes is already decoded; these cover XML/HTML escapes a passage may
 * still carry (plus nbsp, which whitespace folding also treats as a space).
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: '\u00a0',
  quot: '"',
};

const stripHtml = (input: string): string => input.replace(HTML_TAG_PATTERN, ' ');

const decodeHtmlEntities = (input: string): string =>
  input.replace(ENTITY_PATTERN, (raw, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1]?.toLowerCase() === 'x';
      const digits = isHex ? body.slice(2) : body.slice(1);
      const codePoint = Number.parseInt(digits, isHex ? 16 : 10);
      return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : raw;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? raw;
  });

const isUnitChar = (char: string): boolean => UNIT_CHAR_PATTERN.test(char);
const isCjkChar = (char: string): boolean => CJK_CHAR_PATTERN.test(char);
const isWhitespace = (char: string): boolean => WHITESPACE_PATTERN.test(char);

const tokenMatches = (input: string): RegExpExecArray[] => [...input.matchAll(TOKEN_PATTERN)];

const tokenHasUnit = (token: string): boolean => {
  for (const char of token) {
    if (isUnitChar(char)) return true;
  }
  return false;
};

/**
 * Normalize text for cache keys:
 * strip HTML/entities → NFKC → lowercase → punctuation → collapse whitespace.
 */
export const normalizeText = (input: string): string =>
  decodeHtmlEntities(stripHtml(input))
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Sha256 hex digest of an already-normalized string. */
export const hashNormalizedText = async (normalized: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export interface NormalizedTextResult {
  normalized: string;
  hash: string;
}

/** Normalize then hash, keeping the intermediate value for cache-key callers. */
export const normalizeAndHashText = async (input: string): Promise<NormalizedTextResult> => {
  const normalized = normalizeText(input);
  return { normalized, hash: await hashNormalizedText(normalized) };
};

/** True when the passage has no meaningful letters/numbers after normalization. */
export const isMeaninglessText = (input: string): boolean => normalizeText(input).length === 0;

export type UnitMode = 'word' | 'char';

export interface UnitCount {
  mode: UnitMode;
  count: number;
}

export interface UnitLimitResult extends UnitCount {
  text: string;
  truncated: boolean;
}

/**
 * Measure a passage in input units. Space-delimited prose is counted by word;
 * CJK-dominant prose falls back to characters. Issue 07 originally detected
 * the no-space case by a chars/tokens ratio, but that ratio also exceeds two
 * for ordinary English words, so ticket 02 fixes the rule as: measure by
 * characters when CJK letters are at least half of all letters/numbers.
 */
export const countUnits = (input: string): UnitCount => {
  let letterCount = 0;
  let cjkCount = 0;
  for (const char of input) {
    if (isUnitChar(char)) {
      letterCount += 1;
      if (isCjkChar(char)) cjkCount += 1;
    }
  }
  if (letterCount === 0) return { mode: 'word', count: 0 };

  const tokens = tokenMatches(input).filter((match) => tokenHasUnit(match[0]));
  const cjkShare = cjkCount / letterCount;
  const mode: UnitMode = cjkShare >= 0.5 ? 'char' : 'word';
  if (mode === 'char') return { mode, count: letterCount };

  return { mode, count: tokens.length };
};

/**
 * Keep the leading `maxUnits` units of a passage, preserving interior line
 * breaks and the display text. `truncated: true` signals the UI to toast
 * that only the first part was explained.
 */
export const truncateToUnitLimit = (
  input: string,
  maxUnits: number = EXPLAINER_INPUT_LIMITS.maxUnits,
): UnitLimitResult => {
  const { mode, count } = countUnits(input);
  if (count === 0 || count <= maxUnits) {
    return { text: input, mode, count, truncated: false };
  }

  if (mode === 'word') {
    const tokens = tokenMatches(input).filter((match) => tokenHasUnit(match[0]));
    // count > maxUnits above means this token always exists.
    const lastKept = tokens[maxUnits - 1]!;
    const cut = lastKept.index + lastKept[0].length;
    return { text: input.slice(0, cut).trimEnd(), mode, count: maxUnits, truncated: true };
  }

  let meaningfulCount = 0;
  let cut = 0;
  for (const char of input) {
    if (!isWhitespace(char) && isUnitChar(char)) {
      meaningfulCount += 1;
      if (meaningfulCount === maxUnits) {
        cut += char.length;
        break;
      }
    }
    cut += char.length;
  }
  return { text: input.slice(0, cut).trimEnd(), mode, count: maxUnits, truncated: true };
};
