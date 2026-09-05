import { create } from 'zustand';

import type { ExplainerThinkingLevel } from '@/services/explainer/constants';
import { useNotebookStore } from './notebookStore';

/** The panel's two views: the current explanation, or this book's history. */
export type ExplainerView = 'item' | 'history';

/** The collapsible tiers below the always-on Simple restatement. */
export type ExplainerTier = 'notes' | 'grammar' | 'translation';

export type ExplainerExpandedTiers = ReadonlySet<ExplainerTier>;

/**
 * Resolve a book hash the way entries are keyed in `handleExplainer`:
 * `book.hash ?? bookKey.split('-')[0]`. The raw request fallback keeps a
 * freshly-opened panel working before the book context resolves. Shared by the
 * annotator entry point and the panel so the fallback chain can't drift.
 */
export const resolveBookHash = (
  bookHash: string | undefined,
  bookKey: string | undefined,
  fallback?: string,
): string => bookHash ?? bookKey?.split('-')[0] ?? fallback ?? '';

/**
 * Single-point default expansion for the collapsible tiers. v0 opens only the
 * always-on Simple restatement, so none of the collapsible tiers start expanded.
 * Keep this as the one source the store/panel reads from, so a future
 * "default expanded tiers" user setting replaces it without touching the
 * cascade layout or the panel wiring (ticket 04 / issue 04).
 */
export const DEFAULT_EXPANDED_TIERS: ExplainerExpandedTiers = new Set<ExplainerTier>();

/**
 * Session cap for per-entry expansions. Toggling a tier on many distinct entries
 * records one Set each; bound it so a long reading session can't grow unbounded
 * (this store is in-memory and has no persistence path).
 */
const MAX_EXPANDED_BY_ITEM = 200;

/** Everything the panel needs to start an explanation for a selection. */
export interface ExplainerOpenRequest {
  /** Display text exactly as selected (paragraph breaks preserved). */
  text: string;
  /** CFI anchor for jumping back; null when unknown. */
  cfi?: string | null;
  bookHash: string;
  bookTitle: string;
  sourceLang: string;
  nativeLang: string;
  thinking?: ExplainerThinkingLevel;
}

interface ExplainerState {
  isExplainerVisible: boolean;
  isExplainerPinned: boolean;
  explainerWidth: string;
  view: ExplainerView;
  /** Cache key of the entry currently shown; null while a request is pending. */
  currentItemKey: string | null;
  /** The selection/params last opened, so the panel can drive generation. */
  request: ExplainerOpenRequest | null;
  /** Session-level, per-entry expanded tiers, keyed by currentItemKey. */
  expandedByItem: Record<string, ExplainerExpandedTiers>;

  openExplainer: (request: ExplainerOpenRequest) => void;
  closeExplainer: () => void;
  /** Clear the opened request so the panel falls back to its idle empty state. */
  clearRequest: () => void;
  toggleExplainer: () => void;
  setExplainerVisible: (visible: boolean) => void;
  setExplainerPin: (pinned: boolean) => void;
  toggleExplainerPin: () => void;
  setExplainerWidth: (width: string) => void;
  getExplainerWidth: () => string;
  setView: (view: ExplainerView) => void;
  setCurrentItemKey: (key: string | null) => void;
  toggleTier: (tier: ExplainerTier) => void;
}

/**
 * Derived expanded tiers for the current item — the single source of truth is
 * `expandedByItem`, so there is no second `expandedTiers` field to drift.
 */
export const selectExpandedTiers = (state: ExplainerState): ExplainerExpandedTiers =>
  state.currentItemKey
    ? (state.expandedByItem[state.currentItemKey] ?? DEFAULT_EXPANDED_TIERS)
    : DEFAULT_EXPANDED_TIERS;

/** Drop the oldest inserted entries once the per-item expansion map grows past the cap. */
const capExpandedByItem = (
  record: Record<string, ExplainerExpandedTiers>,
): Record<string, ExplainerExpandedTiers> => {
  const keys = Object.keys(record);
  if (keys.length <= MAX_EXPANDED_BY_ITEM) return record;
  const pruned = { ...record };
  for (const key of keys.slice(0, keys.length - MAX_EXPANDED_BY_ITEM)) delete pruned[key];
  return pruned;
};

/**
 * Release the Notebook from the shared right-hand slot, but only when it is
 * floating (unpinned). A pinned Notebook is docked and visible by definition, so
 * closing it would break `pinned ⇒ visible` and let it remount over the
 * explainer; the two slots coexist instead.
 */
