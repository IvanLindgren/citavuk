import {
  allBooks,
  booksWithLocalText,
  clearDirty,
  dirtyBooks,
  getParagraphs,
  purgeTombstones,
  saveBook,
  saveMeta,
  type BookMeta,
} from '../lib/books';
import { contentSha } from '../lib/content';
import { getMeta, setMeta } from '../lib/db';
import {
  applyRemotePalace,
  clearPalaceDirty,
  dirtyPalaces,
  markPalacesDirty,
  purgePalaceTombstones,
  type Palace,
} from '../lib/palace';
import {
  applyRemoteReview,
  applyRemoteVocabulary,
  clearReviewDirty,
  clearVocabularyDirty,
  dirtyReviews,
  dirtyVocabulary,
  markAllStudyDataDirty,
  type Review,
  type VocabEntry,
} from '../lib/vocabulary';
import { ApiError, request } from './client';

/**
 * Синхронизация книг между браузером и другими устройствами.
 *
 * Порядок один и тот же на всех клиентах: отправить своё, забрать чужое,
 * догрузить недостающие тексты. У каждой записи глобальный `id` и время
 * изменения; конфликты решаются по времени — побеждает более позднее.
 *
 * Текст книг синхронизируется отдельно и по требованию: метаданные весят байты,
 * а текст — мегабайты, и тянуть его при каждом обновлении списка нельзя.
 */

const CURSOR_KEY = 'sync-cursor';
const USER_KEY = 'sync-user';
const LAST_SYNC_KEY = 'sync-last';

/** Максимум записей в одной посылке. Совпадает с ограничением сервера. */
const PAGE_SIZE = 500;

interface RemoteBook {
  id: string;
  title: string;
  folder: string;
  sourceKey: string;
  paraCount: number;
  lastPara: number;
  contentSha: string;
  deleted: boolean;
  updatedAt: string;
  rev: number;
}

interface PullResponse {
  books: RemoteBook[] | null;
  vocabulary: RemoteVocabulary[] | null;
  reviews: RemoteReview[] | null;
  palaces: RemotePalace[] | null;
  rev: number;
  hasMore: boolean;
}

interface RemotePalace {
  id: string;
  name: string;
  sceneId: string;
  pins: Record<string, { word: string; translation: string; vocabId: string }> | null;
  deleted: boolean;
  updatedAt: string;
}

interface RemoteVocabulary {
  id: string;
  bookId: string | null;
  word: string;
  lemma: string;
  pos: string;
  translation: string;
  forms: Record<string, unknown> | null;
  deleted: boolean;
  updatedAt: string;
}

interface RemoteReview {
  vocabId: string;
  ease: number;
  intervalDays: number;
  reps: number;
  dueAt: number;
  lastReviewed: number | null;
  deleted: boolean;
  updatedAt: string;
}

export interface SyncReport {
  sent: number;
  received: number;
  uploaded: number;
}

function toRemote(book: BookMeta): Record<string, unknown> {
  return {
    id: book.id,
    title: book.title,
    folder: book.folder,
    sourceKey: book.sourceKey,
    paraCount: book.paragraphCount,
    lastPara: book.lastParagraph,
    contentSha: book.contentSha,
    deleted: book.deleted === 1,
    updatedAt: new Date(book.updatedAt).toISOString(),
  };
}

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Полный цикл синхронизации. */
export async function runSync(): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, received: 0, uploaded: 0 };

  report.sent = await pushChanges();
  report.received = await pullChanges();
  report.uploaded = await uploadMissingContent();

  // Выгруженные тексты меняют адреса книг — их нужно донести до сервера,
  // иначе другое устройство не узнает, что текст появился.
  if (report.uploaded > 0) report.sent += await pushChanges();

  await setMeta(LAST_SYNC_KEY, Date.now());
  await purgeTombstones();
  await purgePalaceTombstones();
  return report;
}

/** Отправляет накопленные изменения страницами. */
async function pushChanges(): Promise<number> {
  let total = 0;

  for (let page = 0; page < 50; page++) {
    const books = await dirtyBooks(150);
    const vocabulary = await dirtyVocabulary(200);
    const reviews = await dirtyReviews(150);
    const palaces = await dirtyPalaces(50);
    if (
      books.length === 0 &&
      vocabulary.length === 0 &&
      reviews.length === 0 &&
      palaces.length === 0
    ) {
      return total;
    }

    await request('/v1/sync/push', {
      method: 'POST',
      body: {
        books: books.map(toRemote),
        vocabulary: vocabulary.map(toRemoteVocabulary),
        reviews: reviews.map(toRemoteReview),
        palaces: palaces.map(toRemotePalace),
      },
    });

    // Пометки снимаются только после подтверждения сервером: снять их раньше
    // значило бы потерять изменения при обрыве связи.
    await clearDirty(books);
    await clearVocabularyDirty(vocabulary);
    await clearReviewDirty(reviews);
    await clearPalaceDirty(palaces);
    total += books.length + vocabulary.length + reviews.length + palaces.length;

    if (
      books.length < 150 &&
      vocabulary.length < 200 &&
      reviews.length < 150 &&
      palaces.length < 50
    ) {
      return total;
    }
  }
  return total;
}

