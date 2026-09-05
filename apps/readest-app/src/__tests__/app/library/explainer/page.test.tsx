import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExplanationEntry } from '@/services/explainer/ExplainerDb';
import type { ExplainerPayload } from '@/services/explainer/schema';

const h = vi.hoisted(() => ({
  listAll: vi.fn(),
  listByBook: vi.fn(),
  search: vi.fn(),
  listBooks: vi.fn(),
  regenerate: vi.fn(),
  deleteExplanation: vi.fn(),
  navigateToReader: vi.fn(),
  navigateToLibrary: vi.fn(),
  push: vi.fn(),
  // Stable translation so a panel/page useCallback that depends on `_` isn't
  // recreated on every render (which would re-trigger a load effect).
  t: (key: string) => key,
}));

vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: {} }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => h.t }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { aiSettings: { enabled: true }, explainerSettings: {} } }),
}));
vi.mock('@/services/explainer/ExplainerDb', () => ({
  ExplainerDb: { open: () => h },
}));
vi.mock('@/app/reader/components/explainer/generator', () => ({
  createExplainerGenerator: () => h,
}));
vi.mock('@/services/explainer/gateway', () => ({
  isAiConfigured: () => true,
}));
vi.mock('@/utils/nav', () => ({
  navigateToReader: (...args: unknown[]) => h.navigateToReader(...args),
  navigateToLibrary: (...args: unknown[]) => h.navigateToLibrary(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push }),
}));

import ExplainerLibraryPage from '@/app/library/explainer/page';

const payload = (simple: string): ExplainerPayload => ({
  simple,
  notes: [],
  grammar: [],
  translationM: null,
  metadata: { sourceLang: 'en', nativeLang: 'zh-CN', promptVersion: 1, format: 'json' },
});

const entry = (id: string, overrides: Partial<ExplanationEntry> = {}): ExplanationEntry => ({
  id,
  bookHash: `book-${id}`,
  bookTitle: `Book ${id}`,
  text: `Passage ${id} first line.`,
  textHash: id.repeat(64).padEnd(64, 'a'),
  sourceLang: 'en',
  nativeLang: 'zh-CN',
  cfi: `epubcfi(/6/${id}/4/2/1:0)`,
  payload: payload(`Simplified ${id}`),
  promptVersion: 1,
  createdAt: Number(id),
  updatedAt: Number(id),
  ...overrides,
});

