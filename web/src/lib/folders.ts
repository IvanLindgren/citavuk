import { getBook, saveMeta, type BookMeta } from './books';

/**
 * Папки библиотеки.
 *
 * Папка — это не отдельная сущность, а поле `folder` у книги. Так сделано
 * потому, что именно это поле уже ходит по сети: сервер принимает и отдаёт его
 * с самого первого выпуска (`books.folder` в 0001_init.sql), и раскладка по
 * папкам синхронизируется между браузером, телефоном и компьютером сама, без
 * новой таблицы, миграции и версии протокола.
 *
 * Обратная сторона: пустая папка хранить негде — не в чем. Пока в неё не
 * положили ни одной книги, она живёт только в этом браузере (см. `draftFolders`)
 * и на другие устройства не уезжает. Это честнее, чем показывать её везде и
 * терять при первой же чистке.
 */

const DRAFTS_KEY = 'citavuk-empty-folders';

/** Книги без папки показываются в этом псевдоразделе. */
export const ROOT_FOLDER = '';

export interface FolderSummary {
  name: string;
  count: number;
  /** Папка ещё пуста и существует только здесь. */
  draft: boolean;
}

/**
 * Приводит имя папки к хранимому виду.
 *
 * Пробелы по краям и внутренние повторы схлопываются: «Учёба » и «Учёба» — одна
 * и та же папка для человека, и они обязаны быть одной и для программы, иначе в
 * списке появятся две строки с одинаковой на вид подписью.
 */
export function normalizeFolder(name: string): string {
  return name.replace(/\s+/gu, ' ').trim().slice(0, 60);
}

function readDrafts(): string[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function writeDrafts(names: string[]): void {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(names));
  } catch {
    // Приватный режим: папка проживёт до перезагрузки вкладки.
  }
}

export function addDraftFolder(name: string): void {
  const clean = normalizeFolder(name);
  if (!clean) return;
  const drafts = readDrafts();
  if (drafts.includes(clean)) return;
  writeDrafts([...drafts, clean]);
}

export function forgetDraftFolder(name: string): void {
  writeDrafts(readDrafts().filter((value) => value !== name));
}

/**
 * Список папок по книгам.
 *
 * Порядок — по алфавиту, а не по числу книг: список папок человек читает
 * глазами и ищет знакомое название, а перестановка строк между заходами делает
 * это невозможным.
 */
export function foldersOf(books: BookMeta[]): FolderSummary[] {
  const counts = new Map<string, number>();
  for (const book of books) {
    if (!book.folder) continue;
    counts.set(book.folder, (counts.get(book.folder) ?? 0) + 1);
  }

  for (const draft of readDrafts()) {
    if (!counts.has(draft)) counts.set(draft, 0);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, draft: count === 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export function countWithoutFolder(books: BookMeta[]): number {
  return books.filter((book) => !book.folder).length;
}

/** Перекладывает книгу в папку. Пустое имя означает «вынуть из папки». */
export async function moveToFolder(id: string, folder: string): Promise<void> {
  const book = await getBook(id);
  if (!book) return;
  const clean = normalizeFolder(folder);
  if (book.folder === clean) return;

  await saveMeta({ ...book, folder: clean, updatedAt: Date.now(), dirty: 1 });
  // Как только в папке появилась книга, черновая запись не нужна: папка теперь
  // существует в синхронизируемых данных.
  if (clean) forgetDraftFolder(clean);
}

/** Переименовывает папку сразу у всех её книг. */
export async function renameFolder(
  books: BookMeta[],
  from: string,
  to: string,
): Promise<void> {
  const clean = normalizeFolder(to);
  if (!clean || clean === from) return;

  const now = Date.now();
  for (const book of books) {
    if (book.folder !== from) continue;
    await saveMeta({ ...book, folder: clean, updatedAt: now, dirty: 1 });
  }
  forgetDraftFolder(from);
  if (!books.some((book) => book.folder === from)) addDraftFolder(clean);
}

/**
 * Убирает папку, оставляя книги.
 *
 * Удалять вместе с содержимым нельзя: «удалить папку» и «удалить десять книг» —
 * разные намерения, а отменить второе будет уже нечем.
 */
export async function dissolveFolder(
  books: BookMeta[],
  name: string,
): Promise<void> {
  const now = Date.now();
  for (const book of books) {
    if (book.folder !== name) continue;
    await saveMeta({ ...book, folder: '', updatedAt: now, dirty: 1 });
  }
  forgetDraftFolder(name);
}
