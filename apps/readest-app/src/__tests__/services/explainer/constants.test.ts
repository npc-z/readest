import { describe, expect, test } from 'vitest';

import {
  DEFAULT_EXPLAINER_THINKING,
  EXPLAINER_DEFAULT_BASE_URL,
  EXPLAINER_ERROR_CODES,
  EXPLAINER_GENERATION_PARAMS,
  EXPLAINER_INPUT_LIMITS,
  EXPLAINER_PROMPT_VERSION,
  EXPLAINER_THINKING_LEVELS,
  EXPLAINER_TIMEOUTS,
  explainerCacheKey,
  explainerMaxOutputTokens,
  explainerTimeoutMs,
} from '@/services/explainer/constants';

describe('explainer constants', () => {
  test('prompt version and input limits are the canonical v1 values', () => {
    expect(EXPLAINER_PROMPT_VERSION).toBe(1);
    expect(EXPLAINER_INPUT_LIMITS).toEqual({
      maxUnits: 500,
      maxNotes: 15,
      maxGrammarNotes: 2,
    });
  });

  test('generation parameters are a single source shared by web and native', () => {
    expect(EXPLAINER_GENERATION_PARAMS).toEqual({
      temperature: 0.2,
      maxOutputTokens: 40960,
      maxOutputTokensOff: 8192,
      maxRetries: 2,
    });
  });

  test('output budget is thinking-aware: off stays tight, reasoning gets the large cap', () => {
    expect(explainerMaxOutputTokens('off')).toBe(8192);
    expect(explainerMaxOutputTokens('low')).toBe(40960);
    expect(explainerMaxOutputTokens('medium')).toBe(40960);
    expect(explainerMaxOutputTokens('high')).toBe(40960);
  });

  test('cache key carries the source language so switching it is a miss', () => {
    expect(explainerCacheKey('book-a', 'hash-1', 'en', 'zh-CN')).toBe('book-a:hash-1:en:zh-CN');
    expect(explainerCacheKey('book-a', 'hash-1', 'fr', 'zh-CN')).not.toBe(
      explainerCacheKey('book-a', 'hash-1', 'en', 'zh-CN'),
    );
  });

  test('default base URL is the single shared OpenRouter constant', () => {
    expect(EXPLAINER_DEFAULT_BASE_URL).toBe('https://openrouter.ai/api/v1');
  });

  test('timeout is 120s by default and 240s for high thinking', () => {
    expect(EXPLAINER_TIMEOUTS.defaultMs).toBe(120_000);
    expect(EXPLAINER_TIMEOUTS.highThinkingMs).toBe(240_000);
    expect(explainerTimeoutMs('off')).toBe(120_000);
    expect(explainerTimeoutMs('low')).toBe(120_000);
    expect(explainerTimeoutMs('medium')).toBe(120_000);
    expect(explainerTimeoutMs('high')).toBe(240_000);
  });

  test('thinking levels are the supported setting domain with off as default', () => {
    expect(EXPLAINER_THINKING_LEVELS).toEqual(['off', 'low', 'medium', 'high']);
    expect(DEFAULT_EXPLAINER_THINKING).toBe('off');
  });

  test('error code table covers every code the service layer may produce', () => {
    expect(EXPLAINER_ERROR_CODES).toEqual([
      'ai-not-configured',
      'timeout',
      'provider-error',
      'no-object-salvaged',
      'invalid-input',
      'rate-limited',
    ]);
  });
});
