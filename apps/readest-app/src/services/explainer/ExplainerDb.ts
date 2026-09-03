import type { DatabaseService } from '@/types/database';
import type { AppService } from '@/types/system';

export interface ExplanationEntry {
  id: string;
  bookHash: string;
  bookTitle: string;
  text: string;
  textHash: string;
  sourceLang: string;
  nativeLang: string;
  cfi: string | null;
  payload: unknown;
  promptVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface ListOptions {
  limit: number;
  offset: number;
}

/** Text search: substring match on the passage text, optionally scoped to a book. */
export interface SearchOptions extends ListOptions {
  bookHash?: string;
}

const DB_SCHEMA = 'explainer';
const DB_PATH = 'explainer.db';
type OpenDb = Awaited<ReturnType<AppService['openDatabase']>>;

type ExplanationRow = {
  id: string;
  book_hash: string;
  book_title: string;
  text: string;
  text_hash: string;
  source_lang: string;
  native_lang: string;
  cfi: string | null;
  payload: string;
  prompt_version: number;
  created_at: number;
  updated_at: number;
};

const ENTRY_COLUMNS =
  'id, book_hash, book_title, text, text_hash, source_lang, native_lang, cfi, payload, prompt_version, created_at, updated_at';

const parsePayload = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const toEntry = (row: ExplanationRow): ExplanationEntry => ({
  id: row.id,
  bookHash: row.book_hash,
  bookTitle: row.book_title,
  text: row.text,
  textHash: row.text_hash,
  sourceLang: row.source_lang,
  nativeLang: row.native_lang,
  cfi: row.cfi,
  payload: parsePayload(row.payload),
  promptVersion: row.prompt_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Escape LIKE wildcards so user queries match literal text. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Persists generated explanations keyed by (bookHash, textHash, nativeLang).
 *
 * Open either through the app service (lazily, migrations handled by the
 * platform) or with an already-migrated database for tests.
 */
export class ExplainerDb {
  private databasePromise: Promise<OpenDb> | null = null;

  private constructor(private readonly openDatabase: () => Promise<OpenDb>) {}

  static open(appService: AppService): ExplainerDb {
    return new ExplainerDb(() => appService.openDatabase(DB_SCHEMA, DB_PATH, 'Data'));
  }

  static from(database: DatabaseService): ExplainerDb {
    return new ExplainerDb(async () => database);
  }

  private async withDb<T>(callback: (database: OpenDb) => Promise<T>): Promise<T> {
    this.databasePromise ??= this.openDatabase();
    return callback(await this.databasePromise);
  }

  async close(): Promise<void> {
    const pending = this.databasePromise;
    this.databasePromise = null;
    if (pending) await (await pending).close();
  }

  async getByKey(
    bookHash: string,
    textHash: string,
    nativeLang: string,
  ): Promise<ExplanationEntry | null> {
    return this.withDb(async (database) => {
      const rows = await database.select<ExplanationRow>(
        `SELECT ${ENTRY_COLUMNS}
         FROM explanations
         WHERE book_hash = ? AND text_hash = ? AND native_lang = ?`,
        [bookHash, textHash, nativeLang],
      );
      return rows[0] ? toEntry(rows[0]) : null;
    });
  }

  async upsert(entry: ExplanationEntry): Promise<void> {
    await this.withDb(async (database) => {
      await database.execute(
        `INSERT INTO explanations (
           id, book_hash, book_title, text, text_hash, source_lang, native_lang,
           cfi, payload, prompt_version, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(book_hash, text_hash, native_lang) DO UPDATE SET
           book_title = excluded.book_title,
           text = excluded.text,
           source_lang = excluded.source_lang,
           cfi = excluded.cfi,
           payload = excluded.payload,
           prompt_version = excluded.prompt_version,
           updated_at = excluded.updated_at`,
        [
          entry.id,
          entry.bookHash,
          entry.bookTitle,
          entry.text,
          entry.textHash,
          entry.sourceLang,
          entry.nativeLang,
          entry.cfi,
          JSON.stringify(entry.payload),
          entry.promptVersion,
          entry.createdAt,
          entry.updatedAt,
        ],
      );
    });
  }

  async delete(id: string): Promise<void> {
    await this.withDb(async (database) => {
      await database.execute('DELETE FROM explanations WHERE id = ?', [id]);
    });
  }

  async deleteByBook(bookHash: string): Promise<void> {
    await this.withDb(async (database) => {
      await database.execute('DELETE FROM explanations WHERE book_hash = ?', [bookHash]);
    });
  }

  private async list(where: string | null, parameters: unknown[], options: ListOptions) {
    return this.withDb(async (database) => {
      const rows = await database.select<ExplanationRow>(
        `SELECT ${ENTRY_COLUMNS}
         FROM explanations
         ${where ? `WHERE ${where}` : ''}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...parameters, options.limit, options.offset],
      );
      return rows.map(toEntry);
    });
  }

  async listByBook(bookHash: string, options: ListOptions): Promise<ExplanationEntry[]> {
    return this.list('book_hash = ?', [bookHash], options);
  }

  async listAll(options: ListOptions): Promise<ExplanationEntry[]> {
    return this.list(null, [], options);
  }

  async search(query: string, options: SearchOptions): Promise<ExplanationEntry[]> {
    const parameters: unknown[] = [`%${escapeLike(query)}%`];
    let where = `text LIKE ? ESCAPE '\\'`;
    if (options.bookHash !== undefined) {
      where += ' AND book_hash = ?';
      parameters.push(options.bookHash);
    }
    return this.list(where, parameters, options);
  }
}
