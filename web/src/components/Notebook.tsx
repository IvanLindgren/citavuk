import { useEffect, useMemo, useState } from 'react';
import { LuBookOpen } from 'react-icons/lu';

import { Button, Spinner } from './ui';
import { dueLabel, dueReviews, mastery } from '../lib/srs';
import { allReviews, allVocabulary, type Review, type VocabEntry } from '../lib/vocabulary';
import { GARDEN } from '../garden/strings';
import { useRouter } from '../lib/router';

interface Row {
  entry: VocabEntry;
  review?: Review;
}

/**
 * Тетрадь на столе.
 *
 * Слова здесь не заводятся — они приходят из читалки и карточек. Смысл тетради
 * в том, чтобы в доме было видно, ради чего растёт сад: вот они, слова, и вот
 * сколько из них уже держатся в голове.
 */
export function Notebook() {
  const { navigate } = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const now = Date.now();

  useEffect(() => {
    let alive = true;
    void Promise.all([allVocabulary(), allReviews()])
      .then(([vocabulary, reviews]) => {
        if (!alive) return;
        const byId = new Map(reviews.map((review) => [review.vocabId, review]));
        setRows(
          vocabulary
            .filter((entry) => !entry.deleted)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((entry) => ({ entry, review: byId.get(entry.id) })),
        );
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, []);

  const learned = useMemo(
    () => (rows ?? []).filter((row) => row.review && mastery(row.review) >= 0.5).length,
    [rows],
  );
  const due = useMemo(
    () =>
      dueReviews(
        (rows ?? []).map((row) => row.review).filter(Boolean) as Review[],
        now,
      ).length,
    [now, rows],
  );

  if (!rows) {
    return (
      <div className="grid place-items-center py-8">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div>
        <p className="leading-7">
          Тетрадь пока пустая. Слова попадают сюда из читалки: нажми на незнакомое
          слово в книге — и оно станет карточкой, а заодно принесёт динары в сад.
        </p>
        <Button className="mt-5" onClick={() => navigate('/books')}>
          Открыть книги
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-5 text-sm">
        <span>
          Слов в тетради: <b className="tabular-nums">{rows.length}</b>
        </span>
        <span>
          Держатся в голове: <b className="tabular-nums">{learned}</b>
        </span>
        <span>
          К повторению сейчас: <b className="tabular-nums">{due}</b>
        </span>
      </div>

      <ul className="garden-notebook divide-y divide-[#c99b61]">
        {rows.slice(0, 60).map(({ entry, review }) => (
          <li key={entry.id} className="flex items-baseline gap-3 py-2">
            <span className="font-display text-lg font-bold">{entry.word}</span>
            <span className="min-w-0 truncate text-sm text-[#6b4d38]">{entry.translation}</span>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-[#7a5b43]">
              {review ? dueLabel(review.dueAt, now) : 'новое'}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 60 && (
        <p className="mt-3 text-sm text-[#6b4d38]">
          Показаны последние 60 из {rows.length}.
        </p>
      )}

      <Button className="mt-5" onClick={() => navigate('/cards')}>
        <LuBookOpen /> {GARDEN.practise.sr} — карточки
      </Button>
    </div>
  );
}
