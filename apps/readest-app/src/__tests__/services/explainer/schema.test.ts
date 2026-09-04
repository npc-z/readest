import { describe, expect, test } from 'vitest';

import { EXPLAINER_INPUT_LIMITS } from '@/services/explainer/constants';
import { explainerPayloadSchema } from '@/services/explainer/schema';

const validPayload = {
  simple: 'He never thought his old friend could be so dangerous.',
  notes: [
    {
      kind: 'phrase',
      original: 'old friend',
      meaningL: 'a friend you have known for a long time',
      example: 'I met my old friend at the station.',
      meaningM: '老朋友',
    },
  ],
  grammar: [
    {
      structure: 'never thought ... could be',
      noteL: 'The sentence describes something the person did not expect.',
      noteM: null,
    },
  ],
  translationM: '他从未想过他的老朋友会如此危险。',
  metadata: {
    sourceLang: 'en',
    nativeLang: 'zh-CN',
    promptVersion: 1,
  },
};

describe('explainer payload schema', () => {
  test('accepts a canonical payload', () => {
    expect(explainerPayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  test('accepts an empty notes array and omitted grammar/translationM', () => {
    const degraded = {
      simple: 'A plain sentence.',
      notes: [],
      metadata: { sourceLang: 'en', nativeLang: 'zh-CN', promptVersion: 1 },
    };

    expect(explainerPayloadSchema.safeParse(degraded).success).toBe(true);
  });

  test('accepts null or missing example/meaningM/noteM for downgrade display', () => {
    const payload = {
      simple: 'A plain sentence.',
      notes: [{ kind: 'word', original: 'plain', meaningL: 'simple and clear' }],
      grammar: [{ structure: 'A plain sentence.', noteL: 'A normal statement.' }],
      translationM: null,
      metadata: {
        sourceLang: 'en',
        nativeLang: 'zh-CN',
        promptVersion: 1,
        format: 'text',
      },
    };

    expect(explainerPayloadSchema.safeParse(payload).success).toBe(true);
  });

  test('accepts optional metadata.format and strips unknown extra fields', () => {
    const parsed = explainerPayloadSchema.parse({
      ...validPayload,
      metadata: { ...validPayload.metadata, format: 'json' },
      extra: 'ignored',
    });

    expect(parsed.metadata.format).toBe('json');
    expect(parsed).not.toHaveProperty('extra');
  });

  test('rejects malformed note kinds and metadata without sourceLang', () => {
    const badKind = {
      ...validPayload,
      notes: [{ ...validPayload.notes[0], kind: 'sentence' }],
    };
    const missingSourceLang = {
      ...validPayload,
      metadata: { nativeLang: 'zh-CN', promptVersion: 1 },
    };

    expect(explainerPayloadSchema.safeParse(badKind).success).toBe(false);
    expect(explainerPayloadSchema.safeParse(missingSourceLang).success).toBe(false);
  });

  test('accepts over-limit notes and grammar so salvage can slice them later', () => {
    const tooManyNotes = {
      ...validPayload,
      notes: Array.from({ length: EXPLAINER_INPUT_LIMITS.maxNotes + 1 }, (_, index) => ({
        kind: 'word' as const,
        original: `w${index}`,
        meaningL: 'meaning',
      })),
    };
    const tooManyGrammar = {
      ...validPayload,
      grammar: Array.from({ length: EXPLAINER_INPUT_LIMITS.maxGrammarNotes + 1 }, (_, index) => ({
        structure: `s${index}`,
        noteL: 'note',
      })),
    };

    expect(explainerPayloadSchema.safeParse(tooManyNotes).success).toBe(true);
    expect(explainerPayloadSchema.safeParse(tooManyGrammar).success).toBe(true);
  });
});
