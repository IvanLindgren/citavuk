import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  LuBookOpen,
  LuCheck,
  LuFlame,
  LuPlus,
  LuSettings,
  LuSparkles,
  LuX,
} from 'react-icons/lu';

import {
  composeDailyLesson,
  loadDaily,
  loadDailySettings,
  markDailyLearned,
  saveDailySettings,
  type DailyExercise,
  type DailyState,
  type DailyTheme,
  type DailyWord,
} from '../api/daily';
import { LEVELS, LEVEL_NAMES } from '../api/level';
import { plainExample } from '../lib/roadmapWords';
import { saveVocabularyWord } from '../lib/vocabulary';
import { useFocusTrap, useScrollLock } from '../lib/overlay';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';
import { Mascot } from './Mascot';
import { Button, Card, ErrorNote, Spinner } from './ui';

/**
 * Окно «На каждый день».
 *
 * Десять слов, короткий текст с ними и упражнения. Раз в день, а не при каждом
 * заходе: окно, которое встречает человека по десять раз на дню, закрывают не
 * глядя — и вместе с ним закрывают всё, что в нём было полезного.
 *
 * Набор собирает и хранит сервер: у одного человека один набор на день во всех
 * его устройствах. Клиент только показывает и отмечает выученное.
 */

const SEEN_KEY = 'citavuk-daily-seen';

function seenToday(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === today();
  } catch {
    return false;
  }
}

function rememberSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, today());
  } catch {
    // Приватный режим: окно придёт ещё раз, и это меньшее из зол.
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Сам показ раз в день. Кнопка «открыть вручную» — в `DailyButton`. */
export function DailyWindow() {
  const { account } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Пока уровень не назван, поверх страницы стоит окно уровня (LevelPrompt).
    // Второе окно над ним — это два вопроса разом и ни одного понятного.
    if (!account?.serbianLevel || seenToday()) return;
    // Окно не выпрыгивает поверх первой же страницы: человек пришёл читать, а
    // не отвечать на вопросы. Пауза — время дойти до места.
    const timer = window.setTimeout(() => setOpen(true), 2500);
    return () => window.clearTimeout(timer);
  }, [account]);

  if (!open) return null;
  return (
    <DailyPanel
      onClose={() => {
        rememberSeen();
        setOpen(false);
      }}
    />
  );
}

