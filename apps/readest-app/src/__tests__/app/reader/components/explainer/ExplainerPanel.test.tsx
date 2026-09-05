import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExplanationEntry } from '@/services/explainer/ExplainerDb';
import { useExplainerStore, type ExplainerOpenRequest } from '@/store/explainerStore';

const h = vi.hoisted(() => ({
  saveSettings: vi.fn(),
  setSettings: vi.fn((settings: unknown) => {
    Object.assign(h.settings, settings);
  }),
  settings: { aiSettings: { enabled: false }, explainerSettings: {} } as {
    aiSettings: { enabled: boolean };
    explainerSettings: Record<string, unknown>;
  },
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: {}, envConfig: {} }),
}));
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: h.settings,
    setSettings: h.setSettings,
    saveSettings: h.saveSettings,
  }),
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: (
    selector?: (state: { getBookData: () => { book: { hash: string } } }) => unknown,
  ) =>
    selector
      ? selector({ getBookData: () => ({ book: { hash: 'book-a' } }) })
      : { getBookData: () => ({ book: { hash: 'book-a' } }) },
}));
vi.mock('@/services/explainer/gateway', () => ({
  isAiConfigured: (settings?: { enabled?: boolean }) => Boolean(settings?.enabled),
}));
vi.mock('@/app/reader/components/explainer/generator', () => ({
  createExplainerGenerator: () => null,
}));

import ExplainerPanel from '@/app/reader/components/explainer/ExplainerPanel';
import type { ExplainerGenerator } from '@/app/reader/components/explainer/generator';

const openRequest = (): ExplainerOpenRequest => ({
  text: 'The quick brown fox jumps over the lazy dog.',
  bookHash: 'book-a',
  bookTitle: 'Book A',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  sourceLang: 'en',
  nativeLang: 'zh-CN',
});

const anEntry = (): ExplanationEntry => ({
  id: 'entry-1',
  bookHash: 'book-a',
  bookTitle: 'Book A',
  text: 'The quick brown fox.',
  textHash: 'a'.repeat(64),
  sourceLang: 'en',
  nativeLang: 'zh-CN',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  payload: {
    simple: 'A quick fox jumps over a lazy dog.',
    notes: [],
    grammar: [],
    translationM: '一只敏捷的狐狸跳过懒狗。',
    metadata: { sourceLang: 'en', nativeLang: 'zh-CN', promptVersion: 1, format: 'json' },
  },
  promptVersion: 1,
  createdAt: 1,
  updatedAt: 1,
});

const generate = (overrides: Partial<ExplainerGenerator> = {}): ExplainerGenerator => ({
  getOrGenerate: vi.fn(() => Promise.resolve(anEntry())),
  regenerate: vi.fn(() => Promise.resolve(anEntry())),
  deleteExplanation: vi.fn(() => Promise.resolve()),
  listByBook: vi.fn(() => Promise.resolve([anEntry()])),
  ...overrides,
});