function toRemoteVocabulary(entry: VocabEntry): Record<string, unknown> {
  return {
    id: entry.id,
    bookId: entry.bookId,
    word: entry.word,
    lemma: entry.lemma,
    pos: entry.pos,
    translation: entry.translation,
    forms: entry.forms,
    deleted: entry.deleted === 1,
    updatedAt: new Date(entry.updatedAt).toISOString(),
  };
}

function toRemotePalace(palace: Palace): Record<string, unknown> {
  return {
    id: palace.id,
    name: palace.name,
    sceneId: palace.sceneId,
    // Сервер хранит `vocabId` строкой: отсутствие связи со словарём — это
    // пустая строка, а не null. Указатель ради значения, которое ничего не
    // значит, только добавил бы обеим сторонам проверок.
    pins: Object.fromEntries(
      Object.entries(palace.pins).map(([object, pin]) => [
        object,
        {
          word: pin.word,
          translation: pin.translation,
          vocabId: pin.vocabId ?? '',
        },
      ]),
    ),
    deleted: palace.deleted === 1,
    updatedAt: new Date(palace.updatedAt).toISOString(),
  };
}

function toRemoteReview(review: Review): Record<string, unknown> {
  return {
    vocabId: review.vocabId,
    ease: review.ease,
    intervalDays: review.intervalDays,
    reps: review.reps,
    dueAt: review.dueAt,
    lastReviewed: review.lastReviewed,
    deleted: review.deleted === 1,
    updatedAt: new Date(review.updatedAt).toISOString(),
  };
}

/** Забирает изменения новее курсора. */
async function pullChanges(): Promise<number> {
  let total = 0;

  for (let page = 0; page < 200; page++) {
    const cursor = await getMeta<number>(CURSOR_KEY, 0);
    const response = await request<PullResponse>(
      `/v1/sync/changes?since=${cursor}&limit=${PAGE_SIZE}`,
    );

    for (const remote of response.books ?? []) {
      if (await applyRemoteBook(remote)) total++;
    }
    for (const remote of response.vocabulary ?? []) {
      if (
        await applyRemoteVocabulary({
          id: remote.id,
          bookId: remote.bookId,
          word: remote.word,
          lemma: remote.lemma,
          pos: remote.pos,
          translation: remote.translation,
          forms: remote.forms ?? {},
          deleted: remote.deleted ? 1 : 0,
          updatedAt: parseTime(remote.updatedAt),
          dirty: 0,
        })
      ) {
        total++;
      }
    }
    for (const remote of response.palaces ?? []) {
      if (
        await applyRemotePalace({
          id: remote.id,
          name: remote.name,
          sceneId: remote.sceneId,
          pins: Object.fromEntries(
            Object.entries(remote.pins ?? {}).map(([object, pin]) => [
              object,
              {
                word: pin.word,
                translation: pin.translation,
                vocabId: pin.vocabId || null,
              },
            ]),
          ),
          createdAt: parseTime(remote.updatedAt),
          updatedAt: parseTime(remote.updatedAt),
          deleted: remote.deleted ? 1 : 0,
          dirty: 0,
        })
      ) {
        total++;
      }
    }
    for (const remote of response.reviews ?? []) {
      if (
        await applyRemoteReview({
          vocabId: remote.vocabId,
          ease: remote.ease,
          intervalDays: remote.intervalDays,
          reps: remote.reps,
          dueAt: remote.dueAt,
          lastReviewed: remote.lastReviewed,
          deleted: remote.deleted ? 1 : 0,
          updatedAt: parseTime(remote.updatedAt),
          dirty: 0,
        })
      ) {
        total++;
      }
    }

    const next = response.rev ?? cursor;
    await setMeta(CURSOR_KEY, next);

    if (!response.hasMore) return total;
    // Курсор не сдвинулся, а сервер обещает продолжение — дальше идти некуда,
    // иначе цикл станет бесконечным.
    if (next <= cursor) return total;
  }
  return total;
}

/**
 * Применяет книгу с сервера.
 *
 * Локальная запись обновляется, только если серверная версия не старше её:
 * иначе входящие данные затёрли бы правку, которую устройство ещё не успело
 * отправить.
 */