const closeFloatingNotebook = (): void => {
  // `useNotebookStore` is a static import of the zustand store, which always has
  // getState/setNotebookVisible in the app. The optional chaining exists purely
  // so component tests that mock the notebook store as a bare hook (without the
  // zustand methods) can still import this module without throwing; production
  // never hits the `?.` branch.
  const notebook = useNotebookStore.getState?.();
  if (!notebook || notebook.isNotebookPinned) return;
  notebook.setNotebookVisible?.(false);
};

/**
 * Explainer panel session state. Pure in-memory (a restart forgets the current
 * entry), mirroring the notebookStore subset. Shares the right-hand floating
 * slot with the Notebook and is mutually exclusive with it: opening the
 * explainer closes the Notebook, and (via a one-way subscription below) opening
 * the Notebook closes the explainer. Each keeps its own pin/width, but — like
 * `notebookStore`, which is also in-memory — persisting `isExplainerPinned` /
 * `explainerWidth` across restarts belongs to the panel/settings layer (tickets
 * 05/06), not this store. The "pure in-memory" contract here governs the
 * current entry; the session item is never persisted.
 */
export const useExplainerStore = create<ExplainerState>((set, get) => ({
  isExplainerVisible: false,
  isExplainerPinned: false,
  explainerWidth: '',
  view: 'item',
  currentItemKey: null,
  request: null,
  expandedByItem: {},

  openExplainer: (request) => {
    // Opening the explainer takes the shared right-hand slot from the Notebook.
    closeFloatingNotebook();
    set({
      request,
      view: 'item',
      isExplainerVisible: true,
      // A fresh selection has no entry key yet; the panel sets it on resolve.
      currentItemKey: null,
    });
  },

  closeExplainer: () => set({ isExplainerVisible: false }),
  clearRequest: () => set({ request: null, currentItemKey: null }),
  toggleExplainer: () => {
    // Toggling the panel back open simply reveals the last session entry — it
    // deliberately does NOT reset request/currentItemKey. That is reserved for
    // `openExplainer`, which starts a fresh selection.
    const next = !get().isExplainerVisible;
    if (next) closeFloatingNotebook();
    set({ isExplainerVisible: next });
  },
  setExplainerVisible: (visible) => {
    if (visible) closeFloatingNotebook();
    set({ isExplainerVisible: visible });
  },
  setExplainerPin: (pinned) => set({ isExplainerPinned: pinned }),
  toggleExplainerPin: () => set((state) => ({ isExplainerPinned: !state.isExplainerPinned })),
  setExplainerWidth: (width) => set({ explainerWidth: width }),
  getExplainerWidth: () => get().explainerWidth,
  setView: (view) => set({ view }),

  setCurrentItemKey: (key) => set({ currentItemKey: key }),

  toggleTier: (tier) =>
    set((state) => {
      const key = state.currentItemKey;
      // No current entry yet (generation pending) → nothing to remember.
      if (!key) return state;
      const base = state.expandedByItem[key] ?? DEFAULT_EXPANDED_TIERS;
      const next = new Set(base);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);

      // An empty set and absence are equivalent (`selectExpandedTiers` falls back
      // to DEFAULT for both), so drop the record to save a cap slot and avoid a
      // pointless LRU bump on later toggles of the same key.
      if (next.size === 0) {
        const rest = { ...state.expandedByItem };
        delete rest[key];
        return { expandedByItem: rest };
      }

      // LRU bump: drop then re-add so `key` moves to the most-recent position.
      // The cap then prunes the least-recently-toggled entry, never the one we
      // just touched (which would otherwise drop the current entry's memory).
      const rest = { ...state.expandedByItem };
      delete rest[key];
      return { expandedByItem: capExpandedByItem({ ...rest, [key]: next }) };
    }),
}));

// Mutual exclusivity, Notebook → Explainer. This is one-way (the reverse is
// handled by the open/set actions above) so explainerStore never needs to be
// imported by notebookStore, avoiding a module cycle. Only floating panels
// share the slot: an unpinned Notebook closing the explainer, and vice versa.
// A pinned (docked) panel on either side is left alone so it can't be silently
// closed and later remounted over the other.
// Same defensive rationale as `closeFloatingNotebook`: the real zustand store
// always has `subscribe`; the `?.` only tolerates the bare-hook mock in tests.
useNotebookStore.subscribe?.((state) => {
  if (
    state.isNotebookVisible &&
    !state.isNotebookPinned &&
    !useExplainerStore.getState().isExplainerPinned &&
    useExplainerStore.getState().isExplainerVisible
  ) {
    useExplainerStore.getState().closeExplainer();
  }
});
