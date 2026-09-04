'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { RiPushpinLine, RiPushpinFill } from 'react-icons/ri';

import { Overlay } from '@/components/Overlay';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { explainerCacheKey, type ExplainerErrorCode } from '@/services/explainer/constants';
import type { ExplanationEntry } from '@/services/explainer/ExplainerDb';
import { isAiConfigured } from '@/services/explainer/gateway';
import type { ExplainerPayload } from '@/services/explainer/schema';
import { eventDispatcher } from '@/utils/event';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { selectExpandedTiers, useExplainerStore } from '@/store/explainerStore';
import ExplainerCascade from './ExplainerCascade';
import { createExplainerGenerator, type ExplainerGenerator } from './generator';

type GenerationState =
  | { status: 'idle' }
  | { status: 'loading'; force: boolean }
  | { status: 'ready'; entry: ExplanationEntry }
  | { status: 'error'; code: ExplainerErrorCode; force: boolean };

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

export interface ExplainerPanelProps {
  /** Inject for tests; defaults to a real service built from appService+settings. */
  generator?: ExplainerGenerator;
  onOpenSettings?: () => void;
  /** Book key used to read the view settings (e-ink) for the current book. */
  bookKey?: string | null;
}

/**
 * Right-hand floating panel shell, mutually exclusive with the Notebook via
 * `explainerStore`. Renders the four-tier cascade and drives the generation
 * loop (skeleton → cascade, inline error, not-configured empty state).
 */
export default function ExplainerPanel({
  generator,
  onOpenSettings,
  bookKey,
}: ExplainerPanelProps) {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { getViewSettings } = useReaderStore();
  const isExplainerVisible = useExplainerStore((s) => s.isExplainerVisible);
  const isExplainerPinned = useExplainerStore((s) => s.isExplainerPinned);
  const currentItemKey = useExplainerStore((s) => s.currentItemKey);
  const request = useExplainerStore((s) => s.request);
  const getExplainerWidth = useExplainerStore((s) => s.getExplainerWidth);
  const setExplainerVisible = useExplainerStore((s) => s.setExplainerVisible);
  const toggleExplainerPin = useExplainerStore((s) => s.toggleExplainerPin);
  const setCurrentItemKey = useExplainerStore((s) => s.setCurrentItemKey);
  const toggleTier = useExplainerStore((s) => s.toggleTier);
  const clearRequest = useExplainerStore((s) => s.clearRequest);
  const expanded = useExplainerStore(selectExpandedTiers);
  const viewSettings = getViewSettings(bookKey ?? '');
  const [generation, setGeneration] = useState<GenerationState>({ status: 'idle' });

  const aiSettings = settings.aiSettings ?? DEFAULT_AI_SETTINGS;
  const aiConfigured = isAiConfigured(aiSettings);
  const gen = useMemo(
    () => generator ?? createExplainerGenerator(appService, aiSettings),
    [generator, appService, aiSettings],
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

  const runGenerate = useCallback(
    async (force: boolean) => {
      if (!request || !gen) return;
      setGeneration({ status: 'loading', force });
      try {
        const entry = force ? await gen.regenerate(request) : await gen.getOrGenerate(request);
        setCurrentItemKey(entryKeyOf(entry));
        setGeneration({ status: 'ready', entry });
        toastIfTruncated(entry, (key) => _(key));
      } catch (error) {
        setGeneration({ status: 'error', code: errorCodeOf(error), force });
      }
    },
    [request, gen, setCurrentItemKey],
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

  const isMobile =
    appService?.isMobile === true || window.innerWidth < 640 || window.innerHeight < 640;

  if (!isExplainerVisible) return null;

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

        <div className='min-h-0 flex-1 overflow-y-auto p-3'>
          {generation.status === 'ready' ? (
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
