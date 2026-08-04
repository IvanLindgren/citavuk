import { contentSha } from './content';
import {
  STORE_BOOKS,
  STORE_CONTENT,
  get,
  getAll,
  getAllByIndex,
  put,
  remove,
  tx,
} from './db';
import { splitParagraphs } from './tokenize';

/**
 * Книги браузера.
 *
 * Модель повторяет синхронизацию приложения: у каждой книги глобальный `id`,
 * время последнего изменения и флаг «изменена локально». Удаление оставляет
 * надгробие, а не стирает запись, — иначе другое устройство, у которого книга
 * ещё есть, вернуло бы её обратно при следующей отправке, и удаление никогда бы
 * не запомнилось.
 */

/** Метаданные книги. Текст лежит отдельно и грузится по требованию. */
export interface BookMeta {
  id: string;
  title: string;
  /** Логический ключ импорта: имя файла или адрес статьи. */
  sourceKey: string;
  folder: string;
  paragraphCount: number;
  /** Индекс абзаца, на котором читатель остановился. */
  lastParagraph: number;
  /** Адрес текста на сервере. Пусто — текст ещё не выгружен. */
  contentSha: string;
  /** Метаданные пришли с другого устройства, а текст ещё не скачан. */
  textMissing: boolean;
  addedAt: number;
  updatedAt: number;
  /** Запись изменена локально и ждёт отправки. */
  dirty: 0 | 1;
  deleted: 0 | 1;
}

interface ContentRow {
  id: string;
  paragraphs: string[];
}

function now(): number {
  return Date.now();
}

/**
 * Список книг для главной — без текста.
 *
 * Тот же инвариант, что в приложении: обзорный запрос не тянет в память текст
 * каждой книги.
 */
export async function listBooks(): Promise<BookMeta[]> {
  const books = await tx(STORE_BOOKS, 'readonly', (transaction) =>
    getAll<BookMeta>(transaction, STORE_BOOKS),
  );
  return books
    .filter((book) => !book.deleted)
    .sort((a, b) => b.addedAt - a.addedAt);
}

export async function getBook(id: string): Promise<BookMeta | null> {
  const book = await tx(STORE_BOOKS, 'readonly', (transaction) =>
    get<BookMeta>(transaction, STORE_BOOKS, id),
  );
  return book && !book.deleted ? book : null;
}

export async function getParagraphs(id: string): Promise<string[]> {
  const row = await tx(STORE_CONTENT, 'readonly', (transaction) =>
    get<ContentRow>(transaction, STORE_CONTENT, id),
  );
  return row?.paragraphs ?? [];
}

/** Сохраняет книгу целиком: метаданные и текст. */
export async function saveBook(
  meta: BookMeta,
  paragraphs: string[] | null,
): Promise<void> {
  await tx([STORE_BOOKS, STORE_CONTENT], 'readwrite', async (transaction) => {
    await put(transaction, STORE_BOOKS, meta);
    if (paragraphs) {
      await put(transaction, STORE_CONTENT, { id: meta.id, paragraphs });
    }
  });
}

/** Сохраняет только метаданные, не трогая текст. */
export async function saveMeta(meta: BookMeta): Promise<void> {
  await tx(STORE_BOOKS, 'readwrite', (transaction) =>
    put(transaction, STORE_BOOKS, meta),
  );
}

/** Создаёт книгу из обычного текста и сразу считает адрес её содержимого. */
export async function importText(
  title: string,
  text: string,
  sourceKey = '',
): Promise<BookMeta> {
  return importParagraphs(title, splitParagraphs(text), sourceKey);
}

/**
 * Создаёт книгу из готовых абзацев.
 *
 * Нужен размеченным источникам: у DOCX и веб-страницы абзацы уже известны и
 * среди них есть картинки и таблицы, а склейка в текст и обратный разбор
 * потеряла бы и то и другое.
 */
