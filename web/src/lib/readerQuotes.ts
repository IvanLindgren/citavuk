import { STORE_QUOTES, get, getAllByIndex, put, tx } from './db';

/** Цвет выделения; пусто — подчёркивание, как было до цветов. */
export type QuoteColor = '' | 'red' | 'yellow' | 'green' | 'blue' | 'purple';

export const QUOTE_COLORS: { key: Exclude<QuoteColor, ''>; label: string }[] = [
  { key: 'yellow', label: 'Жёлтый' },
  { key: 'green', label: 'Зелёный' },
  { key: 'blue', label: 'Синий' },
  { key: 'purple', label: 'Фиолетовый' },
  { key: 'red', label: 'Красный' },
];

export function quoteColor(value: unknown): QuoteColor {
  return value === 'red' || value === 'yellow' || value === 'green' || value === 'blue' || value === 'purple' ? value : '';
}

export interface ReaderQuote {
  id: string;
  bookId: string;
  page: number;
  paragraph: number;
  start: number;
  end: number;
  text: string;
  /** Старые записи из IndexedDB поля не имеют — читать через quoteColor(). */
  color?: QuoteColor;
  deleted: 0 | 1;
  dirty: 0 | 1;
  updatedAt: number;
}

export function listReaderQuotes(bookId: string): Promise<ReaderQuote[]> {
  return tx(STORE_QUOTES, 'readonly', transaction =>
    getAllByIndex<ReaderQuote>(transaction, STORE_QUOTES, 'bookId', bookId)).then(items => items.filter(item => !item.deleted));
}

export async function saveReaderQuote(quote: Omit<ReaderQuote, 'id' | 'deleted' | 'dirty' | 'updatedAt'>): Promise<ReaderQuote> {
  const item: ReaderQuote = { ...quote, id: crypto.randomUUID(), deleted: 0, dirty: 1, updatedAt: Date.now() };
  await tx(STORE_QUOTES, 'readwrite', transaction => put(transaction, STORE_QUOTES, item));
  return item;
}

/** Смена цвета: то же выделение, новая отметка времени для синхронизации. */
export function recolorReaderQuote(id: string, color: QuoteColor): Promise<ReaderQuote | null> {
  return tx(STORE_QUOTES, 'readwrite', async transaction => {
    const item = await get<ReaderQuote>(transaction, STORE_QUOTES, id);
    if (!item) return null;
    const next: ReaderQuote = { ...item, color, dirty: 1, updatedAt: Date.now() };
    await put(transaction, STORE_QUOTES, next);
    return next;
  });
}

export function deleteReaderQuote(id: string): Promise<unknown> {
  return tx(STORE_QUOTES, 'readwrite', async transaction => {
    const item = await get<ReaderQuote>(transaction, STORE_QUOTES, id);
    if (item) await put(transaction, STORE_QUOTES, { ...item, deleted: 1, dirty: 1, updatedAt: Date.now() });
  });
}

export function dirtyReaderQuotes(limit = 50): Promise<ReaderQuote[]> {
  return tx(STORE_QUOTES, 'readonly', transaction => getAllByIndex<ReaderQuote>(transaction, STORE_QUOTES, 'dirty', 1, limit));
}

export function clearReaderQuoteDirty(items: ReaderQuote[]): Promise<void> {
  return tx(STORE_QUOTES, 'readwrite', async transaction => {
    for (const snapshot of items) {
      const current = await get<ReaderQuote>(transaction, STORE_QUOTES, snapshot.id);
      if (current?.updatedAt === snapshot.updatedAt && current.dirty) {
        await put(transaction, STORE_QUOTES, { ...current, dirty: 0 });
      }
    }
  });
}

export function applyRemoteReaderQuote(remote: ReaderQuote): Promise<boolean> {
  return tx(STORE_QUOTES, 'readwrite', async transaction => {
    const current = await get<ReaderQuote>(transaction, STORE_QUOTES, remote.id);
    if (current && current.updatedAt > remote.updatedAt) return false;
    await put(transaction, STORE_QUOTES, { ...remote, dirty: 0 });
    return true;
  });
}
