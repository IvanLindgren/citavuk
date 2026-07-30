import { AnimatePresence, motion } from 'framer-motion';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from 'react';

import { CourseSprite } from '../course/CourseSprite';
import {
  insertAtCursor,
  SerbianKeyboard,
} from '../course/SerbianKeyboard';
import { serbianLetterDetails } from '../course/serbianLetters';
import {
  allTiles,
  canEvaluate,
  evaluate,
  findLesson,
  lessonUnlocked,
  loadCourse,
  loadProgress,
  randomizeExercises,
  saveLessonProgress,
  splitLetters,
  uploadCourseProgress,
  type ExerciseDraft,
} from '../course/data';
import {
  playCourseSound,
  preloadCourseSounds,
} from '../course/sounds';
import type {
  CourseBundle,
  CourseLesson as CourseLessonModel,
  Evaluation,
  Exercise,
  FillBlankExercise,
  FormHuntExercise,
  ImageDescriptionExercise,
  IntroBlock,
  ReadingQaExercise,
  LetterUnscrambleExercise,
  MatchingExercise,
  MultipleChoiceExercise,
  EndingPickerExercise,
  SentenceBuilderExercise,
  WordTile,
} from '../course/types';
import { Button, Spinner } from '../components/ui';
import { Link, useParams, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

type Phase = 'intro' | 'exercise' | 'result';

export function CourseLesson() {
  const { id = '' } = useParams();
  const { account } = useAuth();
  const { navigate } = useRouter();
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [lesson, setLesson] = useState<CourseLessonModel | null>(null);
  const [sessionExercises, setSessionExercises] = useState<Exercise[]>([]);
  const [sessionSeed, setSessionSeed] = useState(() => createSessionSeed());
  const [phase, setPhase] = useState<Phase>('intro');
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ExerciseDraft | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [attempted, setAttempted] = useState<Set<string>>(() => new Set());
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState('');

  useSeo({
    title: lesson
      ? `${lesson.title} — курс сербской грамматики`
      : 'Урок курса сербской грамматики — Читавук',
    description: lesson?.intro?.text
      ? lesson.intro.text.slice(0, 300)
      : 'Правило, примеры и упражнения по сербской грамматике с объяснением по-русски.',
  });

  // Ссылка на текущее состояние входа: загрузка урока не должна перезапускаться
  // при появлении аккаунта, но проверку порядка внутри неё делать надо.
  const accountRef = useRef(account);
  accountRef.current = account;

  useEffect(() => {
    preloadCourseSounds();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [phase, step]);

  useEffect(() => {
    let active = true;
    void loadCourse()
      .then((course) => {
        if (!active) return;
        const found = findLesson(course, id);
        if (!found) throw new Error('Урок не найден.');
        // Порядок уроков важен для занимающегося, но не для гостя: он видит
        // только теорию, а её незачем прятать за прогрессом, которого у него
        // ещё нет. Иначе ссылка на любой урок, кроме первого, уводила бы на
        // карту курса — и человека, и поисковика.
        if (accountRef.current && !lessonUnlocked(found, loadProgress(course))) {
          navigate('/course', { replace: true });
          return;
        }
        setBundle(course);
        setLesson(found);
        setSessionExercises(randomizeExercises(found.exercises));
        setSessionSeed(createSessionSeed());
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Не удалось открыть урок.');
      });
    return () => {
      active = false;
    };
  }, [id, navigate]);

  const exercise = sessionExercises[step] ?? null;
  useEffect(() => {
    if (!exercise) return;
    setDraft(initialDraft(exercise));
    setEvaluation(null);
    setShowHint(false);
  }, [exercise]);

  if (error) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <CourseSprite state="incorrect" size={150} />
        <h1 className="mt-5 text-2xl">{error}</h1>
        <Link to="/course"><Button className="mt-6">К карте курса</Button></Link>
      </main>
    );
  }

  // Теория урока открыта всем, упражнения — только после входа.
  //
  // Раньше здесь стояла глухая стена «войдите, чтобы продолжить». Она не только
  // отпугивала человека, зашедшего по ссылке, но и прятала от поисковиков
  // единственный на сайте связный текст о сербской грамматике: робот видел
  // форму входа и уходил.
  if (!account) {
    if (!bundle || !lesson) {
      return <div className="flex min-h-[60vh] items-center justify-center"><Spinner className="size-6" /></div>;
    }
    return <LessonTheory lesson={lesson} />;
  }

  if (!bundle || !lesson || !exercise || !draft) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spinner className="size-6" /></div>;
  }

  const finish = () => {
    const score = firstTryCorrect / sessionExercises.length;
    const progress = saveLessonProgress(bundle, lesson.id, score);
    void uploadCourseProgress(bundle, progress).catch(() => {
      // Результат уже сохранён локально и уйдёт при следующем открытии курса.
    });
    playCourseSound('complete');
    setPhase('result');
  };

  const check = () => {
    const result = evaluate(exercise, draft);
    const firstAttempt = !attempted.has(exercise.id);
    setAttempted((current) => new Set(current).add(exercise.id));
    if (result.correct && firstAttempt) setFirstTryCorrect((value) => value + 1);
    setEvaluation(result);
    playCourseSound(result.correct ? 'correct' : 'incorrect');
  };

  const next = () => {
    if (step + 1 >= sessionExercises.length) {
      finish();
      return;
    }
    setStep((value) => value + 1);
  };

  const progress =
    phase === 'intro'
      ? 0
      : phase === 'result'
        ? 100
        : ((step + 1) / sessionExercises.length) * 100;

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)]">
      <LessonKeyboardShortcuts
        active={phase === 'exercise'}
        canCheck={!evaluation && canEvaluate(exercise, draft)}
        hasEvaluation={evaluation !== null}
        onCheck={check}
        onNext={next}
      />
      <div className="sticky top-16 z-30 border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/course')}
            className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"
            aria-label="Закрыть урок"
          >
            <CloseIcon />
          </button>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
            <motion.div
              className="h-full rounded-full bg-[var(--accent)]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.35 }}
            />
          </div>
          <span className="w-16 text-right text-sm font-bold text-[var(--text-muted)]">
            {phase === 'exercise' ? `${step + 1}/${sessionExercises.length}` : ''}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <LessonIntroView
            key="intro"
            lesson={lesson}
            onStart={() => setPhase('exercise')}
          />
        )}
        {phase === 'exercise' && (
          <motion.section
            key={exercise.id}
            initial={{ opacity: 0, x: 22 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.25 }}
            className="mx-auto flex min-h-[calc(100dvh-8.5rem)] max-w-3xl flex-col px-5"
          >
            <div className="flex-1 py-8">
              <div className="mb-7 flex items-start gap-4">
                <CourseSprite
                  state={evaluation ? (evaluation.correct ? 'correct' : 'incorrect') : 'thinking'}
                  size={86}
                />
                <div className="min-w-0 pt-2">
                  <p className="text-sm font-bold uppercase text-[var(--accent)]">
                    {exerciseTypeLabel(exercise.type)}
                  </p>
                  <h1 className="mt-1 text-2xl sm:text-3xl">{exercise.prompt}</h1>
                </div>
              </div>

              <ExerciseView
                exercise={exercise}
                draft={draft}
                disabled={evaluation !== null}
                shuffleSeed={sessionSeed}
                onChange={setDraft}
              />

              {!evaluation && exercise.hint && (
                <div className="mt-5">
                  {showHint ? (
                    <div className="rounded-xl border border-gold/45 bg-gold/10 px-4 py-3 text-sm leading-relaxed">
                      {exercise.hint}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowHint(true)}
                      className="font-semibold text-[var(--text-muted)] hover:text-[var(--accent)]"
                    >
                      Показать подсказку
                    </button>
                  )}
                </div>
              )}

              {evaluation && <Feedback result={evaluation} />}
            </div>

            <div className="sticky bottom-0 -mx-5 border-t border-[var(--line)] bg-[var(--bg)]/95 px-5 py-4 backdrop-blur">
              <Button
                className="w-full"
                size="lg"
                disabled={!evaluation && !canEvaluate(exercise, draft)}
                onClick={evaluation ? next : check}
              >
                {evaluation ? 'Продолжить' : 'Проверить'}
              </Button>
            </div>
          </motion.section>
        )}
        {phase === 'result' && (
          <LessonResult
            key="result"
            lesson={lesson}
            firstTryCorrect={firstTryCorrect}
            threshold={bundle.config.passThreshold}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function LessonKeyboardShortcuts({
  active,
  canCheck,
  hasEvaluation,
  onCheck,
  onNext,
}: {
  active: boolean;
  canCheck: boolean;
  hasEvaluation: boolean;
  onCheck: () => void;
  onNext: () => void;
}) {
  // Отдельный компонент держит число hooks родительской страницы постоянным:
  // до загрузки данных CourseLesson возвращает spinner, а после — сам урок.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'TEXTAREA') return;
      if (hasEvaluation) {
        event.preventDefault();
        onNext();
      } else if (canCheck) {
        event.preventDefault();
        onCheck();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, canCheck, hasEvaluation, onCheck, onNext]);

  return null;
}

/** Теория урока для тех, кто ещё не вошёл. */
function LessonTheory({ lesson }: { lesson: CourseLessonModel }) {
  const blocks = introBlocks(lesson);

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link
        to="/course"
        className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
      >
        ← Курс грамматики
      </Link>

      <div className="mt-4 flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <CourseSprite state="idle" size={140} />
        <div>
          <p className="text-sm font-bold uppercase text-[var(--accent)]">Правило</p>
          <h1 className="mt-1 text-3xl">{lesson.title}</h1>
        </div>
      </div>

      <article className="mt-8 space-y-5">
        {blocks.map((block, index) => (
          <IntroBlockView key={index} block={block} />
        ))}
      </article>

      <div className="mt-10 rounded-3xl border border-[var(--line)] bg-[var(--bg-sunken)] p-8 text-center">
        <h2 className="text-2xl">Дальше — {lesson.exercises.length} упражнений</h2>
        <p className="mx-auto mt-2 max-w-md leading-relaxed text-[var(--text-muted)]">
          Правило запоминается, когда его применяешь. Войдите, чтобы пройти
          упражнения и сохранить прогресс.
        </p>
        <Link to="/login">
          <Button className="mt-6" size="lg">Войти и продолжить</Button>
        </Link>
      </div>
    </main>
  );
}