beforeEach(() => {
  h.settings.aiSettings.enabled = false;
  h.settings.explainerSettings = {};
  h.saveSettings.mockReset();
  useExplainerStore.setState({
    isExplainerVisible: false,
    isExplainerPinned: false,
    explainerWidth: '',
    view: 'item',
    currentItemKey: null,
    request: null,
    expandedByItem: {},
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ExplainerPanel', () => {
  it('shows the not-configured empty state and never calls the generator', () => {
    const generator = generate();
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);

    expect(
      screen.getByText('Explain needs an AI provider. Configure one to get started.'),
    ).toBeTruthy();
    expect(generator.getOrGenerate).not.toHaveBeenCalled();
  });

  it('shows a loading skeleton while generation is in flight', () => {
    h.settings.aiSettings.enabled = true;
    const generator = generate({
      getOrGenerate: vi.fn(() => new Promise<ExplanationEntry>(() => {})),
    });
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);

    expect(screen.getByRole('status')).toBeTruthy();
    expect(generator.getOrGenerate).toHaveBeenCalledTimes(1);
  });

  it('shows an inline error with a retry when generation fails', async () => {
    h.settings.aiSettings.enabled = true;
    const generator = generate({
      getOrGenerate: vi.fn(() => Promise.reject({ code: 'provider-error' })),
    });
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('The AI provider returned an error.'),
    );
    expect(screen.getByTestId('explainer-retry')).toBeTruthy();
  });

  it('renders the cascade on success and wires regenerate/delete actions', async () => {
    h.settings.aiSettings.enabled = true;
    const generator = generate();
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);

    await waitFor(() =>
      expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy(),
    );
    expect(screen.getByTestId('explainer-regenerate')).toBeTruthy();
    expect(screen.getByTestId('explainer-delete')).toBeTruthy();

    screen.getByTestId('explainer-regenerate').click();
    await waitFor(() => expect(generator.regenerate).toHaveBeenCalledTimes(1));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    screen.getByTestId('explainer-delete').click();
    await waitFor(() => expect(generator.deleteExplanation).toHaveBeenCalledTimes(1));
    confirmSpy.mockRestore();
  });

  it('delete clears the request so the deleted explanation is not regenerated in place', async () => {
    h.settings.aiSettings.enabled = true;
    const generator = generate();
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);
    await waitFor(() =>
      expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy(),
    );
    expect(generator.getOrGenerate).toHaveBeenCalledTimes(1);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    screen.getByTestId('explainer-delete').click();
    await waitFor(() => expect(generator.deleteExplanation).toHaveBeenCalledTimes(1));

    // request cleared → no regeneration; the panel falls back to the idle state.
    await waitFor(() => expect(screen.getByText('Select text, then tap Explain.')).toBeTruthy());
    expect(generator.getOrGenerate).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('retry after a failed regenerate replays the force path rather than the cached getOrGenerate', async () => {
    h.settings.aiSettings.enabled = true;
    const generator = generate({
      regenerate: vi
        .fn()
        .mockRejectedValueOnce({ code: 'provider-error' })
        .mockResolvedValueOnce(anEntry()),
    });
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);
    await waitFor(() =>
      expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy(),
    );
    expect(generator.getOrGenerate).toHaveBeenCalledTimes(1);

    // Force regenerate fails -> inline error.
    screen.getByTestId('explainer-regenerate').click();
    await waitFor(() => expect(generator.regenerate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    // Retry replays the force path (regenerate), NOT a cached getOrGenerate.
    screen.getByTestId('explainer-retry').click();
    await waitFor(() => expect(generator.regenerate).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy(),
    );
    expect(generator.getOrGenerate).toHaveBeenCalledTimes(1);
  });

  it('switches to the history view, loads the book rows, and renders them', async () => {
    h.settings.aiSettings.enabled = true;
    const generator = generate({
      listByBook: vi.fn(() => Promise.resolve([anEntry(), anEntry(), anEntry()])),
    });
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);
    await waitFor(() =>
      expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy(),
    );

    screen.getByTestId('explainer-view-history').click();
    await waitFor(() => expect(generator.listByBook).toHaveBeenCalledTimes(1));
    expect(generator.listByBook).toHaveBeenCalledWith('book-a', { limit: 50, offset: 0 });
    // Every history row's first line is rendered.
    expect(screen.getAllByTestId('explainer-card-row').length).toBe(3);
    // Current-entry content is replaced by the history rows.
    expect(screen.queryByText('A quick fox jumps over a lazy dog.')).toBeNull();
  });

  it('regenerates a history row and reveals the refreshed entry in the item view', async () => {
    h.settings.aiSettings.enabled = true;
    const generator = generate();
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);
    await waitFor(() =>
      expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy(),
    );

    screen.getByTestId('explainer-view-history').click();
    await waitFor(() => expect(generator.listByBook).toHaveBeenCalled());

    screen.getAllByTestId('explainer-card-regenerate')[0]!.click();
    await waitFor(() => expect(generator.regenerate).toHaveBeenCalledTimes(1));
    // The panel switches back to the item view and shows the refreshed entry.
    await waitFor(() => expect(screen.queryAllByTestId('explainer-card-row').length).toBe(0));
    expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy();
  });

  it('deletes a history row after confirmation and reloads the list', async () => {
    h.settings.aiSettings.enabled = true;
    const generator = generate();
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);
    await waitFor(() =>
      expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy(),
    );

    screen.getByTestId('explainer-view-history').click();
    await waitFor(() => expect(generator.listByBook).toHaveBeenCalled());

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    screen.getAllByTestId('explainer-card-delete')[0]!.click();
    await waitFor(() => expect(generator.deleteExplanation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(generator.listByBook).toHaveBeenCalledTimes(2));
    confirmSpy.mockRestore();
  });

  it('persists source/native/thinking changes through settings save', async () => {
    h.settings.aiSettings.enabled = true;
    const generator = generate();
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);
    await waitFor(() =>
      expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy(),
    );

    const source = screen.getByTestId('explainer-source-lang') as HTMLSelectElement;
    source.value = 'zh-Hans';
    source.dispatchEvent(new Event('change', { bubbles: true }));

    const thinking = screen.getByTestId('explainer-thinking') as HTMLSelectElement;
    thinking.value = 'high';
    thinking.dispatchEvent(new Event('change', { bubbles: true }));

    expect(h.saveSettings).toHaveBeenCalled();
    const saved = h.saveSettings.mock.calls[h.saveSettings.mock.calls.length - 1]![1];
    expect(saved.explainerSettings).toMatchObject({ sourceLang: 'zh-Hans', thinking: 'high' });
  });

  it('shows read-only provider tuning and never exposes tuning controls', async () => {
    h.settings.aiSettings.enabled = true;
    const generator = generate();
    useExplainerStore.getState().openExplainer(openRequest());
    render(<ExplainerPanel generator={generator} bookKey='book-a-xyz' />);
    await waitFor(() =>
      expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy(),
    );

    expect(screen.queryByTestId('explainer-temperature-input')).toBeNull();
    screen.getByTestId('explainer-tuning').click();
    await waitFor(() => expect(screen.getByTestId('explainer-tuning-info')).toBeTruthy());
    expect(screen.getByTestId('explainer-tuning-info').textContent).toContain('Temperature');
    expect(screen.getByTestId('explainer-tuning-info').textContent).toContain('Max tokens');
  });
});
