'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { FiInfo, FiX } from 'react-icons/fi';
import { RiPushpinLine, RiPushpinFill } from 'react-icons/ri';

import { Overlay } from '@/components/Overlay';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import type { AISettings } from '@/services/ai/types';
import {
  DEFAULT_EXPLAINER_THINKING,
  EXPLAINER_GENERATION_PARAMS,
  EXPLAINER_THINKING_LEVELS,
  explainerCacheKey,
  explainerMaxOutputTokens,
  type ExplainerErrorCode,
  type ExplainerThinkingLevel,
} from '@/services/explainer/constants';
import type { ExplanationEntry } from '@/services/explainer/ExplainerDb';
import { isAiConfigured } from '@/services/explainer/gateway';
import {
  EXPLAINER_LANG_OPTIONS,
  EXPLAINER_SOURCE_LANG_AUTO,
  resolveExplainLanguages,
} from '@/services/explainer/language';
import type { ExplainerPayload } from '@/services/explainer/schema';
import { eventDispatcher } from '@/utils/event';
import { getLocale } from '@/utils/misc';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  resolveBookHash,
  selectExpandedTiers,
  useExplainerStore,
  type ExplainerOpenRequest,
} from '@/store/explainerStore';
import type { ExplainerSettings } from '@/types/settings';
import ExplainerCascade from './ExplainerCascade';
import { createExplainerGenerator, type ExplainerGenerator } from './generator';

type GenerationState =
  | { status: 'idle' }
  | { status: 'loading'; force: boolean }
  | { status: 'ready'; entry: ExplanationEntry }
  | { status: 'error'; code: ExplainerErrorCode; force: boolean };

type HistoryState =
  | { status: 'loading'; entries: ExplanationEntry[] }
  | { status: 'ready'; entries: ExplanationEntry[]; busyId: string | null }
  | { status: 'error'; entries: ExplanationEntry[]; busyId: string | null };

/** Empty option meaning "use the UI snapshot" for the native-language selector. */
const NATIVE_LANG_RESET_VALUE = '';

const HISTORY_PAGE_SIZE = 50;

const entryKeyOf = (entry: ExplanationEntry): string =>
  explainerCacheKey(entry.bookHash, entry.textHash, entry.nativeLang);

const errorCodeOf = (error: unknown): ExplainerErrorCode => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code: ExplainerErrorCode }).code;
  }
  return 'provider-error';
};

const toastIfTruncated = (entry: ExplanationEntry, translate: (key: string) => string): void => {
  if (entry.truncated) {
    eventDispatcher.dispatch('toast', {
      type: 'warning',
      message: translate('Only the first part was explained.'),
      timeout: 3000,
    });
  }
};

const ERROR_MESSAGE_KEYS: Record<ExplainerErrorCode, string> = {
  'ai-not-configured': 'AI is not configured.',
  timeout: 'The request timed out.',
  'provider-error': 'The AI provider returned an error.',
  'no-object-salvaged': 'The answer could not be parsed.',
  'invalid-input': 'There is nothing to explain.',
  'rate-limited': 'Too many requests. Please try again later.',
};

/** First line of a passage, for the compact history row label. */
const firstLineOf = (text: string): string => {
  const trimmed = text.trim().split(/\r?\n/)[0]?.trim() ?? '';
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
};

/** Read-only generation tuning shown in the info popover (never editable). */
const readOnlyTuning = (
  aiSettings: AISettings,
  thinking: ExplainerThinkingLevel,
): { provider: string; model: string; temperature: number; maxTokens: number } => {
  let provider = 'OpenAI Compatible';
  let model = aiSettings.openrouterModel ?? '';
  if (aiSettings.provider === 'ollama') {
    provider = 'Ollama';
    model = aiSettings.ollamaModel;
  } else if (aiSettings.provider === 'ai-gateway') {
    provider = 'AI Gateway';
    model = aiSettings.aiGatewayCustomModel || aiSettings.aiGatewayModel || '';
  }
  return {
    provider,
    model,
    temperature: EXPLAINER_GENERATION_PARAMS.temperature,
    maxTokens: explainerMaxOutputTokens(thinking),
  };
};

