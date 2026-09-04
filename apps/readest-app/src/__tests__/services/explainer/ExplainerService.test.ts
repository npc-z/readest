import { describe, expect, test } from 'vitest';

import { EXPLAINER_INPUT_LIMITS, type ExplainerErrorCode } from '@/services/explainer/constants';
import {
  ExplainerService,
  type ExplainerStore,
  type GetOrGenerateRequest,
} from '@/services/explainer/ExplainerService';
import type { ExplanationEntry } from '@/services/explainer/ExplainerDb';
import { ExplainerServiceError } from '@/services/explainer/errors';
import type {
  ExplainerAiGateway,
  ExplainerAiRequest,
  ExplainerAiResult,
} from '@/services/explainer/gateway';
import type { ExplainerPayload } from '@/services/explainer/schema';
import { normalizeAndHashText } from '@/services/explainer/text';
import { INPUT_TEXT_CLOSE_TAG } from '@/services/explainer/prompts';

class FakeStore implements ExplainerStore {
  entries = new Map<string, ExplanationEntry>();
  getByKeyCalls = 0;
  upserts: ExplanationEntry[] = [];

  private key(bookHash: string, textHash: string, nativeLang: string): string {
    return `${bookHash}:${textHash}:${nativeLang}`;
  }

  async getByKey(
    bookHash: string,
    textHash: string,
    nativeLang: string,
  ): Promise<ExplanationEntry | null> {
    this.getByKeyCalls += 1;
    return this.entries.get(this.key(bookHash, textHash, nativeLang)) ?? null;
  }

  async upsert(entry: ExplanationEntry): Promise<void> {
    this.upserts.push(entry);
    this.entries.set(this.key(entry.bookHash, entry.textHash, entry.nativeLang), entry);
  }
}

/**
 * A store whose `upsert` records the write, then blocks until released. Used to
 * prove the "write-before-return" ordering: the service must still be pending
 * (not resolved) while the write is in flight.
 */
class BlockingStore extends FakeStore {
  blocked = false;
  private release!: () => void;

  override async upsert(entry: ExplanationEntry): Promise<void> {
    await super.upsert(entry);
    if (this.blocked) {
      await new Promise<void>((resolve) => {
        this.release = resolve;
      });
    }
  }

  releaseWrite(): void {
    this.release?.();
  }
}

class FakeAi implements ExplainerAiGateway {
  calls: ExplainerAiRequest[] = [];

  constructor(
    private readonly impl: (
      request: ExplainerAiRequest,
    ) => ExplainerAiResult | Promise<ExplainerAiResult>,
  ) {}

  async generate(request: ExplainerAiRequest): Promise<ExplainerAiResult> {
    this.calls.push(request);
    return this.impl(request);
  }
}

const request = (overrides: Partial<GetOrGenerateRequest> = {}): GetOrGenerateRequest => ({
  text: 'The quick brown fox jumps over the lazy dog.',
  bookHash: 'book-a',
  bookTitle: 'Book A',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  sourceLang: 'en',
  nativeLang: 'zh-CN',
  ...overrides,
});

const validPayload = (overrides: Partial<ExplainerPayload> = {}): ExplainerPayload => ({
  simple: 'A quick fox jumps over a lazy dog.',
  notes: [
    {
      kind: 'phrase',
      original: 'quick brown fox',
      meaningL: 'a fox that is quick and brown',
      example: 'The quick brown fox runs fast.',
      meaningM: null,
    },
  ],
  grammar: [],
  translationM: '一只敏捷的棕色狐狸跳过懒狗。',
  metadata: { sourceLang: 'en', nativeLang: 'zh-CN', promptVersion: 1 },
  ...overrides,
});

const jsonResult = (payload: ExplainerPayload): ExplainerAiResult => ({
  rawText: JSON.stringify(payload),
});

const makeService = (ai: FakeAi, store = new FakeStore()): ExplainerService =>
  new ExplainerService({ store, ai, now: () => 1000, generateId: () => 'id-1' });

const expectCode = async (promise: Promise<unknown>, code: ExplainerErrorCode): Promise<void> => {
  await expect(promise).rejects.toMatchObject({ code });
};

