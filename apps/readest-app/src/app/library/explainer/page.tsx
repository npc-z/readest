'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LuGraduationCap } from 'react-icons/lu';

import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import {
  DEFAULT_EXPLAINER_THINKING,
  type ExplainerThinkingLevel,
} from '@/services/explainer/constants';
import { ExplainerDb, type ExplanationEntry } from '@/services/explainer/ExplainerDb';
import { isAiConfigured } from '@/services/explainer/gateway';
import type { ExplainerOpenRequest } from '@/store/explainerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { navigateToLibrary, navigateToReader } from '@/utils/nav';
import { eventDispatcher } from '@/utils/event';
import ExplainerItemCard from '@/app/reader/components/explainer/ExplainerItemCard';
import { createExplainerGenerator } from '@/app/reader/components/explainer/generator';

const PAGE_SIZE = 20;

const errorCodeOf = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code: string }).code;
  }
  return 'provider-error';
};

/** Build a regenerate request that overwrites the entry's own cache key. */
const requestFromEntry = (
  entry: ExplanationEntry,
  thinking: ExplainerThinkingLevel | undefined,
): ExplainerOpenRequest => ({
  text: entry.text,
  cfi: entry.cfi,
  bookHash: entry.bookHash,
  bookTitle: entry.bookTitle,
  sourceLang: entry.sourceLang,
  nativeLang: entry.nativeLang,
  thinking: thinking ?? DEFAULT_EXPLAINER_THINKING,
});

/**
 * Standalone "Explanations" management page. Aggregates every generated
 * explanation across books (the panel's history view is per-book): newest first,
 * paginated, searchable by passage text, filterable to one book, with regenerate
 * (overwrites the same cache key) / delete / jump-to-book. Reads go straight to
 * `ExplainerDb`; regenerate/delete go through the service.
 */