async function applyRemoteBook(remote: RemoteBook): Promise<boolean> {
  const remoteAt = parseTime(remote.updatedAt);
  const books = await allBooks();
  const existing = books.find((book) => book.id === remote.id);

  if (!existing) {
    // Удалённой книги, которой у нас и не было, заводить незачем.
    if (remote.deleted) return false;

    await saveBook(
      {
        id: remote.id,
        title: remote.title,
        sourceKey: remote.sourceKey,
        folder: remote.folder,
        paragraphCount: remote.paraCount,
        lastParagraph: remote.lastPara,
        contentSha: remote.contentSha,
        // Текст качается при открытии книги, а не сейчас.
        textMissing: remote.contentSha !== '',
        addedAt: remoteAt || Date.now(),
        updatedAt: remoteAt,
        dirty: 0,
        deleted: 0,
      },
      [],
    );
    return true;
  }

  if (existing.updatedAt > remoteAt) return false;

  // Текст перекачивать нужно, только если адрес изменился.
  const textChanged =
    remote.contentSha !== '' && remote.contentSha !== existing.contentSha;

  await saveMeta({
    ...existing,
    title: remote.title,
    sourceKey: remote.sourceKey,
    folder: remote.folder,
    paragraphCount: remote.paraCount,
    lastParagraph: remote.lastPara,
    contentSha: remote.contentSha || existing.contentSha,
    textMissing: textChanged ? true : existing.textMissing,
    updatedAt: remoteAt,
    dirty: 0,
    deleted: remote.deleted ? 1 : 0,
  });
  return true;
}

/** Выгружает тексты книг, которых ещё нет на сервере. */
async function uploadMissingContent(): Promise<number> {
  const candidates = await booksWithLocalText(20);
  if (candidates.length === 0) return 0;

  const shas = candidates.map((book) => book.contentSha).filter(Boolean);
  if (shas.length === 0) return 0;

  // Один запрос вместо проверки по книге: тексты весят мегабайты, и выгружать
  // уже имеющееся — впустую потраченный трафик пользователя.
  const { present } = await request<{ present: Record<string, boolean> }>(
    '/v1/sync/content/check',
    { method: 'POST', body: { shas } },
  );

  let uploaded = 0;
  for (const book of candidates) {
    if (!book.contentSha || present[book.contentSha]) continue;

    const paragraphs = await getParagraphs(book.id);
    if (paragraphs.length === 0) continue;

    try {
      await request(`/v1/sync/content/${book.contentSha}`, {
        method: 'PUT',
        body: paragraphs,
        // Выгрузка книги на медленной сети идёт заметно дольше обычного запроса.
        timeoutMs: 180_000,
      });
      uploaded++;
    } catch (error) {
      // Книга больше допустимого размера — помечаем, чтобы не пытаться
      // выгружать её при каждой синхронизации.
      if (error instanceof ApiError && error.status === 413) {
        await saveMeta({ ...book, contentSha: '', dirty: 0 });
        continue;
      }
      throw error;
    }
  }
  return uploaded;
}

/**
 * Скачивает текст книги, пришедшей с другого устройства.
 *
 * Вызывается при открытии книги, а не при синхронизации: тексты весят
 * мегабайты, и качать все сразу означало бы долгий старт и лишний трафик.
 */
export async function downloadContent(book: BookMeta): Promise<string[] | null> {
  if (!book.contentSha) return null;

  try {
    const paragraphs = await request<string[]>(
      `/v1/sync/content/${book.contentSha}`,
      { timeoutMs: 120_000 },
    );
    if (!Array.isArray(paragraphs)) return null;

    // Адрес проверяется на месте: скачанный текст обязан соответствовать тому,
    // за чем мы шли. Иначе книга молча подменилась бы.
    if ((await contentSha(paragraphs)) !== book.contentSha) return null;

    await saveBook(
      {
        ...book,
        paragraphCount: paragraphs.length,
        textMissing: false,
      },
      paragraphs,
    );
    return paragraphs;
  } catch {
    return null;
  }
}

/** Число записей, ждущих отправки. */
export async function pendingCount(): Promise<number> {
  const [books, vocabulary, reviews, palaces] = await Promise.all([
    dirtyBooks(1000),
    dirtyVocabulary(1000),
    dirtyReviews(1000),
    dirtyPalaces(1000),
  ]);
  return books.length + vocabulary.length + reviews.length + palaces.length;
}

export async function lastSyncAt(): Promise<number> {
  return getMeta<number>(LAST_SYNC_KEY, 0);
}

/**
 * Сбрасывает синхронизацию при смене аккаунта.
 *
 * Курсор обнуляется, а всё локальное помечается к отправке: иначе книги двух
 * пользователей перемешались бы в одной библиотеке.
 */
export async function resetForAccount(userId: string): Promise<void> {
  const previous = await getMeta<string>(USER_KEY, '');
  if (previous === userId) return;

  await setMeta(USER_KEY, userId);
  await setMeta(CURSOR_KEY, 0);

  const books = await allBooks();
  for (const book of books) {
    await saveMeta({ ...book, dirty: 1 });
  }
  await markAllStudyDataDirty();
  await markPalacesDirty();
}