/** Ensure a select value that falls outside the curated list is still selectable. */
const ensureOptionValue = (
  value: string | undefined,
  options: readonly { value: string; label: string }[],
  extraLabel: string,
): { value: string; label: string }[] => {
  if (!value) return [...options];
  return options.some((o) => o.value === value)
    ? [...options]
    : [...options, { value, label: `${extraLabel} (${value})` }];
};

/** Compact header select shared by the source/native/thinking controls. */
function PanelSelect({
  testId,
  ariaLabel,
  value,
  onChange,
  disabled,
  isEink,
  children,
}: {
  testId: string;
  ariaLabel: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  isEink: boolean;
  children: ReactNode;
}) {
  return (
    <select
      data-testid={testId}
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={clsx('select select-xs', isEink ? 'eink-bordered bg-base-100' : 'bg-base-100')}
    >
      {children}
    </select>
  );
}

export interface ExplainerPanelProps {
  /** Inject for tests; defaults to a real service built from appService+settings. */
  generator?: ExplainerGenerator;
  onOpenSettings?: () => void;
  /** Book key used to read the view settings (e-ink) for the current book. */
  bookKey?: string | null;
}

/**
 * Right-hand floating panel shell, mutually exclusive with the Notebook via
 * `explainerStore`. Renders the four-tier cascade, drives the generation loop
 * (skeleton → cascade, inline error, not-configured empty state), and hosts the
 * panel header: language/thinking config (persisted to `explainerSettings`),
 * read-only provider tuning, and the current-entry vs book-history switch.
 */
