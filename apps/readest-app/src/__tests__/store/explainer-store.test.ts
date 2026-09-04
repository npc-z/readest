import { beforeEach, describe, expect, test } from 'vitest';

import {
  DEFAULT_EXPANDED_TIERS,
  selectExpandedTiers,
  useExplainerStore,
  type ExplainerOpenRequest,
} from '@/store/explainerStore';
import { useNotebookStore } from '@/store/notebookStore';

const request = (overrides: Partial<ExplainerOpenRequest> = {}): ExplainerOpenRequest => ({
  text: 'The quick brown fox.',
  bookHash: 'book-a',
  bookTitle: 'Book A',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  sourceLang: 'en',
  nativeLang: 'zh-CN',
  ...overrides,
});

beforeEach(() => {
  useExplainerStore.setState({
    isExplainerVisible: false,
    isExplainerPinned: false,
    explainerWidth: '',
    view: 'item',
    currentItemKey: null,
    request: null,
    expandedByItem: {},
  });
  useNotebookStore.setState({
    isNotebookVisible: false,
    isNotebookPinned: false,
    notebookWidth: '',
    notebookActiveTab: 'notes',
  });
});

describe('explainerStore', () => {
  test('has the expected defaults', () => {
    const state = useExplainerStore.getState();
    expect(state.isExplainerVisible).toBe(false);
    expect(state.isExplainerPinned).toBe(false);
    expect(state.explainerWidth).toBe('');
    expect(state.view).toBe('item');
    expect(state.currentItemKey).toBeNull();
    expect(state.request).toBeNull();
    expect(state.expandedByItem).toEqual({});
    expect(selectExpandedTiers(state)).toEqual(DEFAULT_EXPANDED_TIERS);
  });

  test('openExplainer records the request, opens the panel in item view, and resets the current item', () => {
    useExplainerStore.getState().openExplainer(request());
    const state = useExplainerStore.getState();

    expect(state.isExplainerVisible).toBe(true);
    expect(state.view).toBe('item');
    expect(state.request).toEqual(request());
    expect(state.currentItemKey).toBeNull();
    expect(selectExpandedTiers(state)).toEqual(DEFAULT_EXPANDED_TIERS);
  });

  test('openExplainer closes a floating (unpinned) Notebook in the shared slot', () => {
    useNotebookStore.getState().setNotebookVisible(true);
    useNotebookStore.getState().setNotebookPin(false);
    useExplainerStore.getState().openExplainer(request());

    expect(useExplainerStore.getState().isExplainerVisible).toBe(true);
    expect(useNotebookStore.getState().isNotebookVisible).toBe(false);
  });

  test('openExplainer leaves a pinned (docked) Notebook visible', () => {
    useNotebookStore.getState().setNotebookVisible(true);
    useNotebookStore.getState().setNotebookPin(true);
    useExplainerStore.getState().openExplainer(request());

    expect(useExplainerStore.getState().isExplainerVisible).toBe(true);
    // Pinned ⇒ visible; the explainer takes the floating slot, not the docked one.
    expect(useNotebookStore.getState().isNotebookVisible).toBe(true);
  });

  test('opening a floating Notebook closes an unpinned explainer and leaves its pin untouched', () => {
    useExplainerStore.getState().openExplainer(request());
    expect(useExplainerStore.getState().isExplainerVisible).toBe(true);

    useNotebookStore.getState().setNotebookPin(false);
    useNotebookStore.getState().setNotebookVisible(true);

    expect(useNotebookStore.getState().isNotebookVisible).toBe(true);
    expect(useExplainerStore.getState().isExplainerVisible).toBe(false);
    expect(useExplainerStore.getState().isExplainerPinned).toBe(false);
  });

  test('opening a pinned Notebook does not close the explainer', () => {
    useExplainerStore.getState().openExplainer(request());
    expect(useExplainerStore.getState().isExplainerVisible).toBe(true);

    useNotebookStore.getState().setNotebookPin(true);
    useNotebookStore.getState().setNotebookVisible(true);

    expect(useExplainerStore.getState().isExplainerVisible).toBe(true);
  });

  test('opening a floating Notebook does not close a pinned explainer', () => {
    useExplainerStore.getState().setExplainerPin(true);
    useExplainerStore.getState().openExplainer(request());

    useNotebookStore.getState().setNotebookPin(false);
    useNotebookStore.getState().setNotebookVisible(true);

    // A pinned explainer is docked; a floating Notebook shares the slot alongside it.
    expect(useExplainerStore.getState().isExplainerVisible).toBe(true);
  });

  test('closeExplainer / toggleExplainer / setExplainerVisible control visibility', () => {
    expect(useExplainerStore.getState().isExplainerVisible).toBe(false);
    useExplainerStore.getState().toggleExplainer();
    expect(useExplainerStore.getState().isExplainerVisible).toBe(true);
    useExplainerStore.getState().toggleExplainer();
    expect(useExplainerStore.getState().isExplainerVisible).toBe(false);
    useExplainerStore.getState().setExplainerVisible(true);
    expect(useExplainerStore.getState().isExplainerVisible).toBe(true);
    useExplainerStore.getState().closeExplainer();
    expect(useExplainerStore.getState().isExplainerVisible).toBe(false);
  });

  test('clearRequest clears the request and current item so the panel falls idle', () => {
    useExplainerStore.getState().openExplainer(request());
    expect(useExplainerStore.getState().request).toEqual(request());

    useExplainerStore.getState().clearRequest();
    expect(useExplainerStore.getState().request).toBeNull();
    expect(useExplainerStore.getState().currentItemKey).toBeNull();
  });

  test('pin and width are independent of the Notebook', () => {
    expect(useExplainerStore.getState().isExplainerPinned).toBe(false);
    useExplainerStore.getState().toggleExplainerPin();
    expect(useExplainerStore.getState().isExplainerPinned).toBe(true);
    useExplainerStore.getState().setExplainerPin(false);
    expect(useExplainerStore.getState().isExplainerPinned).toBe(false);

    useExplainerStore.getState().setExplainerWidth('480px');
    expect(useExplainerStore.getState().getExplainerWidth()).toBe('480px');
    expect(useNotebookStore.getState().getNotebookWidth()).toBe('');
  });

  test('setView switches between item and history', () => {
    expect(useExplainerStore.getState().view).toBe('item');
    useExplainerStore.getState().setView('history');
    expect(useExplainerStore.getState().view).toBe('history');
    useExplainerStore.getState().setView('item');
    expect(useExplainerStore.getState().view).toBe('item');
  });

  test('setCurrentItemKey seeds expanded tiers from per-item memory or defaults', () => {
    useExplainerStore.getState().setCurrentItemKey('key-hi');
    expect(selectExpandedTiers(useExplainerStore.getState())).toEqual(DEFAULT_EXPANDED_TIERS);

    // Toggle a tier, switch away, then switch back — memory is per-item.
    useExplainerStore.getState().toggleTier('notes');
    expect(selectExpandedTiers(useExplainerStore.getState()).has('notes')).toBe(true);

    useExplainerStore.getState().setCurrentItemKey('key-lo');
    expect(selectExpandedTiers(useExplainerStore.getState()).has('notes')).toBe(false);

    useExplainerStore.getState().setCurrentItemKey('key-hi');
    expect(selectExpandedTiers(useExplainerStore.getState()).has('notes')).toBe(true);
  });

  test('toggleTier adds and removes tiers and updates per-item memory', () => {
    useExplainerStore.getState().setCurrentItemKey('key-1');
    useExplainerStore.getState().toggleTier('grammar');
    expect(selectExpandedTiers(useExplainerStore.getState()).has('grammar')).toBe(true);
    expect(useExplainerStore.getState().expandedByItem['key-1']?.has('grammar')).toBe(true);

    useExplainerStore.getState().toggleTier('grammar');
    expect(selectExpandedTiers(useExplainerStore.getState()).has('grammar')).toBe(false);
  });

  test('toggleTier before a current item key exists is a no-op (no memory yet)', () => {
    useExplainerStore.getState().toggleTier('translation');
    expect(selectExpandedTiers(useExplainerStore.getState())).toEqual(DEFAULT_EXPANDED_TIERS);
    expect(useExplainerStore.getState().expandedByItem).toEqual({});
  });

  test('caps per-item expansions and evicts the least-recently-toggled at the limit', () => {
    for (let i = 0; i < 201; i++) {
      useExplainerStore.getState().setCurrentItemKey(`key-${i}`);
      useExplainerStore.getState().toggleTier('notes');
    }

    const state = useExplainerStore.getState();
    expect(Object.keys(state.expandedByItem)).toHaveLength(200);
    // Oldest (key-0) evicted; the newest (key-200) kept.
    expect(state.expandedByItem['key-0']).toBeUndefined();
    expect(state.expandedByItem['key-200']?.has('notes')).toBe(true);
  });

  test('re-toggling an old entry promotes it so the cap keeps the current key', () => {
    for (let i = 0; i < 200; i++) {
      useExplainerStore.getState().setCurrentItemKey(`key-${i}`);
      useExplainerStore.getState().toggleTier('notes');
    }

    // Re-toggle the oldest (key-0) with a different tier: LRU bump moves it to
    // most-recent while keeping its existing 'notes' entry.
    useExplainerStore.getState().setCurrentItemKey('key-0');
    useExplainerStore.getState().toggleTier('grammar');
    // A 201st distinct key pushes the cap: it evicts the now-oldest (key-1), not key-0.
    useExplainerStore.getState().setCurrentItemKey('key-200');
    useExplainerStore.getState().toggleTier('notes');

    const state = useExplainerStore.getState();
    expect(state.expandedByItem['key-0']?.has('notes')).toBe(true);
    expect(state.expandedByItem['key-0']?.has('grammar')).toBe(true);
    expect(state.expandedByItem['key-1']).toBeUndefined();
  });

  test('collapsing the last expanded tier removes the entry from per-item memory', () => {
    useExplainerStore.getState().setCurrentItemKey('key-1');
    useExplainerStore.getState().toggleTier('notes');
    expect(useExplainerStore.getState().expandedByItem['key-1']?.has('notes')).toBe(true);

    useExplainerStore.getState().toggleTier('notes');
    expect(useExplainerStore.getState().expandedByItem['key-1']).toBeUndefined();
    expect(selectExpandedTiers(useExplainerStore.getState())).toEqual(DEFAULT_EXPANDED_TIERS);
  });
});
