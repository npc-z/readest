/**
 * Language resolution for the explainer panel (ticket 06).
 *
 * The cache key stays `(bookHash, textHash, nativeLang)`, so only `nativeLang`
 * affects which cached explanation a passage hits. `sourceLang` is a generation
 * hint: when it resolves to 'auto' the model detects the source itself and
 * records the result in `payload.metadata.sourceLang`.
 */

/** Resolved languages handed to the panel and the generation request. */
export interface ExplainLanguages {
  sourceLang: string;
  nativeLang: string;
}

/**
 * Reset value for `sourceLang` when neither the user setting nor the book
 * metadata provides one. The model then detects the source language at
 * generation time and records it in the payload metadata.
 */
export const EXPLAINER_SOURCE_LANG_AUTO = 'auto';

/**
 * Curated options for the panel language selectors. Kept intentionally small —
 * the codebase has no shared language list, and a free-text locale is always
 * honored because the resolver reads whatever the user picks. 'auto' is valid
 * only as a source-language option (the model detects it); it is never a
 * native-language choice.
 */
export const EXPLAINER_LANG_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto (detect)' },
  { value: 'en', label: 'English' },
  { value: 'zh-Hans', label: '中文（简体）' },
  { value: 'zh-Hant', label: '中文（繁體）' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
  { value: 'ar', label: 'العربية' },
];

/**
 * The language-priority table from the spec:
 *   sourceLang = userSetting?.sourceLang ?? bookMetadataLanguage ?? 'auto'
 *   nativeLang = userSetting?.nativeLang ?? uiLanguageSnapshot
 *
 * Both inputs are optional so the same pure resolver serves the reading entry
 * point (handleExplainer), the panel header (showing the resolved pair), and
 * unit tests of the priority table.
 */
export const resolveExplainLanguages = (params: {
  settingsSourceLang?: string;
  settingsNativeLang?: string;
  bookLanguage?: string;
  uiLang: string;
}): ExplainLanguages => {
  const trimmedSourceLang = params.settingsSourceLang?.trim();
  const trimmedBookLang = params.bookLanguage?.trim();
  return {
    sourceLang: trimmedSourceLang || trimmedBookLang || EXPLAINER_SOURCE_LANG_AUTO,
    nativeLang: params.settingsNativeLang?.trim() || params.uiLang,
  };
};
