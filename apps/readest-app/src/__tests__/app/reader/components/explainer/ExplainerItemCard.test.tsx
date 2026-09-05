import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ExplainerItemCard from '@/app/reader/components/explainer/ExplainerItemCard';
import type { ExplanationEntry } from '@/services/explainer/ExplainerDb';
import type { ExplainerPayload } from '@/services/explainer/schema';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

const payload = (): ExplainerPayload => ({
  simple: 'A quick fox jumps over a lazy dog.',
  notes: [{ kind: 'word', original: 'quick', meaningL: 'fast' }],
  grammar: [{ structure: 'jumps over', noteL: 'present tense.' }],
  translationM: '一只敏捷的狐狸跳过懒狗。',
  metadata: { sourceLang: 'en', nativeLang: 'zh-CN', promptVersion: 1, format: 'json' },
});

const entry = (overrides: Partial<ExplanationEntry> = {}): ExplanationEntry => ({
  id: 'entry-1',
  bookHash: 'book-a',
  bookTitle: 'Book A',
  text: 'The quick brown fox jumps over the lazy dog.\nSecond line.',
  textHash: 'a'.repeat(64),
  sourceLang: 'en',
  nativeLang: 'zh-CN',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  payload: payload(),
  promptVersion: 1,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const onOpen = vi.fn();
const onOpenReader = vi.fn();
const onRegenerate = vi.fn();
const onDelete = vi.fn();

beforeEach(() => {
  onOpen.mockReset();
  onOpenReader.mockReset();
  onRegenerate.mockReset();
  onDelete.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ExplainerItemCard', () => {
  it('compact renders the first line, badges and actions, and opens on row click', () => {
    render(
      <ExplainerItemCard
        entry={entry()}
        variant='compact'
        onOpen={onOpen}
        onRegenerate={onRegenerate}
        onDelete={onDelete}
      />,
    );

    // First line of the passage, not the full text.
    expect(screen.getByText('The quick brown fox jumps over the lazy dog.')).toBeTruthy();
    expect(screen.queryByText('Second line.')).toBeNull();
    expect(screen.getByText('Book A')).toBeTruthy();
    // Tier badges for the non-text payload.
    expect(screen.getByText('Words & Phrases')).toBeTruthy();
    expect(screen.getByText('Grammar')).toBeTruthy();
    expect(screen.getByText('Native Translation')).toBeTruthy();

    fireEvent.click(screen.getByTestId('explainer-card-row'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'entry-1' }));

    fireEvent.click(screen.getByTestId('explainer-card-regenerate'));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('explainer-card-delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('expanded toggles a card reusing the cascade and offers open-book', () => {
    render(
      <ExplainerItemCard
        entry={entry()}
        variant='expanded'
        onOpenReader={onOpenReader}
        onRegenerate={onRegenerate}
        onDelete={onDelete}
      />,
    );

    // Cascade is not rendered until the card is expanded.
    expect(screen.queryByText('A quick fox jumps over a lazy dog.')).toBeNull();

    fireEvent.click(screen.getByTestId('explainer-card-row'));
    expect(screen.getByText('A quick fox jumps over a lazy dog.')).toBeTruthy();

    fireEvent.click(screen.getByTestId('explainer-card-open-reader'));
    expect(onOpenReader).toHaveBeenCalledTimes(1);
  });

  it('expanded disables row actions while busy', () => {
    render(
      <ExplainerItemCard
        entry={entry()}
        variant='expanded'
        busy
        onOpenReader={onOpenReader}
        onRegenerate={onRegenerate}
        onDelete={onDelete}
      />,
    );

    expect((screen.getByTestId('explainer-card-regenerate') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('explainer-card-delete') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders a null-payload row without crashing (no badges, no cascade)', () => {
    render(<ExplainerItemCard entry={entry({ payload: null })} variant='expanded' />);

    expect(screen.getByText('The quick brown fox jumps over the lazy dog.')).toBeTruthy();
    expect(screen.queryByText('Words & Phrases')).toBeNull();
    fireEvent.click(screen.getByTestId('explainer-card-row'));
    // Cascade must not render for a null payload.
    expect(screen.queryByText('A quick fox jumps over a lazy dog.')).toBeNull();
  });
});