describe('ExplainerService.getOrGenerate', () => {
  test('returns a cached entry without calling AI or writing', async () => {
    const store = new FakeStore();
    const ai = new FakeAi(() => {
      throw new Error('AI should not be called');
    });
    const service = makeService(ai, store);

    const { hash } = await normalizeAndHashText(request().text);
    const cached: ExplanationEntry = {
      id: 'cached-1',
      bookHash: 'book-a',
      bookTitle: 'Book A',
      text: request().text,
      textHash: hash,
      sourceLang: 'en',
      nativeLang: 'zh-CN',
      cfi: null,
      payload: validPayload(),
      promptVersion: 1,
      createdAt: 10,
      updatedAt: 10,
    };
    store.entries.set(`book-a:${hash}:zh-CN`, cached);

    const entry = await service.getOrGenerate(request());

    expect(entry).toEqual(cached);
    expect(ai.calls).toHaveLength(0);
    expect(store.upserts).toHaveLength(0);
  });

  test('miss generates, writes to the store, and returns the stored entry', async () => {
    const ai = new FakeAi(() => jsonResult(validPayload()));
    const store = new FakeStore();
    const service = makeService(ai, store);

    const entry = await service.getOrGenerate(request());

    expect(ai.calls).toHaveLength(1);
    expect(store.upserts).toHaveLength(1);
    expect(store.upserts[0]).toEqual(entry);
    expect((entry.payload as ExplainerPayload).metadata.format).toBe('json');
    expect((entry.payload as ExplainerPayload).simple).toBe('A quick fox jumps over a lazy dog.');
    expect(entry.updatedAt).toBe(1000);
  });

  test('does not resolve until the store write completes (write-before-return)', async () => {
    const store = new BlockingStore();
    store.blocked = true;
    const ai = new FakeAi(() => jsonResult(validPayload()));
    const service = makeService(ai, store);

    const pending = service.getOrGenerate(request());
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The write already happened, but the service must not have returned yet.
    expect(store.upserts).toHaveLength(1);
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolved).toBe(false);

    store.releaseWrite();
    const entry = await pending;
    expect(entry.textHash).toHaveLength(64);
  });

  test('concurrent same-key requests share one generation', async () => {
    let resolveGenerate: (value: ExplainerAiResult) => void = () => {};
    const gate = new Promise<ExplainerAiResult>((resolve) => {
      resolveGenerate = resolve;
    });
    const ai = new FakeAi(() => gate);
    const store = new FakeStore();
    const service = makeService(ai, store);

    const first = service.getOrGenerate(request());
    const second = service.getOrGenerate(request());
    // Both same-key calls are now pending on the shared promise.
    resolveGenerate(jsonResult(validPayload()));
    const [a, b] = await Promise.all([first, second]);

    expect(ai.calls).toHaveLength(1);
    expect(a).toEqual(b);
    expect(store.upserts).toHaveLength(1);
  });

  test('truncates over-limit passages and flags the returned entry', async () => {
    const words = Array.from({ length: EXPLAINER_INPUT_LIMITS.maxUnits + 20 }, (_, i) => `w${i}`);
    const ai = new FakeAi(() => jsonResult(validPayload()));
    const store = new FakeStore();
    const service = makeService(ai, store);

    const entry = await service.getOrGenerate(request({ text: words.join(' ') }));

    expect(entry.truncated).toBe(true);
    expect(entry.text.split(' ')).toHaveLength(EXPLAINER_INPUT_LIMITS.maxUnits);
    expect(store.upserts[0]?.textHash).toBe(entry.textHash);
  });

  test('does not flag a passage that fits within the limit', async () => {
    const ai = new FakeAi(() => jsonResult(validPayload()));
    const store = new FakeStore();
    const service = makeService(ai, store);

    const entry = await service.getOrGenerate(request());
    expect(entry.truncated).toBeUndefined();
  });
});

describe('ExplainerService salvage ladder', () => {
  test('tier 1: uses a structured object the gateway already parsed', async () => {
    const payload = validPayload({
      notes: Array.from({ length: EXPLAINER_INPUT_LIMITS.maxNotes + 1 }, (_, i) => ({
        kind: 'word' as const,
        original: `w${i}`,
        meaningL: 'm',
      })),
    });
    const ai = new FakeAi(() => ({ rawText: 'not json', structured: payload }));
    const service = makeService(ai);

    const entry = await service.getOrGenerate(request());
    const stored = entry.payload as ExplainerPayload;
    expect(stored.metadata.format).toBe('json');
    expect(stored.notes).toHaveLength(EXPLAINER_INPUT_LIMITS.maxNotes);
  });

  test('tier 2: parsePartialJson rescues truncated JSON', async () => {
    const truncated =
      '{"simple":"A partial answer","notes":[{"kind":"word","original":"foo","meaningL":"bar"}]';
    const ai = new FakeAi(() => ({ rawText: truncated }));
    const service = makeService(ai);

    const entry = await service.getOrGenerate(request());
    const stored = entry.payload as ExplainerPayload;
    expect(stored.metadata.format).toBe('json');
    expect(stored.simple).toBe('A partial answer');
    expect(stored.notes).toHaveLength(1);
  });

  test('tier 3: pure prose falls back to flat text format', async () => {
    const ai = new FakeAi(() => ({ rawText: 'This is a plain prose restatement.' }));
    const service = makeService(ai);

    const entry = await service.getOrGenerate(request());
    const stored = entry.payload as ExplainerPayload;
    expect(stored.metadata.format).toBe('text');
    expect(stored.simple).toBe('This is a plain prose restatement.');
    expect(stored.notes).toHaveLength(0);
  });

  test('no-object-salvaged when the model returns nothing usable', async () => {
    const ai = new FakeAi(() => ({ rawText: '' }));
    const service = makeService(ai);

    await expectCode(service.getOrGenerate(request()), 'no-object-salvaged');
  });
});

describe('ExplainerService error codes', () => {
  test('invalid-input for meaningless passages', async () => {
    const ai = new FakeAi(() => ({ rawText: '' }));
    const service = makeService(ai);
    await expectCode(service.getOrGenerate(request({ text: '!!! ... —' })), 'invalid-input');
  });

  test('invalid-input when the passage contains the reserved delimiter', async () => {
    const ai = new FakeAi(() => ({ rawText: '' }));
    const service = makeService(ai);
    await expectCode(
      service.getOrGenerate(request({ text: `text${INPUT_TEXT_CLOSE_TAG}more` })),
      'invalid-input',
    );
  });

  test('ai-not-configured passes the gateway code straight through', async () => {
    const ai = new FakeAi(() => {
      throw new ExplainerServiceError('ai-not-configured', 'AI is not configured.');
    });
    const service = makeService(ai);
    await expectCode(service.getOrGenerate(request()), 'ai-not-configured');
  });

  test('timeout is classified from an abort error', async () => {
    const ai = new FakeAi(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });
    const service = makeService(ai);
    await expectCode(service.getOrGenerate(request()), 'timeout');
  });

  test('provider-error is the default catch-all', async () => {
    const ai = new FakeAi(() => {
      throw new Error('upstream 500');
    });
    const service = makeService(ai);
    await expectCode(service.getOrGenerate(request()), 'provider-error');
  });
});