export async function importParagraphs(
  title: string,
  paragraphs: string[],
  sourceKey = '',
): Promise<BookMeta> {
  if (paragraphs.length === 0) {
    throw new Error('В файле не нашлось текста.');
  }

  const meta: BookMeta = {
    id: crypto.randomUUID(),
    title: title.trim() || 'Без названия',
    sourceKey: sourceKey || title,
    folder: '',
    paragraphCount: paragraphs.length,
    lastParagraph: 0,
    // Адрес считается сразу: он не зависит от сети и позволяет синхронизации
    // сравнить книгу с серверной, ещё не выходя в интернет.
    contentSha: await contentSha(paragraphs),
    textMissing: false,
    addedAt: now(),
    updatedAt: now(),
    dirty: 1,
    deleted: 0,
  };

  await saveBook(meta, paragraphs);
  return meta;
}

/** Запоминает место остановки. */
export async function saveProgress(id: string, lastParagraph: number): Promise<void> {
  const book = await getBook(id);
  if (!book || book.lastParagraph === lastParagraph) return;
  await saveMeta({ ...book, lastParagraph, updatedAt: now(), dirty: 1 });
}

export async function renameBook(id: string, title: string): Promise<void> {
  const book = await getBook(id);
  if (!book) return;
  await saveMeta({ ...book, title: title.trim(), updatedAt: now(), dirty: 1 });
}

/**
 * Удаляет книгу.
 *
 * Метаданные остаются надгробием до отправки на сервер, а тяжёлый текст
 * стирается сразу: надгробие занимает считаные байты.
 */
export async function deleteBook(id: string): Promise<void> {
  const book = await getBook(id);
  if (!book) return;

  await tx([STORE_BOOKS, STORE_CONTENT], 'readwrite', async (transaction) => {
    await put(transaction, STORE_BOOKS, {
      ...book,
      deleted: 1,
      dirty: 1,
      updatedAt: now(),
      paragraphCount: 0,
    });
    await remove(transaction, STORE_CONTENT, id);
  });
}

/** Книги, ждущие отправки на сервер. */
export async function dirtyBooks(limit = 150): Promise<BookMeta[]> {
  return tx(STORE_BOOKS, 'readonly', (transaction) =>
    getAllByIndex<BookMeta>(transaction, STORE_BOOKS, 'dirty', 1, limit),
  );
}

/** Снимает пометку после подтверждения сервером. */
export async function clearDirty(sent: BookMeta[]): Promise<void> {
  if (sent.length === 0) return;
  await tx(STORE_BOOKS, 'readwrite', async (transaction) => {
    for (const snapshot of sent) {
      const book = await get<BookMeta>(transaction, STORE_BOOKS, snapshot.id);
      // Книга могла измениться снова, пока шёл запрос: тогда пометку снимать
      // нельзя, иначе правка потеряется.
      if (book?.dirty && book.updatedAt === snapshot.updatedAt) {
        await put(transaction, STORE_BOOKS, { ...book, dirty: 0 });
      }
    }
  });
}

/** Все книги, включая надгробия, — нужны синхронизации. */
export async function allBooks(): Promise<BookMeta[]> {
  return tx(STORE_BOOKS, 'readonly', (transaction) =>
    getAll<BookMeta>(transaction, STORE_BOOKS),
  );
}

/** Книги с текстом, который ещё не выгружен на сервер. */
export async function booksWithLocalText(limit = 20): Promise<BookMeta[]> {
  const books = await allBooks();
  return books
    .filter((book) => !book.deleted && !book.textMissing && book.paragraphCount > 0)
    .slice(0, limit);
}

/** Убирает надгробия, уже принятые сервером: они не нужны вечно. */
export async function purgeTombstones(olderThanMs = 90 * 86_400_000): Promise<void> {
  const cutoff = now() - olderThanMs;
  const books = await allBooks();
  const stale = books.filter(
    (book) => book.deleted && !book.dirty && book.updatedAt < cutoff,
  );
  if (stale.length === 0) return;

  await tx(STORE_BOOKS, 'readwrite', async (transaction) => {
    for (const book of stale) await remove(transaction, STORE_BOOKS, book.id);
  });
}

/** Примерное время чтения: 180 слов в минуту — темп чтения на чужом языке. */
export function readingMinutes(paragraphCount: number): number {
  return Math.max(1, Math.round((paragraphCount * 45) / 180));
}

/**
 * Согласование числительного с существительным.
 *
 * Русский требует три формы, и «1 книг» или «3 книга» в интерфейсе сразу
 * читаются как небрежность.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