export default function ExplainerPanel({
  generator,
  onOpenSettings,
  bookKey,
}: ExplainerPanelProps) {
  const _ = useTranslation();
  const { appService, envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const { getViewSettings } = useReaderStore();
  const getBookData = useBookDataStore((s) => s.getBookData);
  const isExplainerVisible = useExplainerStore((s) => s.isExplainerVisible);
  const isExplainerPinned = useExplainerStore((s) => s.isExplainerPinned);
  const currentItemKey = useExplainerStore((s) => s.currentItemKey);
  const request = useExplainerStore((s) => s.request);
  const view = useExplainerStore((s) => s.view);
  const setView = useExplainerStore((s) => s.setView);
  const getExplainerWidth = useExplainerStore((s) => s.getExplainerWidth);
  const setExplainerVisible = useExplainerStore((s) => s.setExplainerVisible);
  const toggleExplainerPin = useExplainerStore((s) => s.toggleExplainerPin);
  const setCurrentItemKey = useExplainerStore((s) => s.setCurrentItemKey);
  const toggleTier = useExplainerStore((s) => s.toggleTier);
  const clearRequest = useExplainerStore((s) => s.clearRequest);
  const expanded = useExplainerStore(selectExpandedTiers);
  const viewSettings = getViewSettings(bookKey ?? '');
  const isEink = viewSettings?.isEink === true;
  const [generation, setGeneration] = useState<GenerationState>({ status: 'idle' });
  const [history, setHistory] = useState<HistoryState>({ status: 'loading', entries: [] });
  const [showTuning, setShowTuning] = useState(false);

  const aiSettings = settings.aiSettings ?? DEFAULT_AI_SETTINGS;
  const aiConfigured = isAiConfigured(aiSettings);

  const explainerSettings = settings.explainerSettings ?? {};
  const activeThinking = explainerSettings.thinking ?? DEFAULT_EXPLAINER_THINKING;

  const bookData = getBookData(bookKey ?? '');
  const bookHash = resolveBookHash(bookData?.book?.hash, bookKey ?? undefined, request?.bookHash);

  const gen = useMemo(
    () => generator ?? createExplainerGenerator(appService, aiSettings),
    [generator, appService, aiSettings],
  );

  // The resolved language pair, shown in the header and used to pre-select the
  // native-language dropdown to the UI snapshot when no setting is present.
  const resolvedLanguages = useMemo(
    () =>
      resolveExplainLanguages({
        settingsSourceLang: explainerSettings.sourceLang,
        settingsNativeLang: explainerSettings.nativeLang,
        bookLanguage: bookData?.book?.primaryLanguage,
        uiLang: getLocale(),
      }),
    [explainerSettings.sourceLang, explainerSettings.nativeLang, bookData?.book?.primaryLanguage],
  );

  const tuning = useMemo(
    () => readOnlyTuning(aiSettings, activeThinking),
    [aiSettings, activeThinking],
  );

  // The cascade only shows content once an entry has been resolved. When a
  // fresh selection opens (currentItemKey null) and AI is configured, generate.
  useEffect(() => {
    if (!isExplainerVisible || !request || currentItemKey !== null) return;
    if (!aiConfigured || !gen) return;

    let cancelled = false;
    setGeneration({ status: 'loading', force: false });
    gen.getOrGenerate(request).then(
      (entry) => {
        if (cancelled) return;
        setCurrentItemKey(entryKeyOf(entry));
        setGeneration({ status: 'ready', entry });
        toastIfTruncated(entry, (key) => _(key));
      },
      (error: unknown) => {
        if (cancelled) return;
        setGeneration({ status: 'error', code: errorCodeOf(error), force: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isExplainerVisible, request, currentItemKey, aiConfigured, gen, setCurrentItemKey]);

  // Apply the panel's current resolved languages + thinking to a request so
  // Regenerate/Retry after changing a header setting use fresh values instead of
  // the open-time snapshot captured by `handleExplainer` (the store request is
  // only set once per selection). The cache key follows `nativeLang`, so a
  // changed native language naturally creates a fresh key/entry.
  const withCurrentSettings = useCallback(
    (base: ExplainerOpenRequest): ExplainerOpenRequest => ({
      ...base,
      sourceLang: resolvedLanguages.sourceLang,
      nativeLang: resolvedLanguages.nativeLang,
      thinking: activeThinking,
    }),
    [resolvedLanguages.sourceLang, resolvedLanguages.nativeLang, activeThinking],
  );

  const runGenerate = useCallback(
    async (force: boolean) => {
      if (!request || !gen) return;
      const req = withCurrentSettings(request);
      // Persist the refreshed request so a subsequent Retry/Regenerate keeps the
      // (possibly language-changed) selection rather than reverting to open time.
      useExplainerStore.setState({ request: req });
      setGeneration({ status: 'loading', force });
      try {
        const entry = force ? await gen.regenerate(req) : await gen.getOrGenerate(req);
        setCurrentItemKey(entryKeyOf(entry));
        setGeneration({ status: 'ready', entry });
        toastIfTruncated(entry, (key) => _(key));
      } catch (error) {
        setGeneration({ status: 'error', code: errorCodeOf(error), force });
      }
    },
    [request, gen, withCurrentSettings, setCurrentItemKey],
  );

  const handleDelete = useCallback(async () => {
    if (!request || !gen || generation.status !== 'ready') return;
    if (!window.confirm(_('Delete this explanation?'))) return;
    await gen.deleteExplanation(generation.entry.id);
    // Clear the request so the generation effect doesn't immediately regenerate
    // the just-deleted explanation for the same selection.
    clearRequest();
    setGeneration({ status: 'idle' });
  }, [request, gen, generation, clearRequest, _]);

  // Build a generation request from a stored row (used by history ops).
  const requestFromEntry = useCallback(
    (entry: ExplanationEntry): ExplainerOpenRequest => ({
      text: entry.text,
      cfi: entry.cfi,
      bookHash: entry.bookHash,
      bookTitle: entry.bookTitle,
      sourceLang: entry.sourceLang,
      nativeLang: entry.nativeLang,
      thinking: activeThinking,
    }),
    [activeThinking],
  );

  const loadHistory = useCallback(async () => {
    if (!gen) return;
    setHistory((prev) => (prev.status === 'ready' ? prev : { status: 'loading', entries: [] }));
    try {
      const entries = await gen.listByBook(bookHash, { limit: HISTORY_PAGE_SIZE, offset: 0 });
      setHistory({ status: 'ready', entries, busyId: null });
    } catch {
      setHistory({ status: 'error', entries: [], busyId: null });
    }
  }, [gen, bookHash]);

  // Load the book history whenever the panel switches to the history view.
  useEffect(() => {
    if (!isExplainerVisible || view !== 'history') return;
    void loadHistory();
  }, [isExplainerVisible, view, loadHistory]);

  const openHistoryEntry = useCallback(
    (entry: ExplanationEntry) => {
      const req = requestFromEntry(entry);
      useExplainerStore.setState({ request: req, view: 'item' });
      setCurrentItemKey(entryKeyOf(entry));
      setGeneration({ status: 'ready', entry });
    },
    [requestFromEntry, setCurrentItemKey],
  );

  const handleHistoryRegenerate = useCallback(
    async (entry: ExplanationEntry) => {
      if (!gen) return;
      setHistory((prev) => (prev.status === 'ready' ? { ...prev, busyId: entry.id } : prev));
      const req = requestFromEntry(entry);
      // Set the request up front so that, when regeneration fails, the item
      // view's Retry/Regenerate still target the entry that was being refreshed
      // (spec #27: inline error + retry must be recoverable in place).
      useExplainerStore.setState({ request: req, view: 'item' });
      try {
        const refreshed = await gen.regenerate(req);
        setCurrentItemKey(entryKeyOf(refreshed));
        setGeneration({ status: 'ready', entry: refreshed });
        toastIfTruncated(refreshed, (key) => _(key));
      } catch (error) {
        setGeneration({ status: 'error', code: errorCodeOf(error), force: true });
      } finally {
        setHistory((prev) => (prev.status === 'ready' ? { ...prev, busyId: null } : prev));
        void loadHistory();
      }
    },
    [gen, requestFromEntry, setCurrentItemKey, loadHistory, _],
  );

  const handleHistoryDelete = useCallback(
    async (entry: ExplanationEntry) => {
      if (!gen) return;
      if (!window.confirm(_('Delete this explanation?'))) return;
      await gen.deleteExplanation(entry.id);
      // If the deleted row was the current item, reset the item view to idle so
      // the effect doesn't immediately regenerate it for the same selection.
      if (currentItemKey === entryKeyOf(entry)) {
        clearRequest();
        setGeneration({ status: 'idle' });
      }
      void loadHistory();
    },
    [gen, currentItemKey, clearRequest, loadHistory, _],
  );

  const updateExplainerSettings = useCallback(
    (patch: Partial<ExplainerSettings>) => {
      if (!envConfig) return;
      const current = settings.explainerSettings ?? {};
      const next = { ...current, ...patch };
      const newSettings = { ...settings, explainerSettings: next };
      setSettings(newSettings);
      void saveSettings(envConfig, newSettings);
    },
    [envConfig, settings, setSettings, saveSettings],
  );

  const isMobile =
    appService?.isMobile === true || window.innerWidth < 640 || window.innerHeight < 640;

  if (!isExplainerVisible) return null;

  // The header selects edit the *configured* value, so each is bound to the
  // setting (or its sentinel when unset) — that keeps the "Auto" options
  // selectable and makes a user-chosen locale distinguishable from a snapshot
  // fallback. The effective (resolved) pair is shown as a read-only line so the
  // header still displays the resolution (ticket 06 language parsing).
  const sourceSelectValue = explainerSettings.sourceLang ?? EXPLAINER_SOURCE_LANG_AUTO;
  const nativeSelectValue = explainerSettings.nativeLang ?? NATIVE_LANG_RESET_VALUE;
  const sourceOptions = ensureOptionValue(sourceSelectValue, EXPLAINER_LANG_OPTIONS, _('Custom'));
  const nativeOptions = ensureOptionValue(
    nativeSelectValue === NATIVE_LANG_RESET_VALUE ? undefined : nativeSelectValue,
    EXPLAINER_LANG_OPTIONS,
    _('Custom'),
  ).filter((o) => o.value !== EXPLAINER_SOURCE_LANG_AUTO);

  return (
    <>
      {!isExplainerPinned && (
        <Overlay
          onDismiss={() => setExplainerVisible(false)}
          className={clsx('z-[45]', viewSettings?.isEink ? '' : 'bg-black/50 sm:bg-black/20')}
        />
      )}
      <div
        role='group'
        aria-label={_('Explain')}
        className={clsx(
          'explainer-container end-0 flex min-w-60 select-none flex-col font-sans text-sm text-base-content',
          viewSettings?.isEink ? 'bg-base-100' : 'bg-base-200',
          isExplainerPinned ? 'z-20' : 'z-[45] shadow-2xl',
          !isExplainerPinned && viewSettings?.isEink && 'border-base-content border-s',
        )}
        style={{
          width: isMobile ? '100%' : getExplainerWidth() || '26rem',
          maxWidth: isMobile ? '100%' : '45%',
          position: isMobile ? 'fixed' : isExplainerPinned ? 'relative' : 'absolute',
        }}
      >
        <header className='flex items-center justify-between border-b border-base-content/10 px-3 py-2'>
          <h2 className='text-xs font-semibold uppercase tracking-wide text-base-content/60'>
            {_('Explain')}
          </h2>
          <div className='flex items-center gap-1'>
            <button
              type='button'
              aria-label={_('Pin panel')}
              data-testid='explainer-pin'
              onClick={toggleExplainerPin}
              className='btn btn-ghost btn-xs'
            >
              {isExplainerPinned ? <RiPushpinFill /> : <RiPushpinLine />}
            </button>
            <button
              type='button'
              aria-label={_('Close panel')}
              data-testid='explainer-close'
              onClick={() => setExplainerVisible(false)}
              className='btn btn-ghost btn-xs'
            >
              <FiX />
            </button>
          </div>
        </header>

        <div className='flex flex-wrap items-center gap-2 border-b border-base-content/10 px-3 py-2'>
          <div
            role='tablist'
            aria-label={_('Explainer view')}
            className='flex items-center gap-1 rounded-box bg-base-content/10 p-0.5'
          >
            <button
              type='button'
              role='tab'
              data-testid='explainer-view-item'
              aria-selected={view === 'item'}
              aria-controls='explainer-content'
              onClick={() => setView('item')}
              className={clsx(
                'btn btn-xs border-0',
                view === 'item'
                  ? 'btn-neutral'
                  : 'btn-ghost text-base-content/60 hover:text-base-content',
              )}
            >
              {_('Current entry')}
            </button>
            <button
              type='button'
              role='tab'
              data-testid='explainer-view-history'
              aria-selected={view === 'history'}
              aria-controls='explainer-content'
              onClick={() => setView('history')}
              className={clsx(
                'btn btn-xs border-0',
                view === 'history'
                  ? 'btn-neutral'
                  : 'btn-ghost text-base-content/60 hover:text-base-content',
              )}
            >
              {_('Book history')}
            </button>
          </div>

          <div className='ms-auto flex items-center gap-1'>
            <PanelSelect
              testId='explainer-source-lang'
              ariaLabel={_('Source language')}
              value={sourceSelectValue}
              onChange={(e) => updateExplainerSettings({ sourceLang: e.target.value })}
              disabled={!aiConfigured}
              isEink={isEink}
            >
              {sourceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {_(o.label)}
                </option>
              ))}
            </PanelSelect>
            <PanelSelect
              testId='explainer-native-lang'
              ariaLabel={_('Native language')}
              value={nativeSelectValue}
              onChange={(e) =>
                updateExplainerSettings({
                  nativeLang:
                    e.target.value === NATIVE_LANG_RESET_VALUE ? undefined : e.target.value,
                })
              }
              disabled={!aiConfigured}
              isEink={isEink}
            >
              <option value={NATIVE_LANG_RESET_VALUE}>{_('Auto (UI language)')}</option>
              {nativeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {_(o.label)}
                </option>
              ))}
            </PanelSelect>
            <PanelSelect
              testId='explainer-thinking'
              ariaLabel={_('Thinking')}
              value={activeThinking}
              onChange={(e) =>
                updateExplainerSettings({ thinking: e.target.value as ExplainerThinkingLevel })
              }
              disabled={!aiConfigured}
              isEink={isEink}
            >
              {EXPLAINER_THINKING_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {_(`Thinking ${level}`)}
                </option>
              ))}
            </PanelSelect>
            <button
              type='button'
              data-testid='explainer-tuning'
              aria-label={_('Generation settings')}
              aria-expanded={showTuning}
              onClick={() => setShowTuning((v) => !v)}
              className='btn btn-ghost btn-xs'
            >
              <FiInfo />
            </button>
          </div>
        </div>

        <div
          data-testid='explainer-resolved-langs'
          className='border-b border-base-content/10 px-3 py-1 text-[11px] text-base-content/60'
        >
          {_('Source')}: {resolvedLanguages.sourceLang} · {_('Native')}:{' '}
          {resolvedLanguages.nativeLang}
        </div>

        {showTuning && (
          <div
            role='group'
            aria-label={_('Generation settings')}
            data-testid='explainer-tuning-info'
            className={clsx(
              'border-b border-base-content/10 px-3 py-2 text-xs text-base-content/70',
              viewSettings?.isEink && 'eink-bordered',
            )}
          >
            <p>
              {_('Provider')}:{' '}
              <span className='font-medium text-base-content'>{tuning.provider}</span>
            </p>
            <p>
              {_('Model')}:{' '}
              <span className='font-medium text-base-content'>{tuning.model || '—'}</span>
            </p>
            <p>
              {_('Temperature')}:{' '}
              <span className='font-medium text-base-content'>{tuning.temperature}</span>
            </p>
            <p>
              {_('Max tokens')}:{' '}
              <span className='font-medium text-base-content'>{tuning.maxTokens}</span>
            </p>
          </div>
        )}

        <div id='explainer-content' className='min-h-0 flex-1 overflow-y-auto p-3'>
          {view === 'history' ? (
            <HistoryList
              history={history}
              onOpen={openHistoryEntry}
              onRegenerate={handleHistoryRegenerate}
              onDelete={handleHistoryDelete}
              isEink={isEink}
              _={_}
            />
          ) : generation.status === 'ready' ? (
            <div className='flex flex-col gap-2'>
              <ExplainerCascade
                payload={generation.entry.payload as ExplainerPayload}
                expanded={expanded}
                onToggle={toggleTier}
              />
              <div className='flex gap-2'>
                <button
                  type='button'
                  data-testid='explainer-regenerate'
                  onClick={() => runGenerate(true)}
                  className='btn btn-sm btn-outline'
                >
                  {_('Regenerate')}
                </button>
                <button
                  type='button'
                  data-testid='explainer-delete'
                  onClick={handleDelete}
                  className='btn btn-sm btn-outline'
                >
                  {_('Delete')}
                </button>
              </div>
            </div>
          ) : generation.status === 'error' ? (
            <div className='flex flex-col gap-2'>
              <ExplainerCascade
                payload={fallbackPayload()}
                expanded={expanded}
                onToggle={toggleTier}
                status='error'
                errorMessage={_(ERROR_MESSAGE_KEYS[generation.code])}
              />
              <div className='flex gap-2'>
                <button
                  type='button'
                  data-testid='explainer-retry'
                  onClick={() => runGenerate(generation.force)}
                  className='btn btn-sm btn-neutral'
                >
                  {_('Retry')}
                </button>
              </div>
            </div>
          ) : !aiConfigured ? (
            <div className='flex flex-col items-center gap-2 py-8 text-center'>
              <p className='text-sm'>
                {_('Explain needs an AI provider. Configure one to get started.')}
              </p>
              {onOpenSettings && (
                <button
                  type='button'
                  data-testid='explainer-open-settings'
                  onClick={onOpenSettings}
                  className='btn btn-sm btn-neutral'
                >
                  {_('AI settings')}
                </button>
              )}
            </div>
          ) : generation.status === 'loading' ? (
            <ExplainerCascade
              payload={fallbackPayload()}
              expanded={expanded}
              onToggle={toggleTier}
              status='loading'
            />
          ) : (
            <p className='text-sm text-base-content/60'>{_('Select text, then tap Explain.')}</p>
          )}
        </div>
      </div>
    </>
  );
}

