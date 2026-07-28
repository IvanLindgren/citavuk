import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import { CourseSprite } from '../course/CourseSprite';
import {
  canEvaluate,
  evaluate,
  loadCourse,
  type ExerciseDraft,
} from '../course/data';
import { playCourseSound, preloadCourseSounds } from '../course/sounds';
import type {
  CourseBundle,
  Evaluation,
  Exercise,
} from '../course/types';
import { Button, Card, Spinner } from '../components/ui';
import { Link, useQuery, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import {
  createSessionSeed,
  exerciseTypeLabel,
  ExerciseView,
  Feedback,
  initialDraft,
} from './CourseLesson';

/**
 * Тренажёрка: упражнения по выбранной теме грамматики, без уроков и без
 * порядка прохождения.
 *
 * Чем она отличается от курса
 * ---------------------------
 * Курс ведёт по программе: урок открывается после предыдущего, теория идёт
 * перед заданиями. Тренажёрка нужна ровно в обратной ситуации — когда человек
 * уже знает, что у него хромает падеж, и хочет добить именно его. Поэтому темы
 * здесь открыты все и сразу, а прогресс уроков не трогается: иначе
 * «пройденный» урок означал бы то разобранную теорию, то удачную серию ответов.
 *
 * Движок упражнений тот же самый, что в уроке ([ExerciseView], [evaluate]).
 * Своя копия разошлась бы с курсом на первой же правке.
 */

/** Сколько заданий в одном заходе. Больше двенадцати уже утомляет. */
const ROUND_SIZE = 10;

interface Topic {
  id: string;
  title: string;
  unitTitle: string;
  exercises: Exercise[];
}

export function Trainer() {
  const { navigate } = useRouter();
  const query = useQuery();
  const topicId = query.topic ?? '';

  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [error, setError] = useState('');

  useSeo({
    title: 'Тренажёрка по сербской грамматике: падежи, глаголы, местоимения',
    description:
      'Упражнения по выбранной теме сербской грамматики без прохождения курса. Падежи, спряжение, вид глагола, местоимения, порядок слов. Разбор ошибки после каждого ответа.',
  });

  useEffect(() => {
    preloadCourseSounds();
  }, []);

  useEffect(() => {
    let active = true;
    void loadCourse()
      .then((course) => {
        if (active) setBundle(course);
      })
      .catch(() => {
        if (active) setError('Не удалось загрузить упражнения.');
      });
    return () => {
      active = false;
    };
  }, []);

  const topics = useMemo(() => (bundle ? collectTopics(bundle) : []), [bundle]);

  if (error) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <CourseSprite state="incorrect" size={150} />
        <h1 className="mt-5 text-2xl">{error}</h1>
      </main>
    );
  }

  if (!bundle) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  // «Всё вперемешку» — не раздел курса, а собранная на лету тема из всех
  // упражнений сразу.
  const topic =
    topicId === 'all'
      ? {
          id: 'all',
          title: 'Всё вперемешку',
          unitTitle: '',
          exercises: topics.flatMap((item) => item.exercises),
        }
      : topics.find((item) => item.id === topicId);

  if (topicId && topic) {
    return (
      <Round
        topic={topic}
        onExit={() => navigate('/trainer')}
      />
    );
  }

  return <TopicPicker topics={topics} />;
}

/**
 * Темы — это разделы курса (skill), а не уроки: «Винительный падеж» полезнее
 * как одна тема, чем как три урока с разными сторонами одного правила.
 */
function collectTopics(bundle: CourseBundle): Topic[] {
  const topics: Topic[] = [];
  for (const unit of bundle.units) {
    for (const skill of unit.skills) {
      const exercises = skill.lessons.flatMap((lesson) => lesson.exercises);
      if (exercises.length === 0) continue;
      topics.push({
        id: skill.id,
        title: skill.title,
        unitTitle: unit.title,
        exercises,
      });
    }
  }
  return topics;
}