beforeEach(() => {
  h.listAll.mockReset();
  h.listByBook.mockReset();
  h.search.mockReset();
  h.listBooks.mockReset().mockResolvedValue([]);
  h.regenerate.mockReset();
  h.deleteExplanation.mockReset();
  h.navigateToReader.mockReset();
  h.navigateToLibrary.mockReset();
  h.push.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ExplainerLibraryPage', () => {
  it('lists all explanations (paginated) and renders their first lines', async () => {
    h.listAll.mockResolvedValue([entry('1')]);
    render(<ExplainerLibraryPage />);

    await waitFor(() => expect(h.listAll).toHaveBeenCalled());
    expect(h.listAll).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    await waitFor(() => expect(screen.getByText('Passage 1 first line.')).toBeTruthy());
  });

  it('searches by passage text when a query is typed', async () => {
    h.listAll.mockResolvedValue([entry('1')]);
    h.search.mockResolvedValue([entry('2')]);
    render(<ExplainerLibraryPage />);
    await waitFor(() => expect(h.listAll).toHaveBeenCalled());

    const input = screen.getByTestId('explainer-library-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Passage 2' } });

    await waitFor(() =>
      expect(h.search).toHaveBeenCalledWith('Passage 2', { limit: 20, offset: 0 }),
    );
    await waitFor(() => expect(screen.getByText('Passage 2 first line.')).toBeTruthy());
  });

  it('filters to a single book via the book dropdown', async () => {
    h.listAll.mockResolvedValue([entry('1')]);
    h.listByBook.mockResolvedValue([entry('1')]);
    h.listBooks.mockResolvedValue([{ bookHash: 'book-1', bookTitle: 'Book 1' }]);
    render(<ExplainerLibraryPage />);
    await waitFor(() => expect(h.listAll).toHaveBeenCalled());

    const select = screen.getByTestId('explainer-library-book-filter') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'book-1' } });

    await waitFor(() =>
      expect(h.listByBook).toHaveBeenCalledWith('book-1', { limit: 20, offset: 0 }),
    );
  });

  it('deletes an entry after confirmation and reloads the list', async () => {
    h.listAll.mockResolvedValue([entry('1')]);
    h.deleteExplanation.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ExplainerLibraryPage />);
    await waitFor(() => expect(screen.getByText('Passage 1 first line.')).toBeTruthy());

    fireEvent.click(screen.getByTestId('explainer-card-delete'));
    await waitFor(() => expect(h.deleteExplanation).toHaveBeenCalledWith('1'));
    confirmSpy.mockRestore();
  });

  it('regenerates an entry (overwrite same key) and reloads', async () => {
    h.listAll.mockResolvedValue([entry('1')]);
    h.regenerate.mockResolvedValue(entry('1'));
    render(<ExplainerLibraryPage />);
    await waitFor(() => expect(screen.getByText('Passage 1 first line.')).toBeTruthy());

    fireEvent.click(screen.getByTestId('explainer-card-regenerate'));
    await waitFor(() => expect(h.regenerate).toHaveBeenCalledTimes(1));
    expect(h.regenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Passage 1 first line.',
        bookHash: 'book-1',
        nativeLang: 'zh-CN',
      }),
    );
    await waitFor(() => expect(h.listAll).toHaveBeenCalledTimes(2));
  });

  it('opens the book at the cfi via navigateToReader', async () => {
    h.listAll.mockResolvedValue([entry('1')]);
    render(<ExplainerLibraryPage />);
    await waitFor(() => expect(screen.getByText('Passage 1 first line.')).toBeTruthy());

    fireEvent.click(screen.getByTestId('explainer-card-open-reader'));
    await waitFor(() =>
      expect(h.navigateToReader).toHaveBeenCalledWith(
        expect.anything(),
        ['book-1'],
        'cfi=' + encodeURIComponent('epubcfi(/6/1/4/2/1:0)'),
      ),
    );
  });

  it('shows the empty guidance when no explanations exist', async () => {
    h.listAll.mockResolvedValue([]);
    render(<ExplainerLibraryPage />);

    await waitFor(() => expect(screen.getByTestId('explainer-library-empty')).toBeTruthy());
  });

  it('loads the next page of entries via the Load more button', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => entry(String(i + 1)));
    h.listAll.mockResolvedValueOnce(page1).mockResolvedValueOnce([] as ExplanationEntry[]);
    render(<ExplainerLibraryPage />);

    await waitFor(() => expect(screen.getByText('Passage 20 first line.')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('explainer-library-load-more')).toBeTruthy());

    fireEvent.click(screen.getByTestId('explainer-library-load-more'));
    await waitFor(() => expect(h.listAll).toHaveBeenCalledTimes(2));
    expect(h.listAll).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
  });

  it('shows the no-results state (not the empty guidance) when a search matches nothing', async () => {
    h.listAll.mockResolvedValue([]);
    h.search.mockResolvedValue([]);
    render(<ExplainerLibraryPage />);
    await waitFor(() => expect(screen.getByTestId('explainer-library-empty')).toBeTruthy());

    fireEvent.change(screen.getByTestId('explainer-library-search'), {
      target: { value: 'zzz' },
    });
    await waitFor(() => expect(screen.getByTestId('explainer-library-no-results')).toBeTruthy());
    expect(screen.queryByTestId('explainer-library-empty')).toBeNull();
  });
});
