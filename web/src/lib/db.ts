/**
 * Локальное хранилище браузера на IndexedDB.
 *
 * localStorage для книг не годится: он ограничен примерно пятью мегабайтами,
 * хранит только строки и работает синхронно — разбор мегабайтного текста в нём
 * подвешивал бы вкладку. IndexedDB асинхронна, хранит объекты как есть и по
 * объёму ограничена долей свободного места на диске.
 *
 * Метаданные и текст книг лежат в разных хранилищах. Это тот же принцип, из-за
 * которого главный экран приложения не читает колонку с текстом: список книг
 * должен открываться, не вытаскивая в память сами книги.
 */

const DB_PREFIX = 'citavuk';
// Прежняя общая БД остаётся гостевой: старые книги видны после выхода, но
// больше никогда не отправляются в учётную запись автоматически.
const GUEST_DB_NAME = DB_PREFIX;
const DB_VERSION = 4;

export const STORE_BOOKS = 'books';
export const STORE_CONTENT = 'content';
export const STORE_META = 'meta';
export const STORE_VOCABULARY = 'vocabulary';
export const STORE_REVIEWS = 'reviews';
export const STORE_PALACES = 'palaces';

let connection: Promise<IDBDatabase> | null = null;
let activeName = GUEST_DB_NAME;

function openNamed(name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const upgrade = request.transaction;
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        const books = db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        books.createIndex('dirty', 'dirty');
      }
      if (!db.objectStoreNames.contains(STORE_CONTENT)) db.createObjectStore(STORE_CONTENT, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORE_VOCABULARY)) {
        const vocabulary = db.createObjectStore(STORE_VOCABULARY, { keyPath: 'id' });
        vocabulary.createIndex('dirty', 'dirty');
        vocabulary.createIndex('word', 'word');
      }
      if (!db.objectStoreNames.contains(STORE_REVIEWS)) {
        const reviews = db.createObjectStore(STORE_REVIEWS, { keyPath: 'vocabId' });
        reviews.createIndex('dirty', 'dirty');
      }
      if (!db.objectStoreNames.contains(STORE_PALACES)) {
        const palaces = db.createObjectStore(STORE_PALACES, { keyPath: 'id' });
        palaces.createIndex('dirty', 'dirty');
      } else if (upgrade) {
        const palaces = upgrade.objectStore(STORE_PALACES);
        if (!palaces.indexNames.contains('dirty')) {
          palaces.createIndex('dirty', 'dirty');
          const cursorRequest = palaces.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const value = cursor.value as Record<string, unknown>;
            cursor.update({ ...value, deleted: value.deleted ?? 0, dirty: 1 });
            cursor.continue();
          };
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        if (activeName === name) connection = null;
      };
      db.onclose = () => { if (activeName === name) connection = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть хранилище браузера.'));
    request.onblocked = () => reject(new Error('Хранилище занято другой вкладкой Читавука.'));
  });
}

function open(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = openNamed(activeName);

  // Неудачную попытку не кешируем: следующий вызов должен попробовать снова.
  connection.catch(() => {
    connection = null;
  });

  return connection;
}

/** Переключает все локальные данные на отдельное хранилище аккаунта. */
export async function activateAccountStorage(userId: string): Promise<void> {
  const next = `${DB_PREFIX}-user-${encodeURIComponent(userId)}`;
  if (next === activeName) return;
  const current = connection;
  connection = null;
  if (current) (await current).close();
  activeName = next;
  await open();
}

/** Гостевая библиотека никогда не смешивается с библиотекой аккаунта. */
/** Имя активного хранилища (гостевое или `citavuk-user-<id>`).
 *
 * Отложенные операции фиксируют его при вызове и сверяются перед записью:
 * смена аккаунта посреди ожидания не должна писать чужому пользователю. */
export function activeStorageName(): string {
  return activeName;
}

export async function activateGuestStorage(): Promise<void> {
  if (activeName === GUEST_DB_NAME) return;
  const current = connection;
  connection = null;
  if (current) (await current).close();
  activeName = GUEST_DB_NAME;
  await open();
}

/** Оборачивает запрос IndexedDB в промис. */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Ошибка хранилища.'));
  });
}

/**
 * Выполняет операции в одной транзакции.
 *
 * Транзакция IndexedDB закрывается сама, как только очередь её запросов
 * опустеет. Поэтому внутри `run` нельзя ждать ничего постороннего — например,
 * сетевого ответа: к моменту продолжения транзакция уже будет мертва.
 */
export async function tx<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await open();
  const transaction = db.transaction(stores, mode);

  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Транзакция не завершилась.'));
    transaction.onabort = () => {
      // Самая частая причина отмены — нехватка места на диске.
      const error = transaction.error;
      reject(
        error?.name === 'QuotaExceededError'
          ? new Error('В браузере закончилось место. Удалите часть книг.')
          : (error ?? new Error('Транзакция отменена.')),
      );
    };
  });

  const result = await run(transaction);
  await done;
  return result;
}

export function get<T>(transaction: IDBTransaction, store: string, key: IDBValidKey) {
  return promisify<T | undefined>(
    transaction.objectStore(store).get(key) as IDBRequest<T | undefined>,
  );
}

export function put(transaction: IDBTransaction, store: string, value: unknown) {
  return promisify(transaction.objectStore(store).put(value));
}

export function remove(transaction: IDBTransaction, store: string, key: IDBValidKey) {
  return promisify(transaction.objectStore(store).delete(key));
}

export function getAll<T>(
  transaction: IDBTransaction,
  store: string,
  query?: IDBKeyRange | IDBValidKey,
  count?: number,
) {
  return promisify<T[]>(
    transaction.objectStore(store).getAll(query, count) as IDBRequest<T[]>,
  );
}

/** Все записи по значению индекса — например, все изменённые книги. */
export function getAllByIndex<T>(
  transaction: IDBTransaction,
  store: string,
  index: string,
  query: IDBValidKey | IDBKeyRange,
  count?: number,
) {
  return promisify<T[]>(
    transaction.objectStore(store).index(index).getAll(query, count) as IDBRequest<T[]>,
  );
}

/** Значение из хранилища настроек синхронизации. */
export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  try {
    return await tx(STORE_META, 'readonly', async (transaction) => {
      const row = await get<{ key: string; value: T }>(transaction, STORE_META, key);
      return row?.value ?? fallback;
    });
  } catch {
    return fallback;
  }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await tx(STORE_META, 'readwrite', (transaction) =>
    put(transaction, STORE_META, { key, value }),
  );
}

/**
 * Доступна ли IndexedDB. В приватном режиме некоторых браузеров её нет, и
 * интерфейс должен сказать об этом внятно, а не падать при первом сохранении.
 */
export async function storageAvailable(): Promise<boolean> {
  try {
    await open();
    return true;
  } catch {
    return false;
  }
}
