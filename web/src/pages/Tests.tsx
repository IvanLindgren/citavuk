import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Card, ErrorNote, Spinner } from '../components/ui';
import {
  generateQuiz,
  getQuizStats,
  listQuizzes,
  type QuizStats,
  type QuizSummary,
} from '../api/quizzes';
import { ApiError } from '../api/client';
import { plural } from '../lib/books';
import { extractDocument, IMPORT_STAGE_LABELS, type ImportStage } from '../lib/documentImport';
import { Link, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

/**
 * Тесты по своим материалам.
 *
 * Раздел делает ровно одно: превращает конспект, методичку или главу учебника
 * в проверочный тест с разбором каждого ответа. Тест составляет языковая
 * модель, но считает результат и ведёт расписание повторений сервер.
 *
 * Почему тесты общие
 * ------------------
 * Материал адресуется своим содержимым: одна и та же методичка, принесённая
 * тремя студентами одной группы, — это один тест. Второй и третий получают его
 * мгновенно, а модель вызывается один раз. Личные тесты означали бы три вызова
 * ради одного и того же результата.
 */

/** Сколько вопросов просить у модели. Больше десятка человек не дорешивает. */
const QUESTION_COUNTS = [5, 8, 12] as const;

/** Минимум материала: на меньшем объёме вопросы вырождаются в пересказ. */
const MIN_SOURCE = 400;

export function Tests() {
  useSeo({
    title: 'Тесты по своим материалам — Читавук',
    description:
      'Загрузите конспект или методичку — Читавук составит проверочный тест ' +
      'с объяснением каждого ответа и напомнит, что пора повторить.',
  });

  const { account } = useAuth();
  const [items, setItems] = useState<QuizSummary[] | null>(null);
  const [stats, setStats] = useState<QuizStats | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      if (!account) return;
      try {
        const [list, summary] = await Promise.all([
          listQuizzes(signal),
          getQuizStats(signal),
        ]);
        setItems(list);
        setStats(summary);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить тесты.');
        setItems([]);
      }
    },
    [account],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  if (!account) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <Card className="p-6 text-center sm:p-10">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            Тесты по своим материалам
          </h1>
          <p className="mt-3 text-[var(--text-muted)]">
            Загрузите конспект или методичку — получите проверочный тест с разбором
            каждого ответа. Чтобы вести статистику и напоминать о повторении, нужен
            аккаунт.
          </p>
          <Link to="/login">
            <Button className="mt-6">Войти</Button>
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-display text-2xl font-bold sm:text-4xl">
          Тесты по своим материалам
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)] sm:text-base">
          Конспект, методичка, глава учебника — на выходе вопросы с вариантами,
          правильным ответом и объяснением, почему он правильный.
        </p>
      </header>

      {error && (
        <div className="mb-6">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <StatsRow stats={stats} />
      <CreateBox onCreated={() => void reload()} />

      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-bold sm:text-xl">Готовые тесты</h2>
        {items === null ? (
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Spinner /> Загружаем…
          </div>
        ) : items.length === 0 ? (
          <Card className="p-6 text-center text-[var(--text-muted)]">
            Пока ни одного теста. Добавьте материал — и он появится здесь для всех.
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item.id}>
                <QuizRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <RepeatSection stats={stats} />
    </main>
  );
}

function StatsRow({ stats }: { stats: QuizStats | null }) {
  if (!stats || stats.attempts === 0) return null;

  const tiles = [
    { label: 'Решено тестов', value: String(stats.solved) },
    { label: 'Попыток', value: String(stats.attempts) },
    { label: 'Верных ответов', value: `${stats.accuracy}%` },
    { label: 'Пора повторить', value: String(stats.dueNow) },
  ];

  return (
    // Две колонки на телефоне, четыре на широком экране: четыре плитки в ряд на
    // 360 пикселях превращаются в нечитаемые столбики по одной цифре.
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label} className="px-4 py-3">
          <div className="font-display text-2xl font-bold text-[var(--accent)]">
            {tile.value}
          </div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)] sm:text-sm">
            {tile.label}
          </div>
        </Card>
      ))}
    </div>
  );
}

