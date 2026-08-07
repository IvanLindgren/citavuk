import { useEffect, useRef, useState } from 'react';

import {
  LEVELS,
  LEVEL_NAMES,
  getLevelTest,
  gradeLevelTest,
  type Level,
  type LevelQuestion,
  type LevelTestResult,
} from '../api/level';
import { useAuth } from '../state/auth';
import { useFocusTrap, useScrollLock } from '../lib/overlay';
import { Mascot } from './Mascot';
import { ErrorNote, Spinner } from './ui';

/**
 * Уровень сербского спрашивается один раз — при первом входе.
 *
 * Раньше его спрашивал Вукоток, и хранил при устройстве: тот же человек отвечал
 * заново в каждом браузере, а остальные разделы о его уровне не знали вовсе.
 * Теперь ответ ложится на аккаунт, и второй раз вопрос не задаётся нигде.
 *
 * Не знать своего уровня — обычное дело, и отвечать наугад незачем: рядом стоит
 * тест на десять вопросов. Закрыть окно тоже можно: непрошеная анкета на входе
 * — хороший способ потерять человека, только что заведшего аккаунт.
 */
export function LevelPrompt() {
  const { account, saveSerbianLevel } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [mode, setMode] = useState<'ask' | 'test' | 'done'>('ask');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<LevelTestResult | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = Boolean(account) && !account?.serbianLevel && !dismissed;
  useScrollLock(open);
  useFocusTrap(open, panelRef);

  if (!open) return null;

  async function choose(level: Level) {
    setSaving(true);
    setError('');
    try {
      await saveSerbianLevel(level, 'declared');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить.');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/60 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Уровень сербского"
    >
      <div
        ref={panelRef}
        className="w-full max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-6 shadow-2xl sm:p-8"
      >
        {mode === 'test' ? (
          <LevelTest
            onCancel={() => setMode('ask')}
            onDone={(value) => {
              setResult(value);
              setMode('done');
            }}
          />
        ) : mode === 'done' && result ? (
          <TestResult result={result} onClose={() => setDismissed(true)} />
        ) : (
          <>
            <div className="flex items-start gap-4">
              <Mascot pose="citavuk_zdravo" alt="" className="w-20 shrink-0 sm:w-24" />
              <div>
                <h2 className="font-display text-2xl font-bold">
                  Насколько хорошо вы знаете сербский?
                </h2>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Спрошу один раз. По ответу подберу ленту и предупрежу, если книга
                  окажется тяжеловата.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-2">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  disabled={saving}
                  onClick={() => void choose(level)}
                  className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)] disabled:opacity-50"
                >
                  <span className="w-8 font-bold">{level}</span>
                  <span className="text-sm text-[var(--text-muted)]">
                    {LEVEL_NAMES[level]}
                  </span>
                </button>
              ))}
            </div>

            {error && (
              <div className="mt-4">
                <ErrorNote>{error}</ErrorNote>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setMode('test')}
                className="rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white transition-opacity hover:opacity-90"
              >
                Не знаю — проверьте меня
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-[var(--text-muted)] underline-offset-4 hover:underline"
              >
                Потом
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Тест на десять вопросов: по два на ступень, от A1 до C1.
 *
 * Ответы проверяет сервер. Отдай он верные варианты браузеру — они лежали бы в
 * исходниках страницы, и тест перестал бы что-либо измерять.
 */
function LevelTest({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (result: LevelTestResult) => void;
}) {
  const [questions, setQuestions] = useState<LevelQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLevelTest()
      .then((loaded) => {
        if (!cancelled) setQuestions(loaded);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить тест.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div>
        <ErrorNote>{error}</ErrorNote>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 rounded-xl border border-[var(--line)] px-4 py-2.5 font-semibold"
        >
          Назад
        </button>
      </div>
    );
  }

  if (!questions) {
    return (
      <div className="grid min-h-40 place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const answered = Object.keys(answers).length;

  async function submit() {
    setSending(true);
    try {
      onDone(await gradeLevelTest(answers, true));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить ответы.');
      setSending(false);
    }
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Короткая проверка</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Десять предложений с пропуском. Не знаете — пропускайте, это тоже ответ.
      </p>

      <ol className="mt-6 grid gap-5">
        {questions.map((question, number) => (
          <li key={question.id}>
            <p className="font-semibold">
              {number + 1}. {question.prompt}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{question.hint}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {question.options.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={answers[question.id] === index}
                  onClick={() =>
                    setAnswers((current) => ({ ...current, [question.id]: index }))
                  }
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    answers[question.id] === index
                      ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-white'
                      : 'border-[var(--line)] hover:border-[var(--accent)]'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={sending}
          onClick={() => void submit()}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sending && <Spinner className="size-4" />}
          Узнать уровень
        </button>
        <span className="text-sm text-[var(--text-muted)]">
          отвечено {answered} из {questions.length}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded-xl px-4 py-3 text-sm font-semibold text-[var(--text-muted)] underline-offset-4 hover:underline"
        >
          Выбрать самому
        </button>
      </div>
    </div>
  );
}

function TestResult({
  result,
  onClose,
}: {
  result: LevelTestResult;
  onClose: () => void;
}) {
  return (
    <div className="text-center">
      <Mascot pose="citavuk_zdravo" alt="" className="mx-auto w-24" />
      <p className="mt-4 text-sm text-[var(--text-muted)]">
        Верных ответов {result.correct} из {result.total}
      </p>
      <p className="mt-2 font-display text-4xl font-bold">{result.level}</p>
      <p className="mt-1 text-[var(--text-muted)]">
        {LEVEL_NAMES[result.level] ?? ''}
      </p>
      <p className="mx-auto mt-4 max-w-sm text-sm text-[var(--text-muted)]">
        Уровень сохранён. Поменять его можно в настройках аккаунта в любой момент —
        это оценка, а не приговор.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 rounded-xl bg-[var(--accent)] px-6 py-3 font-bold text-white transition-opacity hover:opacity-90"
      >
        Понятно
      </button>
    </div>
  );
}
