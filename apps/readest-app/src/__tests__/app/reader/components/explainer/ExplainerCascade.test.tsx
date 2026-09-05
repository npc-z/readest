import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ExplainerCascade from '@/app/reader/components/explainer/ExplainerCascade';
import type { ExplainerPayload } from '@/services/explainer/schema';
import type { ExplainerTier } from '@/store/explainerStore';

// Key-as-content model: the translation hook returns the key (English) as-is, so
// tests assert on the exact English keys the component renders.
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

const jsonPayload = (): ExplainerPayload => ({
  simple: 'A quick fox jumps over a lazy dog.',
  notes: [
    {
      kind: 'word',
      original: 'quick',
      meaningL: 'fast',
      example: null,
      meaningM: null,
    },
    {
      kind: 'phrase',
      original: 'jumps over',
      meaningL: 'moves above or across',
      example: 'The cat jumps over the fence.',
      meaningM: '跳过',
    },
    {
      kind: 'idiom',
      original: 'lazy dog',
      meaningL: 'a person slow to act',
      meaningM: '懒人',
    },
  ],
  grammar: [
    {
      structure: 'jumps over',
      noteL: 'present tense, third person singular.',
      noteM: null,
    },
  ],
  translationM: '一只敏捷的狐狸跳过懒狗。',
  metadata: { sourceLang: 'en', nativeLang: 'zh-CN', promptVersion: 1, format: 'json' },
});

const emptyNotesPayload = (): ExplainerPayload => ({
  simple: 'A plain sentence.',
  notes: [],
  grammar: [{ structure: 'A plain sentence.', noteL: 'A normal statement.' }],
  translationM: null,
  metadata: { sourceLang: 'en', nativeLang: 'zh-CN', promptVersion: 1 },
});

const emptyGrammarPayload = (): ExplainerPayload => ({
  simple: 'A plain sentence.',
  notes: [{ kind: 'word', original: 'plain', meaningL: 'simple' }],
  grammar: [],
  translationM: '一个普通句子。',
  metadata: { sourceLang: 'en', nativeLang: 'zh-CN', promptVersion: 1 },
});

const textPayload = (): ExplainerPayload => ({
  simple: 'A prose fallback restatement.',
  notes: [],
  grammar: [],
  translationM: null,
  metadata: { sourceLang: 'en', nativeLang: 'zh-CN', promptVersion: 1, format: 'text' },
});

function Harness({ payload }: { payload: ExplainerPayload }) {
  const [expanded, setExpanded] = useState<ReadonlySet<ExplainerTier>>(new Set());
  const onToggle = vi.fn((tier: ExplainerTier) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  });
  return <ExplainerCascade payload={payload} expanded={expanded} onToggle={onToggle} />;
}

afterEach(cleanup);

describe('ExplainerCascade', () => {
  it('renders the always-on Simple tier with its text', () => {
    render(<Harness payload={jsonPayload()} />);

    expect(screen.queryByText('Simple')).not.toBeNull();
    expect(screen.queryByText('A quick fox jumps over a lazy dog.')).not.toBeNull();
  });

  it('collapses the collapsible tiers by default and hides their content', () => {
    render(<Harness payload={jsonPayload()} />);

    expect(screen.queryByText('Words & Phrases')).not.toBeNull();
    expect(screen.queryByText('Grammar')).not.toBeNull();
    expect(screen.queryByText('Native Translation')).not.toBeNull();

    expect(screen.getByTestId('explainer-toggle-notes').getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.queryByText('fast')).toBeNull();
    expect(screen.queryByText('跳过')).toBeNull();
    expect(screen.queryByText('一只敏捷的狐狸跳过懒狗。')).toBeNull();
  });

  it('expands a tier after the user toggles it, showing content and a collapse action', () => {
    render(<Harness payload={jsonPayload()} />);

    fireEvent.click(screen.getByTestId('explainer-toggle-notes'));

    expect(screen.getByTestId('explainer-toggle-notes').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByText('fast')).not.toBeNull();
    expect(screen.queryByText('moves above or across')).not.toBeNull();
    expect(screen.queryByText('Clear now')).not.toBeNull();
  });

  it('shows word/phrase/idiom badges on the notes', () => {
    render(<Harness payload={jsonPayload()} />);
    fireEvent.click(screen.getByTestId('explainer-toggle-notes'));

    expect(screen.queryByText('Word')).not.toBeNull();
    expect(screen.queryByText('Phrase')).not.toBeNull();
    expect(screen.queryByText('Idiom')).not.toBeNull();
  });

  it('expands then collapses the translation tier', () => {
    render(<Harness payload={jsonPayload()} />);

    // Collapsed by default: content hidden, "Still not clear?" shown.
    expect(screen.queryByText('一只敏捷的狐狸跳过懒狗。')).toBeNull();
    expect(screen.getByTestId('explainer-toggle-translation').textContent).toContain(
      'Still not clear?',
    );

    fireEvent.click(screen.getByTestId('explainer-toggle-translation'));
    expect(screen.queryByText('一只敏捷的狐狸跳过懒狗。')).not.toBeNull();
    expect(screen.queryByText('Clear now')).not.toBeNull();

    fireEvent.click(screen.getByTestId('explainer-toggle-translation'));
    expect(screen.queryByText('一只敏捷的狐狸跳过懒狗。')).toBeNull();
    expect(screen.getByTestId('explainer-toggle-translation').textContent).toContain(
      'Still not clear?',
    );
  });

  it('omits the notes tier when notes is empty', () => {
    render(<Harness payload={emptyNotesPayload()} />);

    expect(screen.queryByText('Words & Phrases')).toBeNull();
    // Missing translationM -> no Translation tier.
    expect(screen.queryByText('Native Translation')).toBeNull();
    // Grammar present -> rendered.
    expect(screen.queryByText('Grammar')).not.toBeNull();
  });

  it('omits the grammar tier when grammar is empty', () => {
    render(<Harness payload={emptyGrammarPayload()} />);

    expect(screen.queryByText('Grammar')).toBeNull();
    expect(screen.queryByText('Words & Phrases')).not.toBeNull();
    expect(screen.queryByText('Native Translation')).not.toBeNull();
  });

  it('renders a text-format payload flat as only the Simple tier, ignoring permissive extras', () => {
    render(
      <Harness
        payload={{ ...textPayload(), notes: [{ kind: 'word', original: 'x', meaningL: 'y' }] }}
      />,
    );

    expect(screen.queryByText('A prose fallback restatement.')).not.toBeNull();
    expect(screen.queryByText('Words & Phrases')).toBeNull();
    expect(screen.queryByText('Grammar')).toBeNull();
    expect(screen.queryByText('Native Translation')).toBeNull();
  });

  it('shows a loading skeleton placeholder when status is loading', () => {
    render(
      <ExplainerCascade
        payload={jsonPayload()}
        expanded={new Set()}
        onToggle={vi.fn()}
        status='loading'
      />,
    );

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByLabelText('Generating explanation...')).toBeTruthy();
  });

  it('shows an inline error placeholder when status is error', () => {
    render(
      <ExplainerCascade
        payload={jsonPayload()}
        expanded={new Set()}
        onToggle={vi.fn()}
        status='error'
        errorMessage='AI is not configured.'
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('AI is not configured.');
  });
});
