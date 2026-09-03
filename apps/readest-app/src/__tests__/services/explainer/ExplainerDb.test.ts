import { describe, expect, test, vi } from 'vitest';

import { ExplainerDb, type ExplanationEntry } from '@/services/explainer/ExplainerDb';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import type { DatabaseService } from '@/types/database';
import type { AppService } from '@/types/system';

const openDb = async (): Promise<DatabaseService> => {
  const db = await NodeDatabaseService.open(':memory:');
  await migrate(db, getMigrations('explainer'));
  return db;
};

const makeEntry = (overrides: Partial<ExplanationEntry> = {}): ExplanationEntry => ({
  id: 'explanation-1',
  bookHash: 'book-a',
  bookTitle: 'Book A',
  text: 'The passage',
  textHash: 'hash-1',
  sourceLang: 'en',
  nativeLang: 'zh-CN',
  cfi: null,
  payload: { simple: 'simplified text' },
  promptVersion: 1,
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

describe('ExplainerDb', () => {
  test('getByKey returns the entry for an existing key', async () => {
    const database = await openDb();
    const db = ExplainerDb.from(database);
    const entry = makeEntry();
    await db.upsert(entry);

    await expect(db.getByKey('book-a', 'hash-1', 'zh-CN')).resolves.toEqual(entry);
    await db.close();
  });

  test('getByKey returns null for an unknown key', async () => {
    const db = ExplainerDb.from(await openDb());
    await expect(db.getByKey('book-a', 'hash-1', 'zh-CN')).resolves.toBeNull();
    await db.close();
  });

  test('getByKey requires all three key parts to match', async () => {
    const db = ExplainerDb.from(await openDb());
    await db.upsert(makeEntry());

    await expect(db.getByKey('book-a', 'hash-1', 'en')).resolves.toBeNull();
    await expect(db.getByKey('book-a', 'other-hash', 'zh-CN')).resolves.toBeNull();
    await expect(db.getByKey('other-book', 'hash-1', 'zh-CN')).resolves.toBeNull();
    await db.close();
  });

  test('upsert on the same key overwrites in place and keeps a single row', async () => {
    const db = ExplainerDb.from(await openDb());
    await db.upsert(makeEntry({ createdAt: 1000, updatedAt: 1000 }));
    await db.upsert(
      makeEntry({
        id: 'explanation-2',
        payload: { simple: 'regenerated' },
        promptVersion: 2,
        updatedAt: 2000,
        createdAt: 2000,
      }),
    );

    const rows = await db.listAll({ limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'explanation-1', // row identity kept
      payload: { simple: 'regenerated' },
      promptVersion: 2,
      createdAt: 1000, // preserved from first insert
      updatedAt: 2000,
    });
    await db.close();
  });

  test('delete removes an entry by id', async () => {
    const db = ExplainerDb.from(await openDb());
    const entry = makeEntry();
    await db.upsert(entry);
    await db.delete(entry.id);

    await expect(db.getByKey('book-a', 'hash-1', 'zh-CN')).resolves.toBeNull();
    await db.close();
  });

  test('deleteByBook removes only that book entries', async () => {
    const db = ExplainerDb.from(await openDb());
    await db.upsert(makeEntry({ id: 'e1', bookHash: 'book-a' }));
    await db.upsert(makeEntry({ id: 'e2', bookHash: 'book-b' }));
    await db.deleteByBook('book-a');

    const remaining = await db.listAll({ limit: 10, offset: 0 });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.bookHash).toBe('book-b');
    await db.close();
  });

  test('listByBook returns newest first, paginated, scoped to the book', async () => {
    const db = ExplainerDb.from(await openDb());
    await db.upsert(makeEntry({ id: 'a1', createdAt: 100, updatedAt: 100 }));
    await db.upsert(
      makeEntry({
        id: 'a2',
        text: 'Second passage',
        textHash: 'hash-2',
        createdAt: 200,
        updatedAt: 200,
      }),
    );
    await db.upsert(
      makeEntry({
        id: 'a3',
        text: 'Third passage',
        textHash: 'hash-3',
        createdAt: 300,
        updatedAt: 300,
      }),
    );
    await db.upsert(makeEntry({ id: 'b1', bookHash: 'book-b' }));

    const firstPage = await db.listByBook('book-a', { limit: 2, offset: 0 });
    expect(firstPage.map((row) => row.id)).toEqual(['a3', 'a2']);

    const secondPage = await db.listByBook('book-a', { limit: 2, offset: 2 });
    expect(secondPage.map((row) => row.id)).toEqual(['a1']);
    await db.close();
  });

  test('listAll returns newest first, paginated, across books', async () => {
    const db = ExplainerDb.from(await openDb());
    await db.upsert(makeEntry({ id: 'a1', createdAt: 100, updatedAt: 100 }));
    await db.upsert(makeEntry({ id: 'b1', bookHash: 'book-b', createdAt: 200, updatedAt: 200 }));
    await db.upsert(makeEntry({ id: 'c1', bookHash: 'book-c', createdAt: 300, updatedAt: 300 }));

    const all = await db.listAll({ limit: 2, offset: 0 });
    expect(all.map((row) => row.id)).toEqual(['c1', 'b1']);

    const rest = await db.listAll({ limit: 2, offset: 2 });
    expect(rest.map((row) => row.id)).toEqual(['a1']);
    await db.close();
  });

  test('search matches text substrings and escape LIKE wildcards', async () => {
    const db = ExplainerDb.from(await openDb());
    await db.upsert(makeEntry({ id: 'pct', text: 'Save 50% off now', textHash: 'hash-p' }));
    await db.upsert(makeEntry({ id: 'snake', text: 'a snake_case name', textHash: 'hash-s' }));
    await db.upsert(makeEntry({ id: 'plain', text: 'just plain words', textHash: 'hash-t' }));

    await expect((await db.search('%', { limit: 10, offset: 0 })).map((row) => row.id)).toEqual([
      'pct',
    ]);
    await expect((await db.search('_', { limit: 10, offset: 0 })).map((row) => row.id)).toEqual([
      'snake',
    ]);
    await expect(
      (await db.search('50% off', { limit: 10, offset: 0 })).map((row) => row.id),
    ).toEqual(['pct']);
    await expect((await db.search('plain', { limit: 10, offset: 0 })).map((row) => row.id)).toEqual(
      ['plain'],
    );
    await expect(await db.search('absent', { limit: 10, offset: 0 })).toEqual([]);
    await db.close();
  });

  test('search can be scoped to a single book', async () => {
    const db = ExplainerDb.from(await openDb());
    await db.upsert(makeEntry({ id: 'a1', text: 'common text' }));
    await db.upsert(makeEntry({ id: 'b1', bookHash: 'book-b', text: 'common text' }));

    const rows = await db.search('common', { bookHash: 'book-b', limit: 10, offset: 0 });
    expect(rows.map((row) => row.id)).toEqual(['b1']);
    await db.close();
  });

  test('migration is idempotent', async () => {
    const database = await NodeDatabaseService.open(':memory:');
    await migrate(database, getMigrations('explainer'));
    const db = ExplainerDb.from(database);
    await db.upsert(makeEntry());
    // Clear both the tracking table and the fast-path version so the second
    // run re-executes the migration SQL against the populated table instead
    // of short-circuiting on the "already applied" skip.
    await database.execute('DELETE FROM __migrations');
    await database.execute('PRAGMA user_version = 0');
    await migrate(database, getMigrations('explainer'));

    const applied = await database.select<{ name: string }>('SELECT name FROM __migrations');
    expect(applied.map((row) => row.name)).toEqual(['2026090301_explainer']);
    const version = await database.select<{ user_version: number }>('PRAGMA user_version');
    expect(version[0]?.user_version).toBe(1);

    const rows = await db.listAll({ limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    await db.close();
  });

  test('open lazily opens through the app service and close closes the database', async () => {
    const database = await openDb();
    const close = vi.spyOn(database, 'close');
    const appService = {
      openDatabase: vi.fn(async () => database),
    } as unknown as AppService;

    const db = ExplainerDb.open(appService);
    expect(appService.openDatabase).not.toHaveBeenCalled();

    await db.upsert(makeEntry());
    expect(appService.openDatabase).toHaveBeenCalledWith('explainer', 'explainer.db', 'Data');
    expect(appService.openDatabase).toHaveBeenCalledTimes(1);

    await db.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
