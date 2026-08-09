import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  HandwritingPad,
  type HandwritingPadHandle,
} from '../components/HandwritingPad';
import { Mascot } from '../components/Mascot';
import { writable } from '../lib/writing';
import { SyncBadge } from '../components/SyncBadge';
import { Button, Card, Reveal, Spinner } from '../components/ui';
import { playCourseSound } from '../course/sounds';
import { allBooks, plural, type BookMeta } from '../lib/books';
import {
  dueLabel,
  dueReviews,
  gradeReview,
  mastery,
  type Grade,
} from '../lib/srs';
import {
  allReviews,
  allVocabulary,
  deleteVocabularyWord,
  saveReview,
  type Review,
  type VocabEntry,
  vocabularyContext,
} from '../lib/vocabulary';
import { Link } from '../lib/router';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';
import { useSeo } from '../lib/seo';

/**
 * Словарь и карточки повторения.
 *
 * Раздел отвечает на вопрос, который до сих пор оставался без ответа: куда
 * девается слово, сохранённое в читалке. Сюда — и сразу становится карточкой со
 * сроком следующего показа.
 *
 * Расчёт срока общий с приложением (см. lib/srs.ts), поэтому заниматься можно
 * попеременно на телефоне и в браузере, не сбивая расписание.
 */

type Tab = 'review' | 'writing' | 'all';

interface Row {
  entry: VocabEntry;
  review: Review;
}

