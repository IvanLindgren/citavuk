import {
  STORE_REVIEWS,
  STORE_VOCABULARY,
  get,
  getAll,
  getAllByIndex,
  put,
  tx,
} from './db';

export interface VocabEntry {
  id: string;
  bookId: string | null;
  word: string;
  lemma: string;
  pos: string;
  translation: string;
  forms: Record<string, unknown>;
  deleted: 0 | 1;
  updatedAt: number;
  dirty: 0 | 1;
}

export interface Review {
  vocabId: string;
  ease: number;
  intervalDays: number;
  reps: number;
  dueAt: number;
  lastReviewed: number | null;
  deleted: 0 | 1;
  updatedAt: number;
  dirty: 0 | 1;
}

/** Context saved with a word by the reader, roadmap or another study view. */
export function vocabularyContext(entry: Pick<VocabEntry, 'forms'>): string {
  const value = entry.forms['контекст'] ?? entry.forms['пример'];
  return typeof value === 'string' ? value.trim() : '';
}

export async function saveVocabularyWord(input: {
  bookId?: string | null;
  word: string;
  lemma?: string;
  pos?: string;
  translation: string;
  forms?: Record<string, unknown>;
}): Promise<VocabEntry> {
  const normalized = input.word.trim().toLocaleLowerCase('sr');
  const all = await allVocabulary();
  const existing = all.find(
    (entry) =>
      !entry.deleted &&
      entry.bookId === (input.bookId ?? null) &&
      entry.word.trim().toLocaleLowerCase('sr') === normalized,
  );
  if (existing) return existing;

  const now = Date.now();
  const entry: VocabEntry = {
    id: crypto.randomUUID(),
    bookId: input.bookId ?? null,
    word: input.word.trim(),
    lemma: input.lemma?.trim() || normalized,
    pos: input.pos?.trim() || 'UNKNOWN',
    translation: input.translation.trim(),
    forms: input.forms ?? {},
    deleted: 0,
    updatedAt: now,
    dirty: 1,
  };
  const review: Review = {
    vocabId: entry.id,
    ease: 2.5,
    intervalDays: 0,
    reps: 0,
    dueAt: now,
    lastReviewed: null,
    deleted: 0,
    updatedAt: now,
    dirty: 1,
  };
  await tx([STORE_VOCABULARY, STORE_REVIEWS], 'readwrite', async (transaction) => {
    await put(transaction, STORE_VOCABULARY, entry);
    await put(transaction, STORE_REVIEWS, review);
  });
  window.dispatchEvent(new CustomEvent('citavuk-vocabulary-change'));
  return entry;
}

/** Сохраняет карточку после оценки. */
export async function saveReview(review: Review): Promise<void> {
  await tx(STORE_REVIEWS, 'readwrite', (transaction) =>
    put(transaction, STORE_REVIEWS, review),
  );
}

/**
 * Убирает слово из словаря.
 *
 * Запись остаётся надгробием — с `deleted: 1` и пометкой к отправке. Стереть её
 * сразу значило бы получить слово обратно при следующей синхронизации: другое
 * устройство, у которого оно ещё есть, прислало бы его как новое.
 */
export async function deleteVocabularyWord(id: string): Promise<void> {
  const now = Date.now();
  await tx([STORE_VOCABULARY, STORE_REVIEWS], 'readwrite', async (transaction) => {
    const entry = await get<VocabEntry>(transaction, STORE_VOCABULARY, id);
    if (!entry) return;
    await put(transaction, STORE_VOCABULARY, {
      ...entry,
      deleted: 1,
      dirty: 1,
      updatedAt: now,
    });
    const review = await get<Review>(transaction, STORE_REVIEWS, id);
    if (review) {
      await put(transaction, STORE_REVIEWS, {
        ...review,
        deleted: 1,
        dirty: 1,
        updatedAt: now,
      });
    }
  });
  window.dispatchEvent(new CustomEvent('citavuk-vocabulary-change'));
}

export async function allVocabulary(): Promise<VocabEntry[]> {
  return tx(STORE_VOCABULARY, 'readonly', (transaction) =>
    getAll<VocabEntry>(transaction, STORE_VOCABULARY),
  );
}

export async function allReviews(): Promise<Review[]> {
  return tx(STORE_REVIEWS, 'readonly', (transaction) =>
    getAll<Review>(transaction, STORE_REVIEWS),
  );
}

export async function dirtyVocabulary(limit = 200): Promise<VocabEntry[]> {
  return tx(STORE_VOCABULARY, 'readonly', (transaction) =>
    getAllByIndex<VocabEntry>(transaction, STORE_VOCABULARY, 'dirty', 1, limit),
  );
}

export async function dirtyReviews(limit = 150): Promise<Review[]> {
  return tx(STORE_REVIEWS, 'readonly', (transaction) =>
    getAllByIndex<Review>(transaction, STORE_REVIEWS, 'dirty', 1, limit),
  );
}

export async function clearVocabularyDirty(sent: VocabEntry[]): Promise<void> {
  await tx(STORE_VOCABULARY, 'readwrite', async (transaction) => {
    for (const snapshot of sent) {
      const current = await get<VocabEntry>(
        transaction,
        STORE_VOCABULARY,
        snapshot.id,
      );
      if (current?.dirty && current.updatedAt === snapshot.updatedAt) {
        await put(transaction, STORE_VOCABULARY, { ...current, dirty: 0 });
      }
    }
  });
}

export async function clearReviewDirty(sent: Review[]): Promise<void> {
  await tx(STORE_REVIEWS, 'readwrite', async (transaction) => {
    for (const snapshot of sent) {
      const current = await get<Review>(transaction, STORE_REVIEWS, snapshot.vocabId);
      if (current?.dirty && current.updatedAt === snapshot.updatedAt) {
        await put(transaction, STORE_REVIEWS, { ...current, dirty: 0 });
      }
    }
  });
}

export async function applyRemoteVocabulary(entry: VocabEntry): Promise<boolean> {
  return tx(STORE_VOCABULARY, 'readwrite', async (transaction) => {
    const current = await get<VocabEntry>(transaction, STORE_VOCABULARY, entry.id);
    if (current && current.updatedAt > entry.updatedAt) return false;
    if (!current && entry.deleted) return false;
    await put(transaction, STORE_VOCABULARY, { ...entry, dirty: 0 });
    return true;
  });
}

export async function applyRemoteReview(review: Review): Promise<boolean> {
  return tx(STORE_REVIEWS, 'readwrite', async (transaction) => {
    const current = await get<Review>(transaction, STORE_REVIEWS, review.vocabId);
    if (current && current.updatedAt > review.updatedAt) return false;
    await put(transaction, STORE_REVIEWS, { ...review, dirty: 0 });
    return true;
  });
}

export async function markAllStudyDataDirty(): Promise<void> {
  const [vocabulary, reviews] = await Promise.all([allVocabulary(), allReviews()]);
  await tx([STORE_VOCABULARY, STORE_REVIEWS], 'readwrite', async (transaction) => {
    for (const entry of vocabulary) {
      await put(transaction, STORE_VOCABULARY, { ...entry, dirty: 1 });
    }
    for (const review of reviews) {
      await put(transaction, STORE_REVIEWS, { ...review, dirty: 1 });
    }
  });
}
