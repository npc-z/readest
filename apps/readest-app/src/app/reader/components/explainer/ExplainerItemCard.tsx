'use client';

import clsx from 'clsx';
import { useState } from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import type { ExplanationEntry } from '@/services/explainer/ExplainerDb';
import type { ExplainerPayload } from '@/services/explainer/schema';
import {
  DEFAULT_EXPANDED_TIERS,
  type ExplainerExpandedTiers,
  type ExplainerTier,
} from '@/store/explainerStore';
import ExplainerCascade from './ExplainerCascade';

/** First line of a passage, for the compact row label. */
const firstLineOf = (text: string): string => {
  const trimmed = text.trim().split(/\r?\n/)[0]?.trim() ?? '';
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
};

/** Tier badges shown for non-text payloads (the always-on Simple tier is not badged). */
const BADGE_KEYS: { key: string; visible: (p: ExplainerPayload) => boolean }[] = [
  { key: 'Words & Phrases', visible: (p) => (p.notes?.length ?? 0) > 0 },
  { key: 'Grammar', visible: (p) => (p.grammar?.length ?? 0) > 0 },
  { key: 'Translation', visible: (p) => Boolean(p.translationM?.trim()) },
];

export interface ExplainerItemCardProps {
  entry: ExplanationEntry;
  /**
   * `compact` renders the row + actions without the cascade (panel history).
   * `expanded` adds a toggleable card that reuses {@link ExplainerCascade}
   * (library page), with tier expansion held in local state.
   */
  variant: 'compact' | 'expanded';
  isEink?: boolean;
  /** Regeneration in flight — disables the row's regenerate/delete actions. */
  busy?: boolean;
  /** Compact: click the row to open the entry (panel item view). */
  onOpen?: (entry: ExplanationEntry) => void;
  /** Expanded: jump to the book at the entry's CFI (annotation-link mechanism). */
  onOpenReader?: (entry: ExplanationEntry) => void;
  onRegenerate?: (entry: ExplanationEntry) => void;
  onDelete?: (entry: ExplanationEntry) => void;
}

/**
 * Shared render for one explanation row + actions, reused by the panel's book
 * history (compact) and the library management page (expanded). Keeps the
 * first-line label, book/time/tier badges and the regenerate/delete actions in
 * one place so the two surfaces can't drift.
 */
export default function ExplainerItemCard({
  entry,
  variant,
  isEink = false,
  busy = false,
  onOpen,
  onOpenReader,
  onRegenerate,
  onDelete,
}: ExplainerItemCardProps) {
  const _ = useTranslation();
  const [cardOpen, setCardOpen] = useState(false);
  const [tiers, setTiers] = useState<ExplainerExpandedTiers>(DEFAULT_EXPANDED_TIERS);

  const toggleTier = (tier: ExplainerTier): void => {
    setTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  // A persisted row's payload can be null/non-object when the DB write is
  // interrupted or the schema drifts. Treat it as a bare text row (no badges,
  // no cascade) rather than letting `p.notes` on a null payload throw.
  const payload = entry.payload as ExplainerPayload | null;
  const badges =
    payload && payload.metadata?.format !== 'text'
      ? BADGE_KEYS.filter((b) => b.visible(payload)).map((b) => b.key)
      : [];

  const rowClick = (): void => {
    if (variant === 'expanded') setCardOpen((v) => !v);
    else onOpen?.(entry);
  };

  const row = (
    <div
      className={clsx('rounded-box border border-base-content/10 p-2', isEink && 'eink-bordered')}
    >
      <button
        type='button'
        data-testid='explainer-card-row'
        onClick={rowClick}
        aria-expanded={variant === 'expanded' ? cardOpen : undefined}
        className='block w-full text-start text-sm font-medium hover:text-base-content/80'
      >
        {firstLineOf(entry.text)}
      </button>
      <div className='mt-1 flex flex-wrap items-center gap-1 text-[11px] text-base-content/60'>
        <span className='badge badge-outline badge-sm'>{entry.bookTitle || entry.bookHash}</span>
        <span className='badge badge-outline badge-sm'>
          {new Date(entry.createdAt).toLocaleDateString()}
        </span>
        {badges.map((key) => (
          <span key={key} className='badge badge-ghost badge-sm'>
            {_(key)}
          </span>
        ))}
      </div>
      <div className='mt-2 flex gap-2'>
        {variant === 'expanded' && onOpenReader && (
          <button
            type='button'
            data-testid='explainer-card-open-reader'
            onClick={() => onOpenReader(entry)}
            className='btn btn-xs btn-outline'
          >
            {_('Open book')}
          </button>
        )}
        <button
          type='button'
          data-testid='explainer-card-regenerate'
          onClick={() => onRegenerate?.(entry)}
          disabled={busy}
          className='btn btn-xs btn-outline'
        >
          {_('Regenerate')}
        </button>
        <button
          type='button'
          data-testid='explainer-card-delete'
          onClick={() => onDelete?.(entry)}
          disabled={busy}
          className='btn btn-xs btn-outline'
        >
          {_('Delete')}
        </button>
      </div>
    </div>
  );

  if (variant === 'compact') return row;

  return (
    <div className='flex flex-col gap-2'>
      {row}
      {cardOpen && payload && (
        <div
          className={clsx(
            'rounded-box border border-base-content/10 p-3',
            isEink && 'eink-bordered',
          )}
        >
          <ExplainerCascade payload={payload} expanded={tiers} onToggle={toggleTier} />
        </div>
      )}
    </div>
  );
}