/** Блоки теории. Старые уроки хранят её одной строкой, новые — списком. */
function introBlocks(lesson: CourseLessonModel): IntroBlock[] {
  if (lesson.intro?.blocks?.length) return lesson.intro.blocks;
  if (lesson.intro?.text) {
    return [{ kind: 'paragraph', text: lesson.intro.text } as IntroBlock];
  }
  return [];
}

function LessonIntroView({
  lesson,
  onStart,
}: {
  lesson: CourseLessonModel;
  onStart: () => void;
}) {
  const blocks = introBlocks(lesson);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl px-5 py-8"
    >
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <CourseSprite state="idle" size={140} />
        <div>
          <p className="text-sm font-bold uppercase text-[var(--accent)]">Перед уроком</p>
          <h1 className="mt-1 text-3xl">{lesson.title}</h1>
          <p className="mt-2 text-[var(--text-muted)]">
            Сначала правило и примеры, затем {lesson.exercises.length} упражнений.
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-5">
        {blocks.map((block, index) => (
          <IntroBlockView key={index} block={block} />
        ))}
      </div>

      <Button className="mt-8 w-full" size="lg" onClick={onStart}>
        Начать урок
      </Button>
    </motion.section>
  );
}

/** Блок теории. Экспортируется ради теста, прогоняющего весь курс. */
export function IntroBlockView({ block }: { block: IntroBlock }) {
  if (block.kind === 'paragraph') {
    return <p className="text-lg leading-relaxed">{richText(block.text)}</p>;
  }
  if (block.kind === 'tip') {
    return (
      <aside className="border-l-4 border-gold bg-gold/10 px-5 py-4 leading-relaxed">
        <b className="mb-1 block text-sm uppercase text-[var(--accent)]">Запомните</b>
        {richText(block.text)}
      </aside>
    );
  }
  if (block.kind === 'example') {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-5 py-4">
        <p className="font-display text-xl font-bold">{highlight(block.serbian, block.highlight)}</p>
        <p className="mt-2 text-[var(--text-muted)]">{block.russian}</p>
      </div>
    );
  }
  if (block.kind !== 'terms') return null;
  if (/букв/iu.test(block.title ?? '')) {
    return <LetterCardDeck block={block} />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
      {block.title && (
        <h2 className="bg-[var(--bg-sunken)] px-4 py-3 text-base uppercase">{block.title}</h2>
      )}
      <table className="w-full border-collapse text-left">
        <tbody>
          {block.rows.map((row) => (
            <tr key={`${row.term}-${row.gloss}`} className="border-t border-[var(--line)] first:border-t-0">
              <th className="px-4 py-3 font-display text-[var(--accent)]">{row.term}</th>
              <td className="px-4 py-3 font-bold">{row.gloss}</td>
              <td className="px-4 py-3 text-sm text-[var(--text-muted)]">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LetterCardDeck({
  block,
}: {
  block: Extract<IntroBlock, { kind: 'terms' }>;
}) {
  const [index, setIndex] = useState(0);
  const row = block.rows[index];
  if (!row) return null;
  const details = serbianLetterDetails(row.term);

  return (
    <section>
      {block.title && (
        <h2 className="mb-3 text-center text-sm uppercase text-[var(--text-muted)]">
          {block.title}
        </h2>
      )}
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-3">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          className="flex size-12 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--bg-raised)] text-2xl transition-colors hover:border-[var(--accent)] disabled:opacity-25"
          aria-label="Предыдущая буква"
          title="Предыдущая буква"
        >
          ←
        </button>
        <motion.div
          key={`${row.term}-${row.gloss}`}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="min-h-56 rounded-2xl border-2 border-gold/55 bg-[var(--bg-raised)] px-5 py-7 text-center shadow-[0_5px_0_0_color-mix(in_srgb,var(--color-gold)_45%,transparent)]"
        >
          <div className="font-display text-7xl font-bold text-[var(--accent)]">
            {row.term}
          </div>
          <div className="mt-1 text-xs font-bold uppercase text-[var(--text-muted)]">
            Сербская кириллица
          </div>
          <div className="mt-4 text-xs font-bold uppercase text-[var(--text-muted)]">
            В латинице
          </div>
          <div className="font-display text-4xl font-bold">{row.gloss}</div>
          {details && (
            <div className="mx-auto mt-5 grid max-w-md gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-[var(--bg-sunken)] px-3 py-2">
                <span className="text-[var(--text-muted)]">Звук: </span>
                <b>{details.sound}</b>
              </div>
              <div className="rounded-lg bg-[var(--bg-sunken)] px-3 py-2">
                <span className="text-[var(--text-muted)]">
                  По-русски примерно:{' '}
                </span>
                <b>{details.russianAnalogue}</b>
              </div>
            </div>
          )}
          {row.note && (
            <p className="mt-4 text-sm text-[var(--text-muted)]">{row.note}</p>
          )}
        </motion.div>
        <button
          type="button"
          disabled={index + 1 >= block.rows.length}
          onClick={() =>
            setIndex((value) => Math.min(block.rows.length - 1, value + 1))
          }
          className="flex size-12 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--bg-raised)] text-2xl transition-colors hover:border-[var(--accent)] disabled:opacity-25"
          aria-label="Следующая буква"
          title="Следующая буква"
        >
          →
        </button>
      </div>
      <div className="mt-4 flex justify-center gap-2" aria-label={`Карточка ${index + 1} из ${block.rows.length}`}>
        {block.rows.map((item, itemIndex) => (
          <button
            key={`${item.term}-${item.gloss}`}
            type="button"
            onClick={() => setIndex(itemIndex)}
            className={[
              'size-2.5 rounded-full transition-colors',
              itemIndex === index ? 'bg-[var(--accent)]' : 'bg-[var(--line)]',
            ].join(' ')}
            aria-label={`Показать букву ${itemIndex + 1}`}
          />
        ))}
      </div>
    </section>
  );
}

export function ExerciseView({
  exercise,
  draft,
  disabled,
  shuffleSeed,
  onChange,
}: {
  exercise: Exercise;
  draft: ExerciseDraft;
  disabled: boolean;
  shuffleSeed: string;
  onChange: (draft: ExerciseDraft) => void;
}) {
  switch (exercise.type) {
    case 'multiple_choice':
    case 'ending_picker':
      return (
        <ChoiceExercise
          exercise={exercise}
          draft={draft}
          disabled={disabled}
          shuffleSeed={shuffleSeed}
          onChange={onChange}
        />
      );
    case 'sentence_builder':
      return <SentenceBuilder exercise={exercise} draft={draft} disabled={disabled} shuffleSeed={shuffleSeed} onChange={onChange} />;
    case 'letter_unscramble':
      return <LetterUnscramble exercise={exercise} draft={draft} disabled={disabled} shuffleSeed={shuffleSeed} onChange={onChange} />;
    case 'matching':
      return <Matching exercise={exercise} draft={draft} disabled={disabled} shuffleSeed={shuffleSeed} onChange={onChange} />;
    case 'fill_blank':
      return <FillBlank exercise={exercise} draft={draft} disabled={disabled} onChange={onChange} />;
    case 'image_description':
      return <ImageDescription exercise={exercise} draft={draft} disabled={disabled} shuffleSeed={shuffleSeed} onChange={onChange} />;
    case 'reading_qa':
      return <ReadingQa exercise={exercise} draft={draft} disabled={disabled} onChange={onChange} />;
    case 'form_hunt':
      return <FormHunt exercise={exercise} draft={draft} disabled={disabled} onChange={onChange} />;
  }
}

/**
 * Текст и вопросы к нему. Текст остаётся на экране, пока идут ответы:
 * проверяется понимание прочитанного, а не память о прочитанном.
 */
function ReadingQa({
  exercise,
  draft,
  disabled,
  onChange,
}: {
  exercise: ReadingQaExercise;
  draft: ExerciseDraft;
  disabled: boolean;
  onChange: (draft: ExerciseDraft) => void;
}) {
  const [showTranslation, setShowTranslation] = useState(false);
  if (draft.kind !== 'pairs') return null;

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] p-5">
        <p lang="sr" className="whitespace-pre-line text-lg leading-relaxed">
          {exercise.text}
        </p>
        {exercise.translation && (
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            {showTranslation ? (
              <p className="text-sm italic leading-relaxed text-[var(--text-muted)]">
                {exercise.translation}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setShowTranslation(true)}
                className="text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                Показать перевод
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {exercise.questions.map((question, questionIndex) => (
          <fieldset key={question.id}>
            <legend className="mb-2 font-semibold">
              {questionIndex + 1}. {question.prompt}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => {
                const selected = draft.values[question.id] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() =>
                      onChange({
                        kind: 'pairs',
                        values: { ...draft.values, [question.id]: option.id },
                      })
                    }
                    className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 font-semibold'
                        : 'border-[var(--line)] hover:border-[var(--accent)]'
                    } disabled:opacity-60`}
                  >
                    {option.text}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

/**
 * Найти в тексте все формы заданного признака.
 *
 * Отмеченное слово выделено и цветом, и подчёркиванием: состояние не должно
 * держаться на одном цвете.
 */
function FormHunt({
  exercise,
  draft,
  disabled,
  onChange,
}: {
  exercise: FormHuntExercise;
  draft: ExerciseDraft;
  disabled: boolean;
  onChange: (draft: ExerciseDraft) => void;
}) {
  if (draft.kind !== 'choice') return null;

  const toggle = (id: string) => {
    const next = draft.ids.includes(id)
      ? draft.ids.filter((item) => item !== id)
      : [...draft.ids, id];
    onChange({ kind: 'choice', ids: next });
  };

  return (
    <div>
      <p className="mb-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)]/10 px-3 py-1.5 text-sm font-semibold text-[var(--accent)]">
        Найдите: {exercise.targetLabel}
      </p>
      <p lang="sr" className="rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] p-5 text-lg leading-loose">
        {exercise.tokens.map((token) => {
          const selected = draft.ids.includes(token.id);
          return (
            <span key={token.id}>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => toggle(token.id)}
                className={`rounded px-1 transition-colors ${
                  selected
                    ? 'bg-[var(--accent)]/20 font-bold underline decoration-[var(--accent)] decoration-2 underline-offset-4'
                    : 'hover:bg-[var(--accent)]/10'
                } disabled:opacity-70`}
              >
                {token.text}
              </button>
              {token.tail}{' '}
            </span>
          );
        })}
      </p>
      {exercise.translation && (
        <p className="mt-3 text-sm italic leading-relaxed text-[var(--text-muted)]">
          {exercise.translation}
        </p>
      )}
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        {draft.ids.length === 0
          ? 'Нажимайте на слова, которые подходят.'
          : `Отмечено слов: ${draft.ids.length}`}
      </p>
    </div>
  );
}

function ChoiceExercise({
  exercise,
  draft,
  disabled,
  shuffleSeed,
  onChange,
}: {
  exercise: MultipleChoiceExercise | EndingPickerExercise;
  draft: ExerciseDraft;
  disabled: boolean;
  shuffleSeed: string;
  onChange: (draft: ExerciseDraft) => void;
}) {
  if (draft.kind !== 'choice') return null;
  const multi = exercise.type === 'multiple_choice' && exercise.multi;
  const options = deterministicShuffle(
    exercise.options,
    `${exercise.id}-${shuffleSeed}`,
  );

  return (
    <div>
      {exercise.type === 'ending_picker' && (
        <div className="mb-5 rounded-xl bg-[var(--bg-sunken)] px-5 py-4 text-center font-display text-xl">
          {exercise.contextSentence.replace('___', `${exercise.stem}…`)}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const selected = draft.ids.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() =>
                onChange({
                  kind: 'choice',
                  ids: multi
                    ? selected
                      ? draft.ids.filter((id) => id !== option.id)
                      : [...draft.ids, option.id]
                    : [option.id],
                })
              }
              className={[
                'min-h-16 rounded-xl border-2 px-4 py-3 text-left font-semibold transition-all',
                selected
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_3px_0_0_var(--accent)]'
                  : 'border-[var(--line)] bg-[var(--bg-raised)] hover:border-[var(--accent)]',
              ].join(' ')}
            >
              {exercise.type === 'ending_picker' ? `${exercise.stem}${option.text}` : option.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SentenceBuilder({
  exercise,
  draft,
  disabled,
  shuffleSeed,
  onChange,
}: {
  exercise: SentenceBuilderExercise;
  draft: ExerciseDraft;
  disabled: boolean;
  shuffleSeed: string;
  onChange: (draft: ExerciseDraft) => void;
}) {
  if (draft.kind !== 'order') return null;
  const tiles = deterministicShuffle(
    allTiles(exercise),
    `${exercise.id}-${shuffleSeed}`,
  );
  const chosen = draft.ids.map((id) => tiles.find((tile) => tile.id === id)).filter(Boolean) as WordTile[];
  const available = tiles.filter((tile) => !draft.ids.includes(tile.id));

  return (
    <div>
      <TileArea
        label="Ваше предложение"
        tiles={chosen}
        empty="Нажимайте слова в нужном порядке"
        disabled={disabled}
        onPick={(tile) =>
          onChange({ kind: 'order', ids: draft.ids.filter((id) => id !== tile.id) })
        }
        onReorder={(ids) => onChange({ kind: 'order', ids })}
      />
      <div className="mt-5 flex min-h-20 flex-wrap content-start justify-center gap-2">
        {available.map((tile) => (
          <WordTileButton
            key={tile.id}
            tile={tile}
            disabled={disabled}
            onClick={() => onChange({ kind: 'order', ids: [...draft.ids, tile.id] })}
          />
        ))}
      </div>
    </div>
  );
}

function LetterUnscramble({
  exercise,
  draft,
  disabled,
  shuffleSeed,
  onChange,
}: {
  exercise: LetterUnscrambleExercise;
  draft: ExerciseDraft;
  disabled: boolean;
  shuffleSeed: string;
  onChange: (draft: ExerciseDraft) => void;
}) {
  const source = useMemo(
    () =>
      deterministicShuffle(
        [...splitLetters(exercise.answer, exercise.digraphsAsUnits), ...exercise.extraLetters].map(
          (text, index) => ({ id: `${index}-${text}`, text }),
        ),
        `${exercise.id}-${shuffleSeed}`,
      ),
    [exercise, shuffleSeed],
  );
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds([]);
  }, [exercise.id]);

  if (draft.kind !== 'text') return null;
  const chosen = ids.map((id) => source.find((tile) => tile.id === id)).filter(Boolean) as WordTile[];
  const available = source.filter((tile) => !ids.includes(tile.id));

  const update = (next: string[]) => {
    setIds(next);
    onChange({
      kind: 'text',
      value: next
        .map((id) => source.find((tile) => tile.id === id)?.text ?? '')
        .join(''),
    });
  };

  return (
    <div>
      {exercise.context && (
        <p className="mb-4 text-center text-[var(--text-muted)]">{exercise.context}</p>
      )}
      <TileArea
        label="Собранное слово"
        tiles={chosen}
        empty="Соберите форму из букв"
        disabled={disabled}
        onPick={(tile) => update(ids.filter((id) => id !== tile.id))}
        onReorder={update}
      />
      <div className="mt-5 flex min-h-20 flex-wrap content-start justify-center gap-2">
        {available.map((tile) => (
          <WordTileButton
            key={tile.id}
            tile={tile}
            disabled={disabled}
            onClick={() => update([...ids, tile.id])}
          />
        ))}
      </div>
    </div>
  );
}

function Matching({
  exercise,
  draft,
  disabled,
  shuffleSeed,
  onChange,
}: {
  exercise: MatchingExercise;
  draft: ExerciseDraft;
  disabled: boolean;
  shuffleSeed: string;
  onChange: (draft: ExerciseDraft) => void;
}) {
  if (draft.kind !== 'pairs') return null;
  const pairs = deterministicShuffle(
    exercise.pairs.map((pair) => ({ ...pair, id: pair.left })),
    `${exercise.id}-${shuffleSeed}-rows`,
  );
  const choices = deterministicShuffle(
    [...new Set([
      ...exercise.pairs.map((pair) => pair.right),
      ...exercise.distractorsRight,
    ])].map((text) => ({ id: text, text })),
    `${exercise.id}-${shuffleSeed}-choices`,
  );
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)]">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] bg-[var(--bg-sunken)] px-4 py-3 text-sm font-bold">
        <span>{exercise.leftLabel}</span>
        <span>{exercise.rightLabel}</span>
      </div>
      {pairs.map((pair) => (
        <label
          key={pair.left}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 border-t border-[var(--line)] px-4 py-3"
        >
          <b className="font-display text-lg">{pair.left}</b>
          <select
            value={draft.values[pair.left] ?? ''}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                kind: 'pairs',
                values: { ...draft.values, [pair.left]: event.target.value },
              })
            }
            className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2"
          >
            <option value="">Выберите…</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.text}>{choice.text}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function FillBlank({
  exercise,
  draft,
  disabled,
  onChange,
}: {
  exercise: FillBlankExercise;
  draft: ExerciseDraft;
  disabled: boolean;
  onChange: (draft: ExerciseDraft) => void;
}) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [activeBlank, setActiveBlank] = useState(
    exercise.blanks[0]?.id ?? '',
  );
  if (draft.kind !== 'blanks') return null;

  const insertCharacter = (character: string) => {
    const id = activeBlank || exercise.blanks[0]?.id;
    if (!id) return;
    const input = inputs.current[id];
    const inserted = insertAtCursor(
      draft.values[id] ?? '',
      character,
      input?.selectionStart ?? null,
      input?.selectionEnd ?? null,
    );
    onChange({
      kind: 'blanks',
      values: { ...draft.values, [id]: inserted.value },
    });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  };

  return (
    <div>
      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-5 py-6 font-display text-xl leading-[2.5]">
        {exercise.segments.map((segment, index) =>
          segment.kind === 'text' ? (
            <span key={index}>{segment.text}</span>
          ) : (
            <input
              key={segment.id}
              ref={(element) => {
                inputs.current[segment.id] = element;
              }}
              value={draft.values[segment.id] ?? ''}
              disabled={disabled}
              autoCapitalize="none"
              onFocus={() => setActiveBlank(segment.id)}
              onChange={(event) =>
                onChange({
                  kind: 'blanks',
                  values: {
                    ...draft.values,
                    [segment.id]: event.target.value,
                  },
                })
              }
              aria-label="Впишите пропущенную форму"
              className="mx-1 inline-block w-36 border-0 border-b-2 border-[var(--accent)] bg-transparent px-2 py-1 text-center font-sans text-lg outline-none"
            />
          ),
        )}
      </div>
      <SerbianKeyboard onInsert={insertCharacter} disabled={disabled} />
    </div>
  );
}

function ImageDescription({
  exercise,
  draft,
  disabled,
  shuffleSeed,
  onChange,
}: {
  exercise: ImageDescriptionExercise;
  draft: ExerciseDraft;
  disabled: boolean;
  shuffleSeed: string;
  onChange: (draft: ExerciseDraft) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  const insertCharacter = (character: string) => {
    if (draft.kind !== 'text') return;
    const inserted = insertAtCursor(
      draft.value,
      character,
      textarea.current?.selectionStart ?? null,
      textarea.current?.selectionEnd ?? null,
    );
    onChange({ kind: 'text', value: inserted.value });
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  };

  return (
    <div>
      <img
        src={exercise.image.path.replace(/^assets\//, '/')}
        alt={exercise.image.altText}
        className="aspect-[4/3] w-full rounded-xl object-cover"
        style={{
          objectPosition: `${(exercise.image.focalPoint?.x ?? 0.5) * 100}% ${(exercise.image.focalPoint?.y ?? 0.5) * 100}%`,
        }}
      />
      <div className="mt-5">
        {exercise.mode === 'choose' ? (
          <ChoiceExercise
            exercise={{ ...exercise, type: 'multiple_choice', multi: false, options: exercise.options ?? [] }}
            draft={draft}
            disabled={disabled}
            shuffleSeed={shuffleSeed}
            onChange={onChange}
          />
        ) : draft.kind === 'text' ? (
          <textarea
            ref={textarea}
            value={draft.value}
            disabled={disabled}
            onChange={(event) => onChange({ kind: 'text', value: event.target.value })}
            rows={3}
            className="w-full rounded-xl border-2 border-[var(--line)] bg-[var(--bg-raised)] p-4 text-lg focus:border-[var(--accent)]"
            placeholder="Опишите изображение по-сербски"
          />
        ) : null}
        {exercise.mode !== 'choose' && draft.kind === 'text' && (
          <SerbianKeyboard onInsert={insertCharacter} disabled={disabled} />
        )}
      </div>
    </div>
  );
}

function TileArea({
  label,
  tiles,
  empty,
  disabled,
  onPick,
  onReorder,
}: {
  label: string;
  tiles: WordTile[];
  empty: string;
  disabled: boolean;
  onPick: (tile: WordTile) => void;
  onReorder: (ids: string[]) => void;
}) {
  const reorder = (dragged: string, target: string) => {
    const next = tiles.map((tile) => tile.id);
    const from = next.indexOf(dragged);
    const to = next.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    next.splice(from, 1);
    next.splice(to, 0, dragged);
    onReorder(next);
  };

  return (
    <div className="min-h-32 rounded-xl border-2 border-dashed border-[var(--line)] bg-[var(--bg-raised)] p-4">
      <p className="mb-3 text-xs font-bold uppercase text-[var(--text-muted)]">{label}</p>
      {tiles.length === 0 ? (
        <p className="py-5 text-center text-sm text-[var(--text-muted)]">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tiles.map((tile) => (
            <WordTileButton
              key={tile.id}
              tile={tile}
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(event) => event.dataTransfer.setData('text/plain', tile.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                reorder(event.dataTransfer.getData('text/plain'), tile.id);
              }}
              onClick={() => onPick(tile)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WordTileButton({
  tile,
  ...props
}: { tile: WordTile } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2 font-display text-lg font-bold shadow-[0_3px_0_0_var(--line)] transition-colors hover:border-[var(--accent)]"
      {...props}
    >
      {tile.text}
    </button>
  );
}

export function Feedback({ result }: { result: Evaluation }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      className={[
        'mt-7 border-l-4 px-5 py-4',
        result.correct
          ? 'border-[#2f7d58] bg-[#2f7d58]/10'
          : 'border-[var(--accent)] bg-[var(--accent)]/10',
      ].join(' ')}
    >
      <h2 className="text-xl">{result.correct ? 'Верно' : 'Разберём ошибку'}</h2>
      {!result.correct && (
        <p className="mt-2">
          Правильный ответ: <b className="text-[var(--accent)]">{result.correctDisplay}</b>
        </p>
      )}
      <p className="mt-3 leading-relaxed text-[var(--text-muted)]">{result.explanation}</p>
    </motion.div>
  );
}

function LessonResult({
  lesson,
  firstTryCorrect,
  threshold,
}: {
  lesson: CourseLessonModel;
  firstTryCorrect: number;
  threshold: number;
}) {
  const score = firstTryCorrect / lesson.exercises.length;
  const passed = score >= threshold;
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-xl flex-col items-center justify-center px-5 py-10 text-center"
    >
      <CourseSprite state="lessonComplete" size={220} />
      <h1 className="mt-5 text-3xl">{passed ? 'Урок пройден' : 'Урок завершён'}</h1>
      <p className="mt-3 text-lg text-[var(--text-muted)]">
        С первой попытки: {firstTryCorrect} из {lesson.exercises.length} ({Math.round(score * 100)}%)
      </p>
      {!passed && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Для прохождения нужно {Math.round(threshold * 100)}%. Урок можно повторить сразу.
        </p>
      )}
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
        <Link to="/course" className="flex-1">
          <Button className="w-full" size="lg">К карте курса</Button>
        </Link>
        {!passed && (
          <Button className="flex-1" size="lg" variant="secondary" onClick={() => window.location.reload()}>
            Повторить
          </Button>
        )}
      </div>
    </motion.section>
  );
}

export function initialDraft(exercise: Exercise): ExerciseDraft {
  switch (exercise.type) {
    case 'multiple_choice':
    case 'ending_picker':
      return { kind: 'choice', ids: [] };
    case 'sentence_builder':
      return { kind: 'order', ids: [] };
    case 'letter_unscramble':
      return { kind: 'text', value: '' };
    case 'matching':
      return { kind: 'pairs', values: {} };
    case 'fill_blank':
      return { kind: 'blanks', values: {} };
    case 'image_description':
      return exercise.mode === 'choose'
        ? { kind: 'choice', ids: [] }
        : { kind: 'text', value: '' };
    case 'reading_qa':
      return { kind: 'pairs', values: {} };
    case 'form_hunt':
      return { kind: 'choice', ids: [] };
  }
}

export function createSessionSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `${values[0]}-${values[1]}`;
}

function deterministicShuffle<T extends { id: string }>(items: T[], seed: string): T[] {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const target = Math.abs(state) % (index + 1);
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export function exerciseTypeLabel(type: Exercise['type']): string {
  return {
    multiple_choice: 'Выберите ответ',
    ending_picker: 'Подберите окончание',
    sentence_builder: 'Составьте предложение',
    letter_unscramble: 'Соберите слово',
    matching: 'Найдите пары',
    fill_blank: 'Заполните пропуск',
    image_description: 'Опишите изображение',
    reading_qa: 'Прочитайте и ответьте',
    form_hunt: 'Найдите формы в тексте',
  }[type];
}

function richText(text: string) {
  return text.split(/(\*[^*]+\*)/u).map((part, index) =>
    part.startsWith('*') && part.endsWith('*') ? (
      <strong key={index} className="text-[var(--accent)]">{part.slice(1, -1)}</strong>
    ) : (
      part
    ),
  );
}

function highlight(text: string, fragment?: string) {
  if (!fragment) return text;
  const start = text.indexOf(fragment);
  if (start < 0) return text;
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-gold/35 text-inherit">{fragment}</mark>
      {text.slice(start + fragment.length)}
    </>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden="true">
      <path d="M6.4 5L5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" />
    </svg>
  );
}