const fallbackPayload = (): ExplainerPayload => ({
  simple: '',
  notes: [],
  grammar: [],
  translationM: null,
  metadata: { sourceLang: 'auto', nativeLang: 'en', promptVersion: 1 },
});

const BADGE_KEYS: { key: string; visible: (p: ExplainerPayload) => boolean }[] = [
  { key: 'Words & Phrases', visible: (p) => (p.notes?.length ?? 0) > 0 },
  { key: 'Grammar', visible: (p) => (p.grammar?.length ?? 0) > 0 },
  { key: 'Translation', visible: (p) => Boolean(p.translationM?.trim()) },
];

function HistoryList({
  history,
  onOpen,
  onRegenerate,
  onDelete,
  isEink,
  _,
}: {
  history: HistoryState;
  onOpen: (entry: ExplanationEntry) => void;
  onRegenerate: (entry: ExplanationEntry) => void;
  onDelete: (entry: ExplanationEntry) => void;
  isEink: boolean;
  _: (key: string, options?: Record<string, string | number>) => string;
}) {
  if (history.status === 'loading' && history.entries.length === 0) {
    return (
      <div role='status' aria-busy='true' className='text-sm text-base-content/60'>
        {_('Loading...')}
      </div>
    );
  }
  if (history.status === 'error') {
    return (
      <p role='alert' className='text-sm text-base-content/70'>
        {_('Could not load history.')}
      </p>
    );
  }
  if (history.entries.length === 0) {
    return <p className='text-sm text-base-content/60'>{_('No explanations in this book yet.')}</p>;
  }

  return (
    <ul className='flex flex-col gap-2'>
      {history.entries.map((entry) => (
        <li
          key={entry.id}
          className={clsx(
            'rounded-box border border-base-content/10 p-2',
            isEink && 'eink-bordered',
          )}
        >
          <button
            type='button'
            data-testid='explainer-history-row'
            onClick={() => onOpen(entry)}
            className='block w-full text-start text-sm font-medium hover:text-base-content/80'
          >
            {firstLineOf(entry.text)}
          </button>
          <div className='mt-1 flex flex-wrap items-center gap-1 text-[11px] text-base-content/60'>
            <span className='badge badge-outline badge-sm'>
              {entry.bookTitle || entry.bookHash}
            </span>
            <span className='badge badge-outline badge-sm'>
              {new Date(entry.createdAt).toLocaleDateString()}
            </span>
            {(entry.payload as ExplainerPayload)?.metadata?.format !== 'text' &&
              BADGE_KEYS.filter((b) => b.visible(entry.payload as ExplainerPayload)).map((b) => (
                <span key={b.key} className='badge badge-ghost badge-sm'>
                  {_(b.key)}
                </span>
              ))}
          </div>
          <div className='mt-2 flex gap-2'>
            <button
              type='button'
              data-testid='explainer-history-regenerate'
              onClick={() => onRegenerate(entry)}
              disabled={history.status === 'ready' && history.busyId === entry.id}
              className='btn btn-xs btn-outline'
            >
              {_('Regenerate')}
            </button>
            <button
              type='button'
              data-testid='explainer-history-delete'
              onClick={() => onDelete(entry)}
              className='btn btn-xs btn-outline'
            >
              {_('Delete')}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
