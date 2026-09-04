import { describe, expect, test } from 'vitest';

import {
  countUnits,
  hashNormalizedText,
  isMeaninglessText,
  normalizeAndHashText,
  normalizeText,
  truncateToUnitLimit,
} from '@/services/explainer/text';

describe('explainer text normalization', () => {
  test('strips HTML tags and decodes HTML entities', () => {
    expect(normalizeText('<p>Tom &amp; Jerry</p>')).toBe('tom jerry');
    expect(normalizeText('<b>It&#39;s <i>fine</i></b>')).toBe('it s fine');
    expect(normalizeText('R&amp;D <span>lab</span>')).toBe('r d lab');
  });

  test('applies NFKC so fullwidth text normalizes to halfwidth', () => {
    expect(normalizeText('Ｈｅｌｌｏ，Ｗｏｒｌｄ！')).toBe('hello world');
    expect(normalizeText('ＡＢＣ１２３')).toBe('abc123');
  });

  test('lowercases, drops punctuation and collapses whitespace', () => {
    expect(normalizeText('Hello, World!')).toBe('hello world');
    expect(normalizeText('Hello,\n\n  world  ')).toBe('hello world');
    expect(normalizeText('can&#39;t stop')).toBe('can t stop');
  });

  test('preserves non-ASCII letters such as CJK text', () => {
    expect(normalizeText(' 你好，世界！ ')).toBe('你好 世界');
    expect(normalizeText('Café déjà vu')).toBe('café déjà vu');
  });

  test('keeps only the normalized result, trimming and collapsing repeated tags', () => {
    expect(normalizeText('<p>Hello</p><p>World</p>')).toBe('hello world');
  });

  test('leaves comparison operators in prose intact', () => {
    expect(normalizeText('if x < 3 then y > 2')).toBe('if x 3 then y 2');
    expect(normalizeText('2 < 3 && 5 > 4')).toBe('2 3 5 4');
  });

  test('returns empty for whitespace-only or punctuation-only text', () => {
    expect(normalizeText('   \n\t  ')).toBe('');
    expect(normalizeText('!!! ... —')).toBe('');
    expect(normalizeText('<p>&nbsp;</p>')).toBe('');
  });

  test('isMeaninglessText follows the normalized result', () => {
    expect(isMeaninglessText('!!!')).toBe(true);
    expect(isMeaninglessText(' \n ')).toBe(true);
    expect(isMeaninglessText('<p>&nbsp;</p>')).toBe(true);
    expect(isMeaninglessText('A passage.')).toBe(false);
  });
});

describe('explainer text hashing', () => {
  test('normalizeAndHashText returns the normalized text and a sha256 hex digest', async () => {
    const { normalized, hash } = await normalizeAndHashText('Hello, World!');

    expect(normalized).toBe('hello world');
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('different display forms that normalize the same share one cache hash', async () => {
    const displayForm = await normalizeAndHashText('Hello,\n WORLD!');
    const htmlForm = await normalizeAndHashText('<p>hello world</p>');

    expect(displayForm.hash).toBe(htmlForm.hash);
    expect(displayForm.normalized).toBe(htmlForm.normalized);
  });

  test('hashNormalizedText hashes the exact normalized input', async () => {
    await expect(hashNormalizedText('中文文本')).resolves.toBe(
      '2dc1ebe5ba15afd5176c844129fa871cde2e0906a5d98027eb074fdead038c70',
    );
  });
});

describe('explainer unit counting', () => {
  test('counts English prose in words', () => {
    expect(countUnits('The quick brown fox')).toEqual({ mode: 'word', count: 4 });
    expect(countUnits('Hello, world!')).toEqual({ mode: 'word', count: 2 });
  });

  test('counts CJK prose in characters', () => {
    expect(countUnits('你好世界')).toEqual({ mode: 'char', count: 4 });
    expect(countUnits('안녕하세요')).toEqual({ mode: 'char', count: 5 });
  });

  test('counts word-spaced prose in words even with occasional CJK', () => {
    expect(countUnits('I met 王明 three times')).toEqual({ mode: 'word', count: 5 });
    expect(countUnits('你好, hello')).toEqual({ mode: 'word', count: 2 });
  });

  test('punctuation-only text has zero units', () => {
    expect(countUnits('!!! ---')).toEqual({ mode: 'word', count: 0 });
    expect(countUnits('')).toEqual({ mode: 'word', count: 0 });
  });
});

describe('explainer unit truncation', () => {
  test('truncates English prose to the leading words and marks it truncated', () => {
    expect(truncateToUnitLimit('one two three four five', 3)).toEqual({
      text: 'one two three',
      mode: 'word',
      count: 3,
      truncated: true,
    });
  });

  test('preserves interior line breaks when truncating words', () => {
    expect(truncateToUnitLimit('one two\n\nthree four five', 3)).toEqual({
      text: 'one two\n\nthree',
      mode: 'word',
      count: 3,
      truncated: true,
    });
  });

  test('truncates CJK prose to the leading characters', () => {
    expect(truncateToUnitLimit('一二三四五六七八九十', 4)).toEqual({
      text: '一二三四',
      mode: 'char',
      count: 4,
      truncated: true,
    });
  });

  test('returns the input unchanged when it fits within the limit', () => {
    expect(truncateToUnitLimit('one two three', 3)).toEqual({
      text: 'one two three',
      mode: 'word',
      count: 3,
      truncated: false,
    });
    expect(truncateToUnitLimit('你好', 2)).toEqual({
      text: '你好',
      mode: 'char',
      count: 2,
      truncated: false,
    });
  });

  test('truncation defaults to the shared 500-unit limit', () => {
    const words = Array.from({ length: 600 }, (_, index) => `w${index}`);
    const result = truncateToUnitLimit(words.join(' '));

    expect(result.truncated).toBe(true);
    expect(result.count).toBe(500);
    expect(result.text).toBe(words.slice(0, 500).join(' '));
  });

  test('punctuation-only input is never truncated', () => {
    expect(truncateToUnitLimit('!!!', 500)).toEqual({
      text: '!!!',
      mode: 'word',
      count: 0,
      truncated: false,
    });
  });
});