function TopicPicker({ topics }: { topics: Topic[] }) {
  const byUnit = useMemo(() => {
    const groups = new Map<string, Topic[]>();
    for (const topic of topics) {
      const group = groups.get(topic.unitTitle) ?? [];
      group.push(topic);
      groups.set(topic.unitTitle, group);
    }
    return [...groups.entries()];
  }, [topics]);

  const total = topics.reduce((sum, topic) => sum + topic.exercises.length, 0);

  return (
    <main className="px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <CourseSprite state="thinking" size={112} className="shrink-0" />
          <div>
            <h1 className="text-3xl sm:text-4xl">Тренажёрка</h1>
            <p className="mt-3 max-w-2xl leading-relaxed text-[var(--text-muted)]">
              Выберите тему и решайте задания по ней подряд. Порядок уроков тут
              не действует: любая тема открыта сразу, даже если до неё в курсе
              вы ещё не дошли. Всего {total} упражнений.
            </p>
          </div>
        </header>

        <Card className="mb-8 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl">Всё вперемешку</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
              Задания из всех тем в случайном порядке. Хорошо показывает, что
              успело забыться.
            </p>
          </div>
          <Link to="/trainer?topic=all">
            <Button size="lg">Начать</Button>
          </Link>
        </Card>

        {byUnit.map(([unitTitle, unitTopics]) => (
          <section key={unitTitle} className="mb-10">
            <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {unitTitle}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {unitTopics.map((topic) => (
                <Link key={topic.id} to={`/trainer?topic=${topic.id}`}>
                  <Card className="h-full p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                    <h3 className="text-lg leading-snug">{topic.title}</h3>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      {topic.exercises.length}{' '}
                      {plural(topic.exercises.length, 'упражнение', 'упражнения', 'упражнений')}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function Round({ topic, onExit }: { topic: Topic; onExit: () => void }) {
  const [seed, setSeed] = useState(() => createSessionSeed());
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ExerciseDraft | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  // Набор пересобирается при смене seed: «Ещё раз» должен давать другие
  // задания, иначе тренировка превращается в заучивание порядка.
  const round = useMemo(
    () => pickRound(topic.exercises, seed),
    [topic.exercises, seed],
  );

  const exercise = round[step] ?? null;

  useEffect(() => {
    if (!exercise) return;
    setDraft(initialDraft(exercise));
    setEvaluation(null);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [exercise]);

  const restart = () => {
    setSeed(createSessionSeed());
    setStep(0);
    setCorrectCount(0);
    setDone(false);
  };

  if (done) {
    const score = round.length === 0 ? 0 : correctCount / round.length;
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-5 text-center">
        <CourseSprite state={score >= 0.8 ? 'correct' : 'thinking'} size={170} />
        <h1 className="mt-6 text-3xl">
          {correctCount} из {round.length}
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
          {score >= 0.8
            ? 'Тема держится уверенно. Можно взять следующую.'
            : 'Стоит вернуться к теории этой темы в курсе, а потом повторить заход.'}
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
          <Button className="flex-1" size="lg" onClick={restart}>
            Ещё раз
          </Button>
          <Button className="flex-1" size="lg" variant="secondary" onClick={onExit}>
            К списку тем
          </Button>
        </div>
      </main>
    );
  }

  if (!exercise || !draft) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const check = () => {
    const result = evaluate(exercise, draft);
    if (result.correct) setCorrectCount((value) => value + 1);
    setEvaluation(result);
    playCourseSound(result.correct ? 'correct' : 'incorrect');
  };

  const next = () => {
    if (step + 1 >= round.length) {
      playCourseSound('complete');
      setDone(true);
      return;
    }
    setStep((value) => value + 1);
  };

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)]">
      <div className="sticky top-16 z-30 border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"
          >
            Выйти
          </button>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
            <motion.div
              className="h-full rounded-full bg-[var(--accent)]"
              animate={{ width: `${((step + 1) / round.length) * 100}%` }}
              transition={{ duration: 0.35 }}
            />
          </div>
          <span className="w-14 text-right text-sm font-bold text-[var(--text-muted)]">
            {step + 1}/{round.length}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.section
          key={exercise.id}
          initial={{ opacity: 0, x: 22 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.25 }}
          className="mx-auto flex min-h-[calc(100dvh-8.5rem)] max-w-3xl flex-col px-5"
        >
          <div className="flex-1 py-8">
            <p className="text-sm font-bold uppercase text-[var(--accent)]">
              {topic.title} · {exerciseTypeLabel(exercise.type)}
            </p>
            <h1 className="mt-1 mb-7 text-2xl sm:text-3xl">{exercise.prompt}</h1>

            <ExerciseView
              exercise={exercise}
              draft={draft}
              disabled={evaluation !== null}
              shuffleSeed={seed}
              onChange={setDraft}
            />

            {evaluation && <Feedback result={evaluation} />}
          </div>

          <div className="sticky bottom-0 -mx-5 border-t border-[var(--line)] bg-[var(--bg)]/95 px-5 py-4 backdrop-blur">
            <Button
              className="w-full"
              size="lg"
              disabled={!evaluation && !canEvaluate(exercise, draft)}
              onClick={evaluation ? next : check}
            >
              {evaluation ? 'Дальше' : 'Проверить'}
            </Button>
          </div>
        </motion.section>
      </AnimatePresence>
    </main>
  );
}

/**
 * Отбирает задания на один заход.
 *
 * Порядок псевдослучайный от seed, а не от Math.random напрямую: набор должен
 * пережить перерисовку компонента, иначе задания менялись бы под руками при
 * каждом нажатии.
 */
function pickRound(exercises: Exercise[], seed: string): Exercise[] {
  let state = 2166136261;
  for (const char of seed) {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  }
  const pool = [...exercises];
  for (let index = pool.length - 1; index > 0; index--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const target = Math.abs(state) % (index + 1);
    [pool[index], pool[target]] = [pool[target]!, pool[index]!];
  }
  return pool
    .slice(0, ROUND_SIZE)
    .sort((left, right) => left.difficulty - right.difficulty);
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
