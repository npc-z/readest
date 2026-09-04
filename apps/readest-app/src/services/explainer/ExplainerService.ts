import type { AISettings } from '@/services/ai/types';

import {
  DEFAULT_EXPLAINER_THINKING,
  EXPLAINER_INPUT_LIMITS,
  EXPLAINER_PROMPT_VERSION,
  type ExplainerThinkingLevel,
} from './constants';
import type { ExplanationEntry } from './ExplainerDb';
import { classifyGenerationError, ExplainerServiceError } from './errors';
import { createExplainerAiGateway, type ExplainerAiGateway } from './gateway';
import { salvagePayload } from './salvage';
import type { ExplainerPayload } from './schema';
import { containsInputCloseTag } from './prompts';
import { isMeaninglessText, normalizeAndHashText, truncateToUnitLimit } from './text';

/**
 * The persistence seam. `ExplainerDb` satisfies this structurally; tests
 * substitute an in-memory fake so the service never depends on SQLite or the
 * app service. Only the key lookup (cache) and the upsert (write-before-return)
 * are needed by the generation path.
 */
export interface ExplainerStore {
  getByKey(
    bookHash: string,
    textHash: string,
    nativeLang: string,
  ): Promise<ExplanationEntry | null>;
  upsert(entry: ExplanationEntry): Promise<void>;
}

export interface GetOrGenerateRequest {
  /** Display text exactly as the user saw it (paragraph breaks preserved). */
  text: string;
  bookHash: string;
  /** Book title snapshot stored with the entry so the library page can label it. */
  bookTitle: string;
  /** CFI anchor for jumping back to the passage; null when unknown. */
  cfi?: string | null;
  sourceLang: string;
  nativeLang: string;
  thinking?: ExplainerThinkingLevel;
}

export interface ExplainerServiceOptions {
  store: ExplainerStore;
  ai: ExplainerAiGateway;
  /** Clock injected for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
  /** UUID source for entry ids; defaults to `crypto.randomUUID`. */
  generateId?: () => string;
}

const defaultGenerateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Explainer data face — the single seam the UI talks to.
 *
 * `getOrGenerate` is the main contract: cache hit returns immediately without
 * calling AI; a miss generates, validates/salvages, writes to the store FIRST,
 * and only then returns (so a crash before the response still leaves the entry
 * persisted). Concurrent requests for the same key share one in-flight promise.
 */
export class ExplainerService {
  private readonly store: ExplainerStore;
  private readonly ai: ExplainerAiGateway;
  private readonly now: () => number;
  private readonly generateId: () => string;
  private readonly pendingByKey = new Map<string, Promise<ExplanationEntry>>();

  constructor(options: ExplainerServiceOptions) {
    this.store = options.store;
    this.ai = options.ai;
    this.now = options.now ?? Date.now;
    this.generateId = options.generateId ?? defaultGenerateId;
  }

  async getOrGenerate(request: GetOrGenerateRequest): Promise<ExplanationEntry> {
    // 1. Reject known-bad input before any provider call.
    if (isMeaninglessText(request.text)) {
      throw new ExplainerServiceError(
        'invalid-input',
        'Nothing to explain: the passage has no letters or numbers.',
      );
    }
    if (containsInputCloseTag(request.text)) {
      throw new ExplainerServiceError(
        'invalid-input',
        'The passage contains the reserved closing input delimiter.',
      );
    }

    // 2. Cap to the input unit limit, then normalize+hash the *display* text.
    //    `text` (display) and `textHash` (normalized key input) stay separate:
    //    formatting-only differences hit the same cache key.
    const { text, truncated } = truncateToUnitLimit(request.text, EXPLAINER_INPUT_LIMITS.maxUnits);
    const { hash } = await normalizeAndHashText(text);
    const key = `${request.bookHash}:${hash}:${request.nativeLang}`;

    // 3. Cache hit — no AI call, no write.
    const cached = await this.store.getByKey(request.bookHash, hash, request.nativeLang);
    if (cached) return this.withTruncated(cached, truncated);

    // 4. Concurrent same-key request — share the in-flight promise.
    const pending = this.pendingByKey.get(key);
    if (pending) {
      return pending.then((entry) => this.withTruncated(entry, truncated));
    }

    // 5. Miss: generate, validate/salvage, write first, then return.
    const promise = this.generateAndStore({ ...request, text }, hash, truncated);
    this.pendingByKey.set(key, promise);
    try {
      return await promise;
    } finally {
      this.pendingByKey.delete(key);
    }
  }

  private withTruncated(entry: ExplanationEntry, truncated: boolean): ExplanationEntry {
    return truncated ? { ...entry, truncated: true } : entry;
  }

  private async generateAndStore(
    request: GetOrGenerateRequest,
    hash: string,
    truncated: boolean,
  ): Promise<ExplanationEntry> {
    const payload = await this.generatePayload(request);
    const now = this.now();

    const entry: ExplanationEntry = {
      id: this.generateId(),
      bookHash: request.bookHash,
      bookTitle: request.bookTitle,
      text: request.text,
      textHash: hash,
      sourceLang: request.sourceLang,
      nativeLang: request.nativeLang,
      cfi: request.cfi ?? null,
      payload,
      promptVersion: EXPLAINER_PROMPT_VERSION,
      createdAt: now,
      updatedAt: now,
    };

    // Write-before-return. If the DB write fails, the whole call rejects — we
    // never hand back generated content that we failed to persist.
    await this.store.upsert(entry);
    return this.withTruncated(entry, truncated);
  }

  private async generatePayload(request: GetOrGenerateRequest): Promise<ExplainerPayload> {
    const thinking = request.thinking ?? DEFAULT_EXPLAINER_THINKING;

    let result;
    try {
      result = await this.ai.generate({
        text: request.text,
        sourceLang: request.sourceLang,
        nativeLang: request.nativeLang,
        thinking,
      });
    } catch (error) {
      // AI errors (not-configured/timeout/provider) surface as stable codes.
      throw classifyGenerationError(error);
    }

    const payload = await salvagePayload({
      rawText: result.rawText,
      structured: result.structured,
      sourceLang: request.sourceLang,
      nativeLang: request.nativeLang,
    });

    if (!payload) {
      throw new ExplainerServiceError(
        'no-object-salvaged',
        'The model output could not be parsed into an explanation.',
      );
    }

    return payload;
  }
}

/**
 * Wiring helper: builds the store-agnostic service with the real platform
 * gateway. The UI layer passes an already-open `ExplainerDb` so the service
 * stays free of Tauri/Next dependencies.
 */
export const createExplainerService = (options: {
  store: ExplainerStore;
  settings: AISettings;
  ai?: ExplainerAiGateway;
}): ExplainerService =>
  new ExplainerService({
    store: options.store,
    ai: options.ai ?? createExplainerAiGateway(options.settings),
  });
