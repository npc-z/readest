import { describe, expect, test } from 'vitest';

import { EXPLAINER_SOURCE_LANG_AUTO, resolveExplainLanguages } from '@/services/explainer/language';

describe('resolveExplainLanguages', () => {
  const uiLang = 'zh-Hans';

  test('sourceLang priority: setting > book metadata > auto', () => {
    // Setting wins over book metadata.
    expect(
      resolveExplainLanguages({
        settingsSourceLang: 'en',
        bookLanguage: 'fr',
        uiLang,
      }).sourceLang,
    ).toBe('en');
    // Book metadata wins when no setting.
    expect(resolveExplainLanguages({ bookLanguage: 'fr', uiLang }).sourceLang).toBe('fr');
    // Falls back to auto when neither is present.
    expect(resolveExplainLanguages({ uiLang }).sourceLang).toBe(EXPLAINER_SOURCE_LANG_AUTO);
  });

  test('nativeLang priority: setting > UI language snapshot', () => {
    expect(resolveExplainLanguages({ settingsNativeLang: 'ja', uiLang }).nativeLang).toBe('ja');
    expect(resolveExplainLanguages({ uiLang }).nativeLang).toBe(uiLang);
  });

  test('ignores blank/whitespace settings', () => {
    expect(
      resolveExplainLanguages({ settingsSourceLang: '  ', bookLanguage: 'fr', uiLang }).sourceLang,
    ).toBe('fr');
    expect(resolveExplainLanguages({ settingsNativeLang: ' ', uiLang }).nativeLang).toBe(uiLang);
  });
});
