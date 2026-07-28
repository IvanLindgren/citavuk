import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { Button, Card, ErrorNote, Spinner } from '../components/ui';
import { getQuiz, saveAttempt, type Quiz } from '../api/quizzes';
import { plural } from '../lib/books';
import { Link, useParams } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

/**
 * Прохождение теста: по одному вопросу за раз.
 *
 * Список из двенадцати вопросов сразу читается на телефоне как простыня, в
 * которой теряешь место после каждого касания. По одному вопросу на экран
 * помещается и вопрос, и варианты, и разбор — без прокрутки.
 *
 * Разбор показывается сразу после ответа, а не в конце: объяснение полезно,
 * пока вопрос ещё в голове. Итог попытки при этом всё равно уходит на сервер
 * целиком, поэтому статистика считается по всему тесту, а не по галочкам.
 */
export function TestRun() {
  const { id } = useParams();
  const { account } = useAuth();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState('');

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);

  useSeo({ title: quiz ? `${quiz.title} — Читавук` : 'Тест — Читавук', noindex: true });

  useEffect(() => {
    if (!account || !id) return;
    const controller = new AbortController();
    getQuiz(id, controller.signal)
      .then(setQuiz)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Тест не открылся.');
      });
    return () => controller.abort();
  }, [id, account]);

  if (!account) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-6">
        <Card className="p-6">
          <p>Чтобы решать тесты, войдите в аккаунт.</p>
          <Link to="/login">
            <Button className="mt-4">Войти</Button>
          </Link>
        </Card>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <ErrorNote>{error}</ErrorNote>
        <Link to="/materials">
          <Button variant="secondary" className="mt-4">
            К материалам
          </Button>
        </Link>
      </main>
    );
  }

  if (!quiz) {
    return (
      <main className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-16 text-[var(--text-muted)] sm:px-6">
        <Spinner /> Открываем тест…
      </main>
    );
  }

  const total = quiz.questions.length;
  const question = quiz.questions[index];
  const answered = chosen !== null;

  const answer = (option: number) => {
    if (answered) return;
    setChosen(option);
    setAnswers((previous) => [...previous, option]);
  };

  const next = async () => {
    if (index + 1 < total) {
      setIndex(index + 1);
      setChosen(null);
      return;
    }
    setSaving(true);
    try {
      await saveAttempt(quiz.id, answers);
    } catch {
      // Ответы уже показаны и разобраны; несохранённая попытка портит только
      // статистику, и ронять из-за неё экран с результатом незачем.
    } finally {
      setSaving(false);
      setFinished(true);
    }
  };

  if (finished) {
    const correct = quiz.questions.reduce(
      (sum, item, position) => sum + (answers[position] === item.answer ? 1 : 0),
      0,
    );
    return <Result quiz={quiz} correct={correct} answers={answers} />;
  }

  if (!question) return null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/materials" className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)]">
          ← {quiz.title}
        </Link>
        <span className="shrink-0 text-sm text-[var(--text-muted)]">
          {index + 1} / {total}
        </span>
      </div>

      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
        <motion.div
          className="h-full rounded-full bg-[var(--accent)]"
          animate={{ width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="p-4 sm:p-6">
            <h1 className="font-display text-lg font-bold sm:text-xl">{question.question}</h1>

            <ul className="mt-4 space-y-2">
              {question.options.map((option, position) => (
                <li key={option}>
                  <button
                    onClick={() => answer(position)}
                    disabled={answered}
                    className={[
                      'w-full rounded-2xl border px-4 py-3 text-left text-sm transition-colors sm:text-base',
                      'disabled:cursor-default',
                      optionStyle(answered, position, chosen, question.answer),
                    ].join(' ')}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>

            <AnimatePresence>
              {answered && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-2xl bg-[var(--bg-sunken)] p-4 text-sm">
                    <div className="font-semibold">
                      {chosen === question.answer ? 'Верно' : 'Неверно'}
                    </div>
                    <p className="mt-1 text-[var(--text-muted)]">{question.explanation}</p>
                    {chosen !== question.answer && question.wrongHint && (
                      <p className="mt-2 text-[var(--text-muted)]">{question.wrongHint}</p>
                    )}
                  </div>
                  <Button
                    className="mt-4 w-full"
                    disabled={saving}
                    onClick={() => void next()}
                  >
                    {saving ? <Spinner /> : index + 1 < total ? 'Дальше' : 'Итог'}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

function optionStyle(
  answered: boolean,
  position: number,
  chosen: number | null,
  correct: number,
): string {
  if (!answered) {
    return 'border-[var(--line)] bg-[var(--bg-raised)] hover:border-[var(--accent)]';
  }
  if (position === correct) {
    return 'border-emerald-500 bg-emerald-500/10 font-semibold';
  }
  if (position === chosen) {
    return 'border-serb-red bg-serb-red/10';
  }
  return 'border-[var(--line)] opacity-60';
}

function Result({
  quiz,
  correct,
  answers,
}: {
  quiz: Quiz;
  correct: number;
  answers: number[];
}) {
  const total = quiz.questions.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const wrong = quiz.questions
    .map((question, position) => ({ question, position }))
    .filter(({ question, position }) => answers[position] !== question.answer);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Card className="p-6 text-center">
        <div className="font-display text-4xl font-bold text-[var(--accent)] sm:text-5xl">
          {score}%
        </div>
        <p className="mt-2 text-[var(--text-muted)]">
          {correct} из {total} {plural(total, 'вопроса', 'вопросов', 'вопросов')} верно
        </p>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          {score === 100
            ? 'Материал закрыт — тест вернётся через три недели.'
            : score >= 80
              ? 'Почти всё. Тест вернётся через неделю.'
              : score >= 60
                ? 'Есть провалы. Тест вернётся через три дня.'
                : 'Материал стоит перечитать — тест вернётся завтра.'}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/materials">
            <Button variant="secondary" className="w-full sm:w-auto">
              К материалам
            </Button>
          </Link>
          <Button className="w-full sm:w-auto" onClick={() => window.location.reload()}>
            Пройти заново
          </Button>
        </div>
      </Card>

      {wrong.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-bold">Разбор ошибок</h2>
          <ul className="space-y-3">
            {wrong.map(({ question, position }) => (
              <li key={position}>
                <Card className="p-4">
                  <div className="font-semibold">{question.question}</div>
                  <div className="mt-2 text-sm text-[var(--text-muted)]">
                    Ваш ответ:{' '}
                    <span className="text-serb-red">
                      {question.options[answers[position] ?? -1] ?? 'не выбран'}
                    </span>
                  </div>
                  <div className="mt-1 text-sm">
                    Верно:{' '}
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {question.options[question.answer]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    {question.explanation}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
