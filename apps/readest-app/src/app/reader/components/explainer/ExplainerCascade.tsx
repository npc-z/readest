'use client';

import type { ReactNode } from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import { EXPLAINER_NOTE_KIND_BADGE_KEYS } from '@/services/explainer/i18n';
import type { ExplainerPayload } from '@/services/explainer/schema';
import type { ExplainerExpandedTiers, ExplainerTier } from '@/store/explainerStore';

/**
 * Renders an explanation payload as the four-tier cascade:
 * Simple (always expanded) → Words & Phrases → Grammar → Translation.
 *
 * The component is fully controlled: expansion state (`expanded`) and the
 * toggle callback are injected by the consumer (the panel wires them to
 * `explainerStore`), so it can be tested in isolation with fixture payloads.
 *
 * Degradation: absent/empty notes, grammar, or a missing translation omit that
 * tier entirely rather than showing an empty block. A `metadata.format ===
 * 'text'` payload (the pure-text fallback) renders only the Simple restatement
 * flat, regardless of any permissive extra fields the schema allows.
 */
export interface ExplainerCascadeProps {
  payload: ExplainerPayload;
  expanded: ExplainerExpandedTiers;
  onToggle: (tier: ExplainerTier) => void;
  /** Generation phase, injected by the consumer. Defaults to 'ready'. */
  status?: 'loading' | 'error' | 'ready';
  errorMessage?: string;
}

export default function ExplainerCascade({
  payload,
  expanded,
  onToggle,
  status = 'ready',
  errorMessage,
}: ExplainerCascadeProps) {
  const _ = useTranslation();

  if (status === 'loading') {
    return (
      <div role='status' aria-busy='true' aria-label={_('Generating explanation...')}>
        <div className='skeleton h-4 w-full' />
        <div className='skeleton mt-3 h-4 w-5/6' />
        <div className='skeleton mt-3 h-4 w-2/3' />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div role='alert' className='eink-bordered rounded-box bg-error/10 p-3 text-sm'>
        {errorMessage || _('Could not create an explanation.')}
      </div>
    );
  }

  const isText = payload.metadata.format === 'text';
  const hasNotes = !isText && (payload.notes?.length ?? 0) > 0;
  const hasGrammar = !isText && (payload.grammar?.length ?? 0) > 0;
  const hasTranslation = !isText && Boolean(payload.translationM?.trim());

  return (
    <div className='flex flex-col gap-3'>
      <section aria-label={_('Simple')}>
        <h3 className='text-xs font-semibold uppercase tracking-wide text-base-content/60'>
          {_('Simple')}
        </h3>
        <p className='mt-1 whitespace-pre-wrap text-sm leading-relaxed'>{payload.simple}</p>
      </section>

      {hasNotes && (
        <CollapsibleTier
          tier='notes'
          title={_('Words & Phrases')}
          expanded={expanded.has('notes')}
          onToggle={onToggle}
          _={_}
        >
          <ul className='space-y-2'>
            {payload.notes?.map((note, index) => (
              <li key={index} className='text-sm'>
                <div className='flex items-center gap-2'>
                  <Badge kind={note.kind} _={_} />
                  <span className='font-medium'>{note.original}</span>
                </div>
                <p className='mt-0.5 text-base-content/80'>{note.meaningL}</p>
                {note.example && (
                  <p className='mt-0.5 text-base-content/70 italic'>‘{note.example}’</p>
                )}
                {note.meaningM && <p className='mt-0.5 text-base-content/70'>{note.meaningM}</p>}
              </li>
            ))}
          </ul>
        </CollapsibleTier>
      )}

      {hasGrammar && (
        <CollapsibleTier
          tier='grammar'
          title={_('Grammar')}
          expanded={expanded.has('grammar')}
          onToggle={onToggle}
          _={_}
        >
          <ul className='space-y-2'>
            {payload.grammar?.map((item, index) => (
              <li key={index} className='text-sm'>
                <span className='font-medium'>{item.structure}</span>
                <p className='mt-0.5 text-base-content/80'>{item.noteL}</p>
                {item.noteM && <p className='mt-0.5 text-base-content/70'>{item.noteM}</p>}
              </li>
            ))}
          </ul>
        </CollapsibleTier>
      )}

      {hasTranslation && (
        <CollapsibleTier
          tier='translation'
          title={_('Native Translation')}
          expanded={expanded.has('translation')}
          onToggle={onToggle}
          _={_}
        >
          <p className='whitespace-pre-wrap text-sm leading-relaxed'>{payload.translationM}</p>
        </CollapsibleTier>
      )}
    </div>
  );
}

function Badge({
  kind,
  _,
}: {
  kind: 'word' | 'phrase' | 'idiom';
  _: (key: string, options?: Record<string, string | number>) => string;
}) {
  const label = EXPLAINER_NOTE_KIND_BADGE_KEYS[kind];
  return (
    <span className='badge badge-outline badge-sm' data-kind={kind}>
      {_(label)}
    </span>
  );
}

function CollapsibleTier({
  tier,
  title,
  expanded,
  onToggle,
  _,
  children,
}: {
  tier: ExplainerTier;
  title: string;
  expanded: boolean;
  onToggle: (tier: ExplainerTier) => void;
  _: (key: string, options?: Record<string, string | number>) => string;
  children: ReactNode;
}) {
  return (
    <section className='border-t border-base-content/10 pt-2'>
      <button
        type='button'
        data-testid={`explainer-toggle-${tier}`}
        aria-expanded={expanded}
        onClick={() => onToggle(tier)}
        className='flex w-full items-center justify-between text-start text-sm font-medium hover:text-base-content/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-base-content/15'
      >
        <span className='text-xs font-semibold uppercase tracking-wide text-base-content/60'>
          {title}
        </span>
        <span className='ms-2 text-xs text-base-content/50'>
          {expanded ? _('Clear now') : _('Still not clear?')}
        </span>
      </button>
      {expanded && <div className='mt-2'>{children}</div>}
    </section>
  );
}