function QuizRow({ item }: { item: QuizSummary }) {
  return (
    <Link to={`/tests/${item.id}`} className="block h-full">
      <Card className="flex h-full flex-col p-4 transition-colors hover:border-[var(--accent)]">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-base font-bold sm:text-lg">{item.title}</h3>
          {item.attempts > 0 && (
            <span
              className={[
                'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                item.bestScore >= 80
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-serb-red/10 text-serb-red',
              ].join(' ')}
            >
              {item.bestScore}%
            </span>
          )}
        </div>
        {item.subject && (
          <div className="mt-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">
            {item.subject}
          </div>
        )}
        <p className="mt-2 line-clamp-2 text-sm text-[var(--text-muted)]">{item.excerpt}</p>
        <div className="mt-auto pt-3 text-xs text-[var(--text-muted)]">
          {item.questions} {plural(item.questions, 'вопрос', 'вопроса', 'вопросов')}
          {item.attempts > 0 &&
            ` · ${item.attempts} ${plural(item.attempts, 'попытка', 'попытки', 'попыток')}`}
          {item.mine && ' · ваш'}
        </div>
      </Card>
    </Link>
  );
}

function RepeatSection({ stats }: { stats: QuizStats | null }) {
  if (!stats || stats.repeat.length === 0) return null;
  const due = stats.repeat.filter((item) => item.overdue);
  if (due.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-lg font-bold sm:text-xl">Пора повторить</h2>
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Чем хуже прошлый результат, тем раньше тест возвращается: после половины
        верных ответов — на следующий день, после безошибочного — через три недели.
      </p>
      <ul className="space-y-2">
        {due.map((item) => (
          <li key={item.quizId}>
            <Link to={`/tests/${item.quizId}`}>
              <Card className="flex items-center justify-between gap-3 p-4 transition-colors hover:border-[var(--accent)]">
                <span className="min-w-0 flex-1 truncate font-semibold">{item.title}</span>
                <span className="shrink-0 text-sm text-[var(--text-muted)]">
                  было {item.score}%
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Форма создания: файл или вставленный текст. */
function CreateBox({ onCreated }: { onCreated: () => void }) {
  const { navigate } = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [count, setCount] = useState<number>(8);
  const [stage, setStage] = useState<ImportStage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      // Тот же разборщик, что и в читалке: PDF, DOCX, FB2, EPUB, DjVu и TXT.
      // Методички редко приходят простым текстом, и заставлять копировать их
      // руками значило бы не сделать раздел вовсе.
      const document = await extractDocument(file, setStage);
      setText(document.text);
      if (!title) setTitle(document.title);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось прочитать файл.');
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const { quiz } = await generateQuiz(text, title.trim(), count);
      onCreated();
      navigate(`/tests/${quiz.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.isOffline
          ? 'Сервер не ответил. Проверьте связь и попробуйте ещё раз.'
          : caught instanceof Error
            ? caught.message
            : 'Не удалось составить тест.',
      );
    } finally {
      setBusy(false);
    }
  };

  const enough = text.trim().length >= MIN_SOURCE;

  return (
    <Card className="mt-6 p-4 sm:p-6">
      <h2 className="font-display text-lg font-bold sm:text-xl">Новый тест</h2>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.md,.pdf,.docx,.fb2,.epub,.djvu,.djv,.html,.htm"
          className="hidden"
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="w-full sm:w-auto"
        >
          Выбрать файл
        </Button>
        <span className="text-sm text-[var(--text-muted)]">
          PDF, DOCX, FB2, EPUB, DjVu или TXT — либо вставьте текст ниже
        </span>
      </div>

      {stage && (
        <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Spinner /> {IMPORT_STAGE_LABELS[stage]}
        </div>
      )}

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Вставьте сюда конспект, параграф учебника или методичку…"
        rows={6}
        className="mt-4 w-full resize-y rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
        <span>
          {text.trim().length} из {MIN_SOURCE} знаков минимум
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Название</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Необязательно — модель придумает сама"
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] px-4 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <div>
          <span className="mb-1 block text-sm font-semibold">Вопросов</span>
          <div className="flex gap-2">
            {QUESTION_COUNTS.map((value) => (
              <Button
                key={value}
                variant={value === count ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setCount(value)}
                className="flex-1"
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <Button
        className="mt-4 w-full sm:w-auto"
        disabled={!enough || busy}
        onClick={() => void submit()}
      >
        {busy ? (
          <>
            <Spinner /> Составляем…
          </>
        ) : (
          'Составить тест'
        )}
      </Button>
      <AnimatePresence>
        {busy && !stage && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-sm text-[var(--text-muted)]"
          >
            Модель читает материал — это занимает до минуты. Если такой материал
            уже приносили, тест откроется сразу.
          </motion.p>
        )}
      </AnimatePresence>
    </Card>
  );
}