export default function ExplainerLibraryPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();

  const [entries, setEntries] = useState<ExplanationEntry[]>([]);
  const [bookList, setBookList] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [bookFilter, setBookFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Guards against a stale query response overwriting a newer one (typing races).
  const loadSeq = useRef(0);

  const aiSettings = settings.aiSettings ?? DEFAULT_AI_SETTINGS;
  const aiConfigured = isAiConfigured(aiSettings);
  const activeThinking = settings.explainerSettings?.thinking ?? DEFAULT_EXPLAINER_THINKING;
  const isEink =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-eink') === 'true';

  const db = useMemo(() => (appService ? ExplainerDb.open(appService) : null), [appService]);
  const gen = useMemo(
    () => (appService ? createExplainerGenerator(appService, aiSettings) : null),
    [appService, aiSettings],
  );

  const load = useCallback(
    async (nextOffset: number) => {
      if (!db) return;
      const seq = ++loadSeq.current;
      setLoading(true);
      setError(null);
      try {
        const options = { limit: PAGE_SIZE, offset: nextOffset };
        // Search and the book filter compose: a query is scoped to the book
        // when a book is selected (ExplainerDb.search accepts a bookHash).
        const rows = query
          ? await db.search(query, { ...options, ...(bookFilter ? { bookHash: bookFilter } : {}) })
          : bookFilter
            ? await db.listByBook(bookFilter, options)
            : await db.listAll(options);
        // Drop a stale response (a later query/filter change superseded it).
        if (seq !== loadSeq.current) return;
        setEntries((prev) =>
          nextOffset === 0
            ? rows
            : [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))],
        );
        setHasMore(rows.length === PAGE_SIZE);
        setOffset(nextOffset + rows.length);
      } catch (err) {
        if (seq !== loadSeq.current) return;
        if (nextOffset > 0) {
          // A "Load more" failure keeps the already-rendered rows and just
          // surfaces an inline message; it must not replace the list.
          eventDispatcher.dispatch('toast', {
            type: 'error',
            message: `[${errorCodeOf(err)}] ${_('Could not load more.')}`,
            timeout: 3500,
          });
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load explanations.');
        }
      } finally {
        // Only the latest request clears the loading flag; a superseded request
        // must not drop the skeleton while a newer one is still in flight.
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [db, query, bookFilter, _],
  );

  useEffect(() => {
    if (!db) return;
    void load(0);
  }, [db, load]);

  const handleRegenerate = useCallback(
    async (entry: ExplanationEntry) => {
      if (!gen) return;
      setBusyId(entry.id);
      try {
        await gen.regenerate(requestFromEntry(entry, activeThinking));
        await load(0);
        eventDispatcher.dispatch('toast', {
          type: 'success',
          message: _('Explanation regenerated.'),
          timeout: 3000,
        });
      } catch (err) {
        // "Regenerate" replaced a cached entry, so a failure is a transient
        // provider error — surface it inline and let the user retry.
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: `[${errorCodeOf(err)}] ${_('Regenerate failed.')}`,
          timeout: 3500,
        });
      } finally {
        setBusyId(null);
      }
    },
    [gen, activeThinking, load, _],
  );

  const handleDelete = useCallback(
    async (entry: ExplanationEntry) => {
      if (!gen) return;
      if (!window.confirm(_('Delete this explanation?'))) return;
      try {
        await gen.deleteExplanation(entry.id);
        await load(0);
        eventDispatcher.dispatch('toast', {
          type: 'success',
          message: _('Explanation deleted.'),
          timeout: 3000,
        });
      } catch (err) {
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: `[${errorCodeOf(err)}] ${_('Delete failed.')}`,
          timeout: 3500,
        });
      }
    },
    [gen, load, _],
  );

  const handleOpenReader = useCallback(
    (entry: ExplanationEntry) => {
      try {
        const cfiParam = entry.cfi ? `cfi=${encodeURIComponent(entry.cfi)}` : undefined;
        navigateToReader(router, [entry.bookHash], cfiParam);
      } catch (err) {
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: `[${errorCodeOf(err)}] ${_('Could not open the book.')}`,
          timeout: 3500,
        });
      }
    },
    [router, _],
  );

  const openAISettings = useCallback(() => {
    const store = useSettingsStore.getState();
    store.setRequestedPanel('AI');
    store.setSettingsDialogOpen(true);
  }, []);

  // The book filter lists every book with an explanation (via a dedicated
  // distinct-books query), not just the books in the currently-loaded page.
  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    void db
      .listBooks()
      .then((books) => {
        if (!cancelled) setBookList(books.map((b) => ({ value: b.bookHash, label: b.bookTitle })));
      })
      .catch(() => {
        if (!cancelled) setBookList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const isEmpty = !loading && !error && entries.length === 0 && !query && !bookFilter;
  const noResults =
    !loading && !error && entries.length === 0 && (Boolean(query) || Boolean(bookFilter));

  return (
    <div
      className={clsx(
        'flex min-h-screen flex-col text-base-content',
        isEink ? 'bg-base-100' : 'bg-base-200',
      )}
    >
      <header className='flex items-center justify-between border-b border-base-content/10 px-4 py-3'>
        <div className='flex items-center gap-2'>
          <button
            type='button'
            data-testid='explainer-library-back'
            onClick={() => navigateToLibrary(router)}
            className='btn btn-ghost btn-sm'
          >
            {_('Back to Library')}
          </button>
          <h1 className='flex items-center gap-2 text-sm font-semibold'>
            <LuGraduationCap className='size-5' />
            {_('Explanations')}
          </h1>
        </div>
        {!aiConfigured && (
          <span data-testid='explainer-library-ai-off' className='text-xs text-base-content/60'>
            {_('Explain needs an AI provider. Configure one to get started.')}
          </span>
        )}
      </header>

      <div className='flex flex-wrap items-center gap-2 border-b border-base-content/10 px-4 py-2'>
        <input
          type='search'
          data-testid='explainer-library-search'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={_('Search explanations...')}
          className={clsx('input input-sm w-64 max-w-full', isEink && 'eink-bordered')}
        />
        <select
          data-testid='explainer-library-book-filter'
          aria-label={_('Filter by book')}
          value={bookFilter}
          onChange={(e) => setBookFilter(e.target.value)}
          className={clsx('select select-sm', isEink && 'eink-bordered bg-base-100')}
        >
          <option value=''>{_('All books')}</option>
          {bookList.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <main className='flex-1 overflow-y-auto p-4'>
        {loading && entries.length === 0 ? (
          <div role='status' aria-busy='true' className='flex flex-col gap-2'>
            <div className='skeleton h-16 w-full' />
            <div className='skeleton h-16 w-full' />
            <div className='skeleton h-16 w-full' />
          </div>
        ) : error && entries.length === 0 ? (
          <p role='alert' className='text-sm text-base-content/70'>
            {error || _('Could not load explanations.')}
          </p>
        ) : isEmpty ? (
          <div
            data-testid='explainer-library-empty'
            className='flex flex-col items-center gap-3 py-12 text-center'
          >
            <LuGraduationCap className='size-8 text-base-content/40' />
            <p className='text-sm text-base-content/70'>
              {aiConfigured
                ? _('No explanations yet. Select text in a book and tap Explain to create one.')
                : _('Explain needs an AI provider. Configure one to get started.')}
            </p>
            <button
              type='button'
              onClick={aiConfigured ? () => navigateToLibrary(router) : openAISettings}
              className='btn btn-sm btn-neutral'
            >
              {aiConfigured ? _('Back to Library') : _('Open AI settings')}
            </button>
          </div>
        ) : noResults ? (
          <p data-testid='explainer-library-no-results' className='text-sm text-base-content/60'>
            {bookFilter
              ? _('No explanations in this book yet.')
              : _('No explanations match your search.')}
          </p>
        ) : (
          <>
            <ul className='flex flex-col gap-2'>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <ExplainerItemCard
                    entry={entry}
                    variant='expanded'
                    isEink={isEink}
                    busy={busyId === entry.id}
                    onOpenReader={handleOpenReader}
                    onRegenerate={handleRegenerate}
                    onDelete={handleDelete}
                  />
                </li>
              ))}
            </ul>
            {hasMore && (
              <button
                type='button'
                data-testid='explainer-library-load-more'
                onClick={() => void load(offset)}
                className='btn btn-sm btn-outline mt-3'
              >
                {_('Load more')}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
