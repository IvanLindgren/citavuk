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
import { allBooks, getParagraphs, plural, type BookMeta } from '../lib/books';
import { findSentence } from '../lib/vocabContext';
import {
  isAssembled,
  shuffleTiles,
  type Tile,
} from '../lib/phraseBuilder';
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
import {
  isPhrase,
  matchesQuery,
  placeOf,
  posTag,
  tagCounts,
  tagsFor,
  type Tag,
  type TagKind,
} from '../lib/vocabTags';
import { download, exportFileName, toCsv } from '../lib/vocabExport';
import { VocabPrintSheet } from '../components/VocabPrintSheet';
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

  /**
   * Отобранный из словаря срез, который человек попросил повторить.
   *
   * Срок в таком заходе не спрашивается: попросив «повторить #трудное», человек
   * хочет пройти именно эти слова, а не те из них, у которых сегодня подошла
   * очередь, — иначе кнопка выдавала бы пустой экран чаще, чем работала. Порядок
   * всё равно по сроку: просроченное важнее.
   */
  const [focus, setFocus] = useState<{ ids: Set<string>; label: string } | null>(
    null,
  );

  const due = useMemo(() => {
    if (!rows) return [];
    if (focus) {
      return rows
        .filter((row) => focus.ids.has(row.entry.id))
        .sort((a, b) => a.review.dueAt - b.review.dueAt);
    }
    const ready = new Set(
      dueReviews(
        rows.map((row) => row.review),
        now,
      ).map((review) => review.vocabId),
    );
    return rows.filter((row) => ready.has(row.entry.id));
  }, [rows, now, focus]);

  // Отобранное слово можно и удалить прямо из списка: очередь должна о нём
  // забыть, а не спотыкаться о запись, которой больше нет.
  useEffect(() => {
    if (!focus || !rows) return;
    if (!rows.some((row) => focus.ids.has(row.entry.id))) setFocus(null);
  }, [focus, rows]);

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
              {/* «Записей», а не «слов»: половина словаря — выделенные фразы, и
                  называть их словами значит начать врать прямо в заголовке. */}
              <span>
                {rows.length} {plural(rows.length, 'запись', 'записи', 'записей')}
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
              {/* Не «все слова»: в списке лежат и фразы, и делить их — как раз
                  задача этой вкладки. */}
              <TabChip active={tab === 'all'} onClick={() => setTab('all')}>
                Список
                <span className="ml-1.5 opacity-70">{rows.length}</span>
              </TabChip>
            </div>

            {tab === 'review' && (
              <ReviewSession
                due={due}
                total={rows.length}
                onGrade={grade}
                focusLabel={focus?.label ?? null}
                onClearFocus={() => setFocus(null)}
              />
            )}
            {tab === 'writing' && (
              <WritingSession
                due={dueWriting}
                skipped={due.length - dueWriting.length}
                onGrade={grade}
              />
            )}
            {tab === 'all' && (
              <Dictionary
                rows={rows}
                books={books}
                now={now}
                onDelete={remove}
                onReview={(ids, label) => {
                  setFocus({ ids, label });
                  setTab('review');
                }}
              />
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
  focusLabel,
  onClearFocus,
}: {
  due: Row[];
  total: number;
  onGrade: (row: Row, grade: Grade) => Promise<void>;
  focusLabel: string | null;
  onClearFocus: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const row = due[0];
  const context = row ? vocabularyContext(row.entry) : '';
  // У фразы упражнение своё: она собирается из слов, а не открывается кнопкой.
  const building = row ? isPhrase(row.entry.word) : false;

  // Новая карточка всегда показывается лицевой стороной.
  useEffect(() => setRevealed(false), [row?.entry.id]);

  // Пробел открывает ответ, цифры оценивают — так повторение идёт с клавиатуры
  // и не требует целиться мышью в три кнопки подряд. У фразы пробел молчит:
  // случайное нажатие сорвало бы сборку, которую человек ещё не закончил.
  useEffect(() => {
    if (!row) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (!revealed && !building && (event.key === ' ' || event.key === 'Enter')) {
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
  }, [row, revealed, building, onGrade]);

  if (!row) {
    return (
      <Card className="paper-grain px-6 py-14 text-center">
        <div className="mx-auto mb-6 w-36">
          <Mascot pose="citavuk_povtor" alt="" width={288} float />
        </div>
        <h2 className="text-2xl">
          {focusLabel ? 'Отобранное пройдено' : 'На сегодня всё'}
        </h2>
        <p className="mx-auto mt-3 max-w-md leading-relaxed text-[var(--text-muted)]">
          {focusLabel
            ? `Слова по метке «${focusLabel}» закончились.`
            : total > 0
              ? 'Все карточки повторены. Новые появятся, как только подойдёт срок — заходите завтра.'
              : 'Сохраняйте слова в читалке, и они появятся здесь.'}
        </p>
        {focusLabel ? (
          <Button className="mt-7" variant="secondary" onClick={onClearFocus}>
            Вернуться к обычному повторению
          </Button>
        ) : (
          <Link to="/library">
            <Button className="mt-7">К чтению</Button>
          </Link>
        )}
      </Card>
    );
  }

  return (
    <div>
      {focusLabel && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--accent)]/35 bg-[var(--bg-raised)] px-4 py-3">
          <span className="text-sm">
            Повторяем отобранное: <b>{focusLabel}</b>
          </span>
          <button
            type="button"
            onClick={onClearFocus}
            className="text-sm font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
          >
            снять отбор
          </button>
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={row.entry.id}
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="paper-grain px-6 py-12 text-center sm:px-10">
            {building ? (
              <PhraseBuild
                phrase={row.entry.word}
                translation={row.entry.translation}
                revealed={revealed}
                onReveal={() => setRevealed(true)}
              />
            ) : (
              <>
                <div className="font-display text-4xl font-bold text-[var(--accent)] sm:text-5xl">
                  {row.entry.word}
                </div>
                {/* Человеческое название, а не UD-тег: «noun» на карточке — это
                    внутренняя кухня, показанная читателю. */}
                {posTag(row.entry.pos) && (
                  <div className="mt-2 text-sm text-[var(--text-muted)]">
                    {posTag(row.entry.pos)}
                  </div>
                )}
                {context ? (
                  <p className="mx-auto mt-5 max-w-xl border-l-2 border-[var(--accent)]/35 pl-3 text-left leading-6" lang="sr">
                    {context}
                  </p>
                ) : (
                  <BookExample
                    entry={row.entry}
                    className="mx-auto mt-5 max-w-xl border-l-2 border-[var(--accent)]/35 pl-3 text-left leading-6"
                  />
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
              </>
            )}
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
        {building
          ? 'цифры 1–3 оценивают'
          : 'пробел показывает перевод, цифры 1–3 оценивают'}
      </p>
    </div>
  );
}

/**
 * Фраза собирается из перемешанных слов.
 *
 * Спрашивать у фразы перевод — упражнение совсем другого веса: это «переведи
 * предложение», а не «вспомни слово». Письмом фразы не повторяются намеренно
 * (см. lib/writing.ts): писать рукой предложение долго. Поэтому здесь наоборот
 * — показывается перевод, а сербскую фразу надо выложить по порядку. Порядок
 * слов в ней и есть трудное место, а узнавание среди готовых кусков даётся
 * легче письма и работает на телефоне.
 */
function PhraseBuild({
  phrase,
  translation,
  revealed,
  onReveal,
}: {
  phrase: string;
  translation: string;
  revealed: boolean;
  onReveal: () => void;
}) {
  const tiles = useMemo(() => shuffleTiles(phrase), [phrase]);
  const [picked, setPicked] = useState<Tile[]>([]);
  const pool = tiles.filter((tile) => !picked.some((item) => item.id === tile.id));
  const done = picked.length === tiles.length;
  const correct = done && isAssembled(picked, phrase);

  // Выложил последнее слово — ответ уже дан, спрашивать «проверить?» незачем.
  useEffect(() => {
    if (done && !revealed) onReveal();
  }, [done, revealed, onReveal]);

  const border = !revealed
    ? 'border-[var(--line)]'
    : correct
      ? 'border-emerald-600/50'
      : 'border-serb-red/50';

  return (
    <>
      <p className="text-sm text-[var(--text-muted)]">Соберите фразу по-сербски</p>
      <div className="mt-2 font-display text-2xl font-bold sm:text-3xl">
        {translation || '—'}
      </div>

      <div
        className={`mx-auto mt-7 flex min-h-16 max-w-xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-dashed p-2.5 ${border}`}
      >
        {picked.length === 0 ? (
          <span className="text-sm text-[var(--text-muted)]">
            Нажимайте слова по порядку
          </span>
        ) : (
          picked.map((tile) => (
            <PhraseTile
              key={tile.id}
              disabled={revealed}
              onClick={() =>
                setPicked((current) =>
                  current.filter((item) => item.id !== tile.id),
                )
              }
            >
              {tile.text}
            </PhraseTile>
          ))
        )}
      </div>

      {!revealed && (
        <div className="mx-auto mt-4 flex max-w-xl flex-wrap items-center justify-center gap-2">
          {pool.map((tile) => (
            <PhraseTile
              key={tile.id}
              onClick={() => setPicked((current) => [...current, tile])}
            >
              {tile.text}
            </PhraseTile>
          ))}
        </div>
      )}

      <div className="mt-6 min-h-10">
        {revealed ? (
          correct ? (
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">
              Верно
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--text-muted)]">А было так</p>
              <div className="mt-1 font-display text-xl text-[var(--accent)]" lang="sr">
                {phrase}
              </div>
            </>
          )
        ) : (
          <SmallButton onClick={onReveal}>Показать ответ</SmallButton>
        )}
      </div>
    </>
  );
}

function PhraseTile({
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
      lang="sr"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 font-display text-lg transition-colors hover:border-[var(--accent)] disabled:hover:border-[var(--line)]"
    >
      {children}
    </button>
  );
}

/** Абзацы книги: соседние слова одной книги раскрывают подряд, читать её файл
 *  каждый раз заново незачем. */
const paragraphCache = new Map<string, Promise<string[]>>();

function bookParagraphs(id: string): Promise<string[]> {
  let pending = paragraphCache.get(id);
  if (!pending) {
    pending = getParagraphs(id).catch(() => []);
    paragraphCache.set(id, pending);
  }
  return pending;
}

/**
 * Пример из книги для записи, сохранённой без него.
 *
 * Читалка кладёт в карточку предложение, из которого слово взято, но так было
 * не всегда, и у записей постарше поле пустое. Слово с одним переводом через
 * месяц не значит уже ничего: «kraj» — и «конец», и «край». Книга при этом
 * лежит рядом, и найти предложение заново дешевле, чем хранить его копию
 * (см. lib/vocabContext.ts).
 */
function BookExample({
  entry,
  className,
}: {
  entry: VocabEntry;
  className?: string;
}) {
  const [sentence, setSentence] = useState<string | null>(null);

  useEffect(() => {
    setSentence(null);
    if (!entry.bookId) return;
    let alive = true;
    void bookParagraphs(entry.bookId).then((paragraphs) => {
      if (alive) setSentence(findSentence(paragraphs, entry.word));
    });
    return () => {
      alive = false;
    };
  }, [entry.bookId, entry.word]);

  if (!sentence) return null;
  return (
    <p className={className} lang="sr">
      {sentence}
    </p>
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

type Shape = 'all' | 'слово' | 'фраза';

/** Запись вместе с посчитанными метками и полями, по которым идёт поиск. */
interface Listed {
  row: Row;
  tags: Tag[];
  fields: string[];
}

/**
 * Словарь: поиск, метки и список.
 *
 * К сотне записей список по книгам перестаёт быть словарём. Из книги сюда
 * уходит и выделенная фраза целиком, поэтому первым делом запись делится на
 * слово и фразу — вперемешку они мешают и читать, и повторять. Дальше метки:
 * часть речи, тема, ход запоминания. Считаются они сами (см. lib/vocabTags.ts)
 * и показываются только те, что в словаре действительно встретились: пустая
 * метка обещает раздел, которого нет.
 */
function Dictionary({
  rows,
  books,
  now,
  onDelete,
  onReview,
}: {
  rows: Row[];
  books: BookMeta[];
  now: number;
  onDelete: (row: Row) => Promise<void>;
  onReview: (ids: Set<string>, label: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [shape, setShape] = useState<Shape>('all');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  // Метки считаются один раз на запись, а не при каждом наборе буквы: в словаре
  // их бывают сотни, а поиск идёт по каждому нажатию клавиши.
  const tagged = useMemo(
    () =>
      rows.map((row) => ({
        row,
        tags: tagsFor(row.entry, row.review),
        fields: [
          row.entry.word,
          row.entry.translation,
          vocabularyContext(row.entry),
        ],
      })),
    [rows],
  );

  const byShape = useMemo(
    () =>
      shape === 'all'
        ? tagged
        : tagged.filter((item) => item.tags[0]?.id === shape),
    [tagged, shape],
  );

  // Счётчики считаются по тому, что осталось после поиска и вида, а не по всему
  // словарю: метка с числом, не совпадающим с длиной списка после нажатия, —
  // обман.
  const searched = useMemo(
    () => byShape.filter((item) => matchesQuery(item.fields, query)),
    [byShape, query],
  );

  const chips = useMemo(
    () => tagCounts(searched.map((item) => item.tags)),
    [searched],
  );

  // Метки складываются, а не пересекаются: «глагол» и «еда» вместе означают
  // «покажи и то, и другое». Пересечение на разных разрядах почти всегда пусто,
  // и человек решил бы, что фильтр сломан.
  const visible = useMemo(
    () =>
      picked.size === 0
        ? searched
        : searched.filter((item) => item.tags.some((tag) => picked.has(tag.id))),
    [searched, picked],
  );

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const groups = useMemo(() => {
    const titles = new Map(books.map((book) => [book.id, book.title]));
    // Ключ — название, а не bookId. Книгу можно удалить, а её слова остаются, и
    // при группировке по id каждая исчезнувшая книга давала отдельный раздел
    // «Без книги»: их набиралось столько же, сколько удалённых книг.
    const byTitle = new Map<string, Listed[]>();

    for (const item of visible) {
      const title = titles.get(item.row.entry.bookId ?? '') ?? 'Без книги';
      const group = byTitle.get(title);
      if (group) group.push(item);
      else byTitle.set(title, [item]);
    }

    return [...byTitle.entries()]
      .map(([title, items]) => ({ id: title, title, items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [visible, books]);

  const words = useMemo(
    () => tagged.filter((item) => item.tags[0]?.id === 'слово').length,
    [tagged],
  );

  const narrowed = picked.size > 0 || shape !== 'all' || query.trim() !== '';

  const [printing, setPrinting] = useState(false);

  // Выгружается ровно то, что человек видит: отфильтровав словарь до «#еда» и
  // нажав «на печать», он ждёт карточки по еде, а не весь словарь.
  const exportRows = useMemo(
    () =>
      visible.map((item) => ({
        word: item.row.entry.word,
        translation: item.row.entry.translation,
        context: vocabularyContext(item.row.entry),
        tags: item.tags
          .filter((tag) => tag.kind === 'topic' || tag.kind === 'pos')
          .map((tag) => tag.id),
      })),
    [visible],
  );

  /** Чем сужен словарь — этой же строкой подписан заход повторения. */
  const selectionLabel = useMemo(() => {
    const parts: string[] = [];
    if (shape !== 'all') parts.push(shape === 'слово' ? 'слова' : 'фразы');
    for (const id of picked) parts.push(`#${id}`);
    if (query.trim()) parts.push(`«${query.trim()}»`);
    return parts.join(' · ') || 'весь словарь';
  }, [shape, picked, query]);

  return (
    <div>
      <div className="mb-4">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по слову, переводу и примеру"
          aria-label="Поиск по словарю"
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3 outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <ShapeChip active={shape === 'all'} onClick={() => setShape('all')}>
          Всё <Count>{tagged.length}</Count>
        </ShapeChip>
        <ShapeChip active={shape === 'слово'} onClick={() => setShape('слово')}>
          Слова <Count>{words}</Count>
        </ShapeChip>
        <ShapeChip active={shape === 'фраза'} onClick={() => setShape('фраза')}>
          Фразы <Count>{tagged.length - words}</Count>
        </ShapeChip>
      </div>

      {chips.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {chips.map(({ tag, count }) => (
            <TagChipButton
              key={tag.id}
              kind={tag.kind}
              active={picked.has(tag.id)}
              onClick={() => toggle(tag.id)}
            >
              {tag.id} <Count>{count}</Count>
            </TagChipButton>
          ))}
          {picked.size > 0 && (
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              снять метки
            </button>
          )}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {/* Повторение отобранного появляется, только когда словарь чем-то
            сужен: на всём словаре это то же самое, что уже делает вкладка
            повторения. Выгрузка нужна всегда — выгружается видимое. */}
        {narrowed && visible.length > 0 && (
          <Button
            onClick={() =>
              onReview(
                new Set(visible.map((item) => item.row.entry.id)),
                selectionLabel,
              )
            }
          >
            Повторить отобранное · {visible.length}
          </Button>
        )}
        {visible.length > 0 && (
          <>
            <Button
              variant="secondary"
              onClick={() =>
                download(
                  exportFileName('csv'),
                  toCsv(exportRows),
                  'text/csv;charset=utf-8',
                )
              }
            >
              Таблицей (CSV)
            </Button>
            <Button variant="secondary" onClick={() => setPrinting(true)}>
              На печать
            </Button>
          </>
        )}
      </div>

      {printing && (
        <VocabPrintSheet
          rows={exportRows}
          title={narrowed ? selectionLabel : 'Словарь'}
          onClose={() => setPrinting(false)}
        />
      )}

      {visible.length === 0 ? (
        <Card className="px-6 py-12 text-center text-[var(--text-muted)]">
          Ничего не нашлось. Попробуйте другое слово или снимите метки.
        </Card>
      ) : (
        <WordList
          groups={groups}
          now={now}
          openId={openId}
          onToggle={setOpenId}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 opacity-60">{children}</span>;
}

function ShapeChip({
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
      aria-pressed={active}
      className={[
        'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
        active
          ? 'bg-[var(--accent)] text-parchment'
          : 'bg-[var(--bg-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/** Цвет метки по разряду: тема, часть речи и ход запоминания различимы сразу. */
const TAG_TONE: Record<TagKind, string> = {
  kind: 'border-[var(--line)]',
  topic: 'border-[var(--accent)]/45 text-[var(--accent)]',
  freq: 'border-amber-600/45 text-amber-700 dark:text-amber-400',
  pos: 'border-[var(--line)] text-[var(--text-muted)]',
  progress: 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400',
  script: 'border-[var(--line)] text-[var(--text-muted)]',
};

function TagChipButton({
  kind,
  active,
  onClick,
  children,
}: {
  kind: TagKind;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-transparent bg-[var(--accent)] text-parchment'
          : `bg-[var(--bg-raised)] hover:bg-[var(--bg-sunken)] ${TAG_TONE[kind]}`,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/**
 * Где это слово пригодится.
 *
 * Сохранённое слово перестаёт быть строкой в списке: у него есть место, где им
 * пользуются, и туда можно пойти. Ссылка ведёт на Путешествие целиком — своего
 * адреса у места там нет, а придумывать его ради подсказки означало бы менять
 * карту. Место названо по-сербски: его и придётся прочитать на вывеске.
 */
function PlaceHint({ word }: { word: string }) {
  const place = placeOf(word);
  if (!place) return null;
  return (
    <div className="mt-2 text-sm text-[var(--text-muted)]">
      Пригодится здесь:{' '}
      <Link to="/putovanje" className="text-[var(--accent)] hover:underline">
        <span lang="sr">{place.sr}</span> — {place.ru}
      </Link>
    </div>
  );
}

/**
 * Метки самой записи.
 *
 * Показываются только тема и часть речи: вид записи виден по ней самой, а ход
 * запоминания уже нарисован полоской освоенности справа. Ряд из пяти меток под
 * каждым словом превратил бы список обратно в кучу, из которой его и вынимали.
 */
function EntryTags({ tags }: { tags: Tag[] }) {
  const shown = tags.filter((tag) => tag.kind === 'topic' || tag.kind === 'pos');
  if (shown.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {shown.map((tag) => (
        <span
          key={tag.id}
          className={
            tag.kind === 'topic'
              ? 'text-xs text-[var(--accent)]'
              : 'text-xs text-[var(--text-muted)]'
          }
        >
          #{tag.id}
        </span>
      ))}
    </div>
  );
}

/**
 * Список записей, разложенный по книгам.
 *
 * Сплошной список не отвечал на вопрос «откуда это слово», а из книги в словарь
 * попадают и целые фразы: в одну строку они не помещаются, поэтому показывается
 * начало, а по нажатию запись раскрывается целиком.
 */
function WordList({
  groups,
  now,
  openId,
  onToggle,
  onDelete,
}: {
  groups: { id: string; title: string; items: Listed[] }[];
  now: number;
  openId: string | null;
  onToggle: (id: string | null) => void;
  onDelete: (row: Row) => Promise<void>;
}) {
  const setOpenId = onToggle;

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.id || 'none'}>
          <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-2">
            <h2 className="truncate text-lg">{group.title}</h2>
            <span className="shrink-0 text-sm text-[var(--text-muted)]">
              {group.items.length}{' '}
              {plural(group.items.length, 'запись', 'записи', 'записей')}
            </span>
          </div>

          <div className="space-y-2">
            {group.items.map(({ row, tags }) => {
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
                    {open &&
                      (vocabularyContext(row.entry) ? (
                        <p className="mt-2 border-l-2 border-[var(--accent)]/30 pl-2 text-sm leading-5" lang="sr">
                          {vocabularyContext(row.entry)}
                        </p>
                      ) : (
                        <BookExample
                          entry={row.entry}
                          className="mt-2 border-l-2 border-[var(--accent)]/30 pl-2 text-sm leading-5"
                        />
                      ))}
                    {open && <PlaceHint word={row.entry.word} />}
                    {long && !open && (
                      <span className="mt-0.5 inline-block text-xs text-[var(--accent)]">
                        показать целиком
                      </span>
                    )}
                    <EntryTags tags={tags} />
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