/** Кнопка «открыть окно дня» для меню и страниц. */
export function DailyButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 ${className}`}
      >
        <LuSparkles className="text-[var(--accent)]" /> На каждый день
      </button>
      {open && <DailyPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function DailyPanel({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<DailyState | null>(null);
  const [error, setError] = useState('');
  const [tuning, setTuning] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useScrollLock(true);
  useFocusTrap(true, panelRef);

  const pull = useCallback(async () => {
    try {
      const next = await loadDaily();
      setState(next);
      // Пока темы и уровень не названы, показывать нечего: набор собирается
      // ровно по ним.
      if (!next.configured || !next.level) setTuning(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть.');
    }
  }, []);

  useEffect(() => {
    void pull();
  }, [pull]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[85] grid place-items-center overflow-y-auto bg-black/60 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="На каждый день"
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--bg)] shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-7">
          <Mascot pose="citavuk_zdravo" alt="" className="w-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">
              На каждый день
            </p>
            <h2 className="font-display text-xl sm:text-2xl">
              {tuning ? 'Что тебе интересно' : 'Десять слов и текст с ними'}
            </h2>
          </div>
          {state && !tuning && (
            <button
              type="button"
              onClick={() => setTuning(true)}
              className="grid size-9 place-items-center rounded-full border border-[var(--line)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)]"
              aria-label="Настроить темы"
              title="Настроить темы"
            >
              <LuSettings />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full border border-[var(--line)] transition-colors hover:border-[var(--accent)]"
            aria-label="Закрыть"
          >
            <LuX />
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-5 sm:px-7">
          {error && <ErrorNote>{error}</ErrorNote>}
          {!state && !error && (
            <div className="grid place-items-center py-10">
              <Spinner className="size-7" />
            </div>
          )}
          {state && tuning && (
            <Tuning
              level={state.level}
              chosen={state.themes}
              onDone={async () => {
                setTuning(false);
                await pull();
              }}
            />
          )}
          {state && !tuning && <DailySet state={state} onChange={setState} />}
        </div>
      </div>
    </div>
  );
}

/** Выбор тем и уровня. Спрашивается один раз, потом — по кнопке настроек. */
function Tuning({
  level,
  chosen,
  onDone,
}: {
  level: string;
  chosen: string[];
  onDone: () => void;
}) {
  const [themes, setThemes] = useState<DailyTheme[]>([]);
  const [picked, setPicked] = useState<string[]>(chosen);
  const [pickedLevel, setPickedLevel] = useState(level);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDailySettings()
      .then((settings) => {
        setThemes(settings.available);
        if (!level) setPickedLevel(settings.level);
      })
      .catch(() => setError('Не удалось загрузить темы.'));
  }, [level]);

  const save = async (all: boolean) => {
    setSaving(true);
    setError('');
    try {
      await saveDailySettings({
        themes: all ? [] : picked,
        enabled: true,
        level: pickedLevel || undefined,
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить.');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-lg">Твой уровень</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          По нему подбираются слова: на A1 они самые частые, на C1 — редкие.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LEVELS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPickedLevel(item)}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                pickedLevel === item
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-bold'
                  : 'border-[var(--line)] hover:border-[var(--accent)]'
              }`}
              title={LEVEL_NAMES[item]}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg">Что интересно</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Выбери темы или возьми всё подряд — тогда слова будут из всех тем
          уровня.
        </p>
        {error && (
          <div className="mt-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {themes.map((theme) => {
            const active = picked.includes(theme.theme);
            return (
              <button
                key={theme.theme}
                type="button"
                onClick={() =>
                  setPicked((current) =>
                    active
                      ? current.filter((item) => item !== theme.theme)
                      : [...current, theme.theme],
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-bold'
                    : 'border-[var(--line)] hover:border-[var(--accent)]'
                }`}
              >
                {theme.theme}
                <span className="ml-1.5 text-xs text-[var(--text-muted)]">
                  {theme.words}
                </span>
              </button>
            );
          })}
          {themes.length === 0 && !error && <Spinner />}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void save(false)} disabled={saving || picked.length === 0}>
          {saving ? <Spinner /> : `Учить выбранное (${picked.length})`}
        </Button>
        <Button variant="secondary" onClick={() => void save(true)} disabled={saving}>
          Всё подряд
        </Button>
      </div>
    </div>
  );
}

/** Слова дня, текст с ними и упражнения. */
function DailySet({
  state,
  onChange,
}: {
  state: DailyState;
  onChange: (next: DailyState) => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState('');
  const set = state.set;

  const compose = async () => {
    setComposing(true);
    setError('');
    try {
      const { lesson } = await composeDailyLesson();
      if (set) onChange({ ...state, set: { ...set, lesson }, lessonReady: true });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Текст сейчас не составить.',
      );
    } finally {
      setComposing(false);
    }
  };

  if (!set) {
    return (
      <p className="py-6 text-center text-[var(--text-muted)]">
        На сегодня слов не нашлось. Загляни завтра — набор соберётся заново.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Progress state={state} />

      <div className="space-y-2">
        {set.words.map((word, index) => (
          <motion.div
            key={word.lemma}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
          >
            <WordRow
              word={word}
              learned={set.learned.includes(word.lemma)}
              onLearned={(learned) =>
                onChange({ ...state, set: { ...set, learned } })
              }
            />
          </motion.div>
        ))}
      </div>

      {set.lesson ? (
        <Lesson lesson={set.lesson} />
      ) : state.canCompose ? (
        <Card className="p-5 text-center">
          <LuBookOpen className="mx-auto size-6 text-[var(--text-muted)]" />
          <p className="mt-2 text-[var(--text-muted)]">
            Читавук может собрать из этих слов маленький текст с упражнениями.
          </p>
          {error && (
            <div className="mt-3 text-left">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          <Button className="mt-4" onClick={() => void compose()} disabled={composing}>
            {composing ? <Spinner /> : 'Составить текст'}
          </Button>
          {composing && (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Это занимает секунд двадцать.
            </p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function Progress({ state }: { state: DailyState }) {
  const { progress } = state;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-1.5">
          <LuFlame className="text-[var(--accent)]" />
          {progress.streak > 0 ? `${progress.streak} дн. подряд` : 'Начнём сегодня'}
        </span>
        <span className="text-[var(--text-muted)]">
          Повторено сегодня: <b className="text-[var(--text)]">{progress.reviewedToday}</b>
        </span>
        <span className="text-[var(--text-muted)]">
          Ждёт повторения: <b className="text-[var(--text)]">{progress.dueNow}</b>
        </span>
      </div>
      {progress.faded.length > 0 && (
        <div className="mt-3 border-t border-[var(--line)] pt-3">
          <p className="text-sm font-bold">Пора вспомнить</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {progress.faded.map((word) => (
              <span
                key={word.word}
                className="rounded-full bg-[var(--bg-sunken)] px-3 py-1 text-sm"
                title={`Просрочено на ${word.overdueDays} дн.`}
              >
                <b>{word.word}</b>{' '}
                <span className="text-[var(--text-muted)]">{word.translation}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function WordRow({
  word,
  learned,
  onLearned,
}: {
  word: DailyWord;
  learned: boolean;
  onLearned: (learned: string[]) => void;
}) {
  const { sync } = useSync();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  const add = async () => {
    if (busy || added) return;
    setBusy(true);
    try {
      await saveVocabularyWord({
        word: word.lemma,
        lemma: word.lemma,
        pos: word.pos,
        translation: word.translation,
        forms: {
          контекст: plainExample(word.example ?? ''),
          перевод: plainExample(word.exampleTranslation ?? ''),
          источник: `Слова дня · ${word.theme}`,
        },
      });
      setAdded(true);
      void sync();
      const { learned: marked } = await markDailyLearned(word.lemma);
      onLearned(marked);
    } catch {
      // Молча: слово останется в наборе, и кнопку можно нажать ещё раз.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3 ${
        learned || added ? 'border-[var(--success)]/50 bg-[var(--success)]/5' : 'border-[var(--line)]'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <b className="font-display text-lg">{word.lemma}</b>
          <span className="text-[var(--text-muted)]">{word.translation}</span>
          {word.note && (
            <span className="text-xs text-[var(--text-muted)]">{word.note}</span>
          )}
        </p>
        {word.example && (
          <p className="mt-1 text-sm">
            {plainExample(word.example)}
            {word.exampleTranslation && (
              <span className="text-[var(--text-muted)]">
                {' — '}
                {plainExample(word.exampleTranslation)}
              </span>
            )}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void add()}
        disabled={busy || learned || added}
        className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] transition-colors hover:border-[var(--accent)] disabled:opacity-60"
        aria-label={learned || added ? 'Уже в карточках' : 'Добавить в карточки'}
        title={learned || added ? 'Уже в карточках' : 'Добавить в карточки'}
      >
        {busy ? <Spinner /> : learned || added ? <LuCheck /> : <LuPlus />}
      </button>
    </div>
  );
}

/** Текст с сегодняшними словами и упражнения к нему. */
function Lesson({ lesson }: { lesson: { title: string; text: string; exercises: DailyExercise[] } }) {
  return (
    <Card className="p-5">
      <h3 className="font-display text-xl">{lesson.title}</h3>
      <p className="mt-3 whitespace-pre-wrap text-[17px] leading-relaxed">{lesson.text}</p>
      {lesson.exercises.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-4">
          {lesson.exercises.map((exercise, index) => (
            <Exercise key={index} exercise={exercise} />
          ))}
        </div>
      )}
    </Card>
  );
}

function Exercise({ exercise }: { exercise: DailyExercise }) {
  const reduced = useReducedMotion() ?? false;
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const right =
    answer.trim().toLocaleLowerCase('sr') ===
    exercise.answer.trim().toLocaleLowerCase('sr');

  return (
    <div className="rounded-xl border border-[var(--line)] p-4">
      <p className="font-bold">{exercise.question}</p>
      {exercise.options && exercise.options.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {exercise.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setAnswer(option);
                setChecked(true);
              }}
              disabled={checked}
              className={`rounded-lg border p-3 text-left transition-colors ${
                checked && option === exercise.answer
                  ? 'border-[var(--success)] bg-[var(--success)]/10'
                  : checked && option === answer
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                    : 'border-[var(--line)] hover:border-[var(--accent)]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <input
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setChecked(true);
            }}
            disabled={checked}
            className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2"
            placeholder="Твой ответ"
          />
          <Button size="sm" onClick={() => setChecked(true)} disabled={checked || !answer.trim()}>
            Проверить
          </Button>
        </div>
      )}

      <AnimatePresence>
        {checked && (
          <motion.p
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 text-sm"
          >
            {right ? (
              <span className="font-bold text-[var(--success)]">Верно</span>
            ) : (
              <span>
                <span className="font-bold text-[var(--accent)]">Правильный ответ:</span>{' '}
                {exercise.answer}
              </span>
            )}
            {exercise.hint && (
              <span className="block text-[var(--text-muted)]">{exercise.hint}</span>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