export function Cards() {
  useSeo({
    title: 'Словарь и карточки повторения — Читавук',
    noindex: true,
  });

  const { account } = useAuth();
  const { revision, sync } = useSync();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [tab, setTab] = useState<Tab>('review');
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(async () => {
    const [entries, reviews, bookList] = await Promise.all([
      allVocabulary(),
      allReviews(),
      allBooks(),
    ]);
    setBooks(bookList.filter((book) => !book.deleted));
    const byId = new Map(reviews.map((review) => [review.vocabId, review]));

    setRows(
      entries
        .filter((entry) => !entry.deleted)
        .map((entry) => ({
          entry,
          // Слово могло прийти с другого устройства раньше своей карточки.
          review: byId.get(entry.id) ?? {
            vocabId: entry.id,
            ease: 2.5,
            intervalDays: 0,
            reps: 0,
            dueAt: entry.updatedAt,
            lastReviewed: null,
            deleted: 0,
            updatedAt: entry.updatedAt,
            dirty: 0,
          },
        }))
        .sort((a, b) => a.review.dueAt - b.review.dueAt),
    );
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const due = useMemo(() => {
    if (!rows) return [];
    const ready = new Set(
      dueReviews(
        rows.map((row) => row.review),
        now,
      ).map((review) => review.vocabId),
    );
    return rows.filter((row) => ready.has(row.entry.id));
  }, [rows, now]);

  // Письмом повторяются только слова: писать рукой фразу долго, и вспоминается
  // она не так, как слово.
  const dueWriting = useMemo(
    () => due.filter((row) => writable(row.entry.word)),
    [due],
  );

  const grade = useCallback(
    async (row: Row, value: Grade) => {
      const updated = gradeReview(row.review, value, Date.now());
      await saveReview(updated);
      playCourseSound(value === 0 ? 'incorrect' : 'correct');
      setRows((current) =>
        current
          ? current.map((item) =>
              item.entry.id === row.entry.id ? { ...item, review: updated } : item,
            )
          : current,
      );
      // Список «на сегодня» пересчитывается от текущего момента: карточка,
      // отложенная на десять минут, обязана уйти из очереди сразу.
      setNow(Date.now());
      if (account) void sync();
    },
    [account, sync],
  );

  const remove = useCallback(
    async (row: Row) => {
      await deleteVocabularyWord(row.entry.id);
      setRows((current) =>
        current ? current.filter((item) => item.entry.id !== row.entry.id) : current,
      );
      if (account) void sync();
    },
    [account, sync],
  );

  if (rows === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--text-muted)]">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <main className="px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl">Словарь</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--text-muted)]">
              <span>
                {rows.length} {plural(rows.length, 'слово', 'слова', 'слов')}
                {due.length > 0 && ` · ${due.length} к повторению`}
              </span>
              <SyncBadge />
            </div>
          </div>
          <Link to="/palace">
            <Button variant="secondary">Дворец памяти</Button>
          </Link>
        </Reveal>

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-1.5">
              <TabChip active={tab === 'review'} onClick={() => setTab('review')}>
                Повторение
                {due.length > 0 && (
                  <span className="ml-1.5 opacity-70">{due.length}</span>
                )}
              </TabChip>
              <TabChip active={tab === 'writing'} onClick={() => setTab('writing')}>
                Письмом
                {dueWriting.length > 0 && (
                  <span className="ml-1.5 opacity-70">{dueWriting.length}</span>
                )}
              </TabChip>
              <TabChip active={tab === 'all'} onClick={() => setTab('all')}>
                Все слова
                <span className="ml-1.5 opacity-70">{rows.length}</span>
              </TabChip>
            </div>

            {tab === 'review' && (
              <ReviewSession due={due} total={rows.length} onGrade={grade} />
            )}
            {tab === 'writing' && (
              <WritingSession
                due={dueWriting}
                skipped={due.length - dueWriting.length}
                onGrade={grade}
              />
            )}
            {tab === 'all' && (
              <WordList rows={rows} books={books} now={now} onDelete={remove} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

function ReviewSession({
  due,
  total,
  onGrade,
}: {
  due: Row[];
  total: number;
  onGrade: (row: Row, grade: Grade) => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const row = due[0];
  const context = row ? vocabularyContext(row.entry) : '';

  // Новая карточка всегда показывается лицевой стороной.
  useEffect(() => setRevealed(false), [row?.entry.id]);

  // Пробел открывает ответ, цифры оценивают — так повторение идёт с клавиатуры
  // и не требует целиться мышью в три кнопки подряд.
  useEffect(() => {
    if (!row) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      if (!revealed) return;
      const grade = { '1': 0, '2': 1, '3': 2 }[event.key];
      if (grade !== undefined) void onGrade(row, grade as Grade);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [row, revealed, onGrade]);

  if (!row) {
    return (
      <Card className="paper-grain px-6 py-14 text-center">
        <div className="mx-auto mb-6 w-36">
          <Mascot pose="citavuk_povtor" alt="" width={288} float />
        </div>
        <h2 className="text-2xl">На сегодня всё</h2>
        <p className="mx-auto mt-3 max-w-md leading-relaxed text-[var(--text-muted)]">
          {total > 0
            ? 'Все карточки повторены. Новые появятся, как только подойдёт срок — заходите завтра.'
            : 'Сохраняйте слова в читалке, и они появятся здесь.'}
        </p>
        <Link to="/library">
          <Button className="mt-7">К чтению</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div>
      <AnimatePresence mode="wait">
        <motion.div
          key={row.entry.id}
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="paper-grain px-6 py-12 text-center sm:px-10">
            <div className="font-display text-4xl font-bold text-[var(--accent)] sm:text-5xl">
              {row.entry.word}
            </div>
            {row.entry.pos !== 'UNKNOWN' && (
              <div className="mt-2 text-sm text-[var(--text-muted)]">
                {row.entry.pos.toLowerCase()}
              </div>
            )}
            {context && (
              <p className="mx-auto mt-5 max-w-xl border-l-2 border-[var(--accent)]/35 pl-3 text-left leading-6" lang="sr">
                {context}
              </p>
            )}

            <div className="mt-8 min-h-16">
              {revealed ? (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="font-display text-2xl"
                >
                  {row.entry.translation || '—'}
                </motion.div>
              ) : (
                <Button variant="secondary" onClick={() => setRevealed(true)}>
                  Показать перевод
                </Button>
              )}
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>

      {revealed && (
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <GradeButton tone="hard" hint="1" onClick={() => void onGrade(row, 0)}>
            Не помню
          </GradeButton>
          <GradeButton tone="ok" hint="2" onClick={() => void onGrade(row, 1)}>
            Помню
          </GradeButton>
          <GradeButton tone="easy" hint="3" onClick={() => void onGrade(row, 2)}>
            Легко
          </GradeButton>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        Осталось {due.length} {plural(due.length, 'карточка', 'карточки', 'карточек')}
        {' · '}
        пробел показывает перевод, цифры 1–3 оценивают
      </p>
    </div>
  );
}

/**
 * Повторение письмом от руки.
 *
 * Направление обратное обычной карточке: показывается перевод, а вспомнить надо
 * сербское слово — и не узнать среди вариантов, а написать. Это и есть смысл
 * упражнения: узнавание даётся куда легче воспроизведения, и слово, которое
 * «вроде знаешь», на письме часто не вспоминается вовсе.
 *
 * Проверяет человек сам. Почему не программа — см. lib/writing.ts.
 */
function WritingSession({
  due,
  skipped,
  onGrade,
}: {
  due: Row[];
  skipped: number;
  onGrade: (row: Row, grade: Grade) => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const pad = useRef<HandwritingPadHandle>(null);
  const [revealed, setRevealed] = useState(false);
  const [empty, setEmpty] = useState(true);
  const row = due[0];

  // Новое слово — чистый лист. Оставить чужие штрихи под следующим словом
  // значит сделать упражнение бессмысленным.
  useEffect(() => {
    pad.current?.clear();
    setRevealed(false);
    setEmpty(true);
  }, [row?.entry.id]);

  if (!row) {
    return (
      <Card className="paper-grain px-6 py-14 text-center">
        <div className="mx-auto mb-6 w-36">
          <Mascot pose="citavuk_povtor" alt="" width={288} float />
        </div>
        <h2 className="text-2xl">Писать пока нечего</h2>
        <p className="mx-auto mt-3 max-w-md leading-relaxed text-[var(--text-muted)]">
          {skipped > 0
            ? 'К повторению остались только фразы, а письмом повторяются отдельные слова.'
            : 'Все слова повторены. Новые появятся, когда подойдёт срок.'}
        </p>
        <Link to="/library">
          <Button className="mt-7">К чтению</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div>
      <Card className="paper-grain px-5 py-8 sm:px-10">
        <p className="text-center text-sm text-[var(--text-muted)]">
          Напишите по-сербски
        </p>
        <div className="mt-2 text-center font-display text-3xl font-bold sm:text-4xl">
          {row.entry.translation || '—'}
        </div>

        <div className="mt-6">
          <HandwritingPad
            ref={pad}
            ariaLabel={`Напишите сербское слово со значением «${row.entry.translation}»`}
            onChange={setEmpty}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <SmallButton onClick={() => pad.current?.undo()} disabled={empty}>
              Отменить штрих
            </SmallButton>
            <SmallButton onClick={() => pad.current?.clear()} disabled={empty}>
              Стереть
            </SmallButton>
          </div>
          {!revealed && (
            <Button variant="secondary" onClick={() => setRevealed(true)}>
              Показать ответ
            </Button>
          )}
        </div>

        <AnimatePresence>
          {revealed && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-6 border-t border-[var(--line)] pt-5 text-center">
                <div className="font-display text-4xl font-bold text-[var(--accent)] sm:text-5xl">
                  {row.entry.word}
                </div>
                {vocabularyContext(row.entry) && (
                  <p className="mx-auto mt-4 max-w-xl text-left text-sm leading-6 text-[var(--text-muted)]" lang="sr">
                    {vocabularyContext(row.entry)}
                  </p>
                )}
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Сравните с написанным выше
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {revealed && (
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <GradeButton tone="hard" hint="1" onClick={() => void onGrade(row, 0)}>
            Не вспомнил
          </GradeButton>
          <GradeButton tone="ok" hint="2" onClick={() => void onGrade(row, 1)}>
            Написал верно
          </GradeButton>
          <GradeButton tone="easy" hint="3" onClick={() => void onGrade(row, 2)}>
            Легко
          </GradeButton>
        </div>
      )}

      <p className="mt-6 text-center text-sm leading-relaxed text-[var(--text-muted)]">
        Осталось {due.length}{' '}
        {plural(due.length, 'слово', 'слова', 'слов')}
        {skipped > 0 && (
          <> · фраз пропущено: {skipped}, их письмом не повторяем</>
        )}
      </p>
    </div>
  );
}

function SmallButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function GradeButton({
  tone,
  hint,
  onClick,
  children,
}: {
  tone: 'hard' | 'ok' | 'easy';
  hint: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tones = {
    hard: 'border-serb-red/40 text-serb-red hover:bg-serb-red/10',
    ok: 'border-[var(--line)] text-[var(--text)] hover:bg-[var(--bg-sunken)]',
    easy: 'border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/10 dark:text-emerald-400',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-2xl border bg-[var(--bg-raised)] px-4 py-4 font-semibold transition-colors ${tones[tone]}`}
    >
      {children}
      <span className="rounded-md bg-[var(--bg-sunken)] px-1.5 py-0.5 text-xs opacity-70">
        {hint}
      </span>
    </button>
  );
}

/** Сколько слов записи показывать в списке до раскрытия. */
const PREVIEW_WORDS = 4;

function shorten(text: string, words = PREVIEW_WORDS): string {
  const parts = text.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length <= words) return parts.join(' ');
  return `${parts.slice(0, words).join(' ')}…`;
}

/**
 * Список слов, разложенный по книгам.
 *
 * Сплошной список не отвечал на вопрос «откуда это слово», а из книги в словарь
 * попадают и целые фразы: в одну строку они не помещаются, поэтому показывается
 * начало, а по нажатию запись раскрывается целиком.
 */
function WordList({
  rows,
  books,
  now,
  onDelete,
}: {
  rows: Row[];
  books: BookMeta[];
  now: number;
  onDelete: (row: Row) => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const titles = new Map(books.map((book) => [book.id, book.title]));
    const byBook = new Map<string, { title: string; rows: Row[] }>();

    for (const row of rows) {
      const id = row.entry.bookId ?? '';
      const title = titles.get(id) ?? 'Без книги';
      const group = byBook.get(id);
      if (group) group.rows.push(row);
      else byBook.set(id, { title, rows: [row] });
    }

    return [...byBook.entries()]
      .map(([id, group]) => ({ id, ...group }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [rows, books]);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.id || 'none'}>
          <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-2">
            <h2 className="truncate text-lg">{group.title}</h2>
            <span className="shrink-0 text-sm text-[var(--text-muted)]">
              {group.rows.length}{' '}
              {plural(group.rows.length, 'слово', 'слова', 'слов')}
            </span>
          </div>

          <div className="space-y-2">
            {group.rows.map((row) => {
              const open = openId === row.entry.id;
              const long =
                row.entry.word.split(/\s+/).length > PREVIEW_WORDS ||
                row.entry.translation.split(/\s+/).length > PREVIEW_WORDS + 2;

              return (
                <Card key={row.entry.id} className="flex items-center gap-4 p-4">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setOpenId(open ? null : row.entry.id)}
                    aria-expanded={open}
                  >
                    <div className="font-display text-lg font-bold">
                      {open ? row.entry.word : shorten(row.entry.word)}
                    </div>
                    <div
                      className={
                        open
                          ? 'text-sm text-[var(--text-muted)]'
                          : 'truncate text-sm text-[var(--text-muted)]'
                      }
                    >
                      {open
                        ? row.entry.translation || '—'
                        : shorten(row.entry.translation || '—', PREVIEW_WORDS + 2)}
                    </div>
                    {open && vocabularyContext(row.entry) && (
                      <p className="mt-2 border-l-2 border-[var(--accent)]/30 pl-2 text-sm leading-5" lang="sr">
                        {vocabularyContext(row.entry)}
                      </p>
                    )}
                    {long && !open && (
                      <span className="mt-0.5 inline-block text-xs text-[var(--accent)]">
                        показать целиком
                      </span>
                    )}
                  </button>

                  <div className="hidden w-28 shrink-0 sm:block">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${mastery(row.review) * 100}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-xs text-[var(--text-muted)]">
                      {dueLabel(row.review.dueAt, now)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onDelete(row)}
                    aria-label={`Удалить слово ${row.entry.word}`}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-serb-red/10 hover:text-serb-red"
                  >
                    Удалить
                  </button>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function TabChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
        active
          ? 'bg-[var(--accent)] text-parchment'
          : 'bg-[var(--bg-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <Card className="paper-grain px-6 py-14 text-center">
      <div className="mx-auto mb-6 w-44">
        <Mascot pose="citavuk_povtor" alt="" width={352} float />
      </div>
      <h2 className="text-2xl">Словарь пока пуст</h2>
      <p className="mx-auto mt-3 max-w-lg leading-relaxed text-[var(--text-muted)]">
        Откройте книгу и нажмите любое незнакомое слово. В карточке разбора есть
        кнопка «Добавить в словарь» — оттуда слово попадает сюда и становится
        карточкой со сроком повторения.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link to="/library">
          <Button size="lg">Открыть книгу</Button>
        </Link>
        <Link to="/materials">
          <Button variant="secondary" size="lg">
            Взять материал
          </Button>
        </Link>
      </div>
    </Card>
  );
}
