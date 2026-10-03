import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {recordStudy} from '../lib/study';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuArrowRight, LuBookOpen, LuDumbbell, LuKeyboard, LuLanguages, LuLayers, LuMic, LuPencilLine, LuShuffle, LuSwords, LuTarget } from 'react-icons/lu';

import { markRoadmapDone } from '../api/roadmap';
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
import {
  buildTrainerTopics,
  loadTrainerCatalog,
  type TrainerDomain,
  type TrainerTopic,
} from '../course/trainerCatalog';
import { Button, Spinner } from '../components/ui';
import { Link, useQuery, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAnnouncements } from '../state/announcements';
import { useAuth } from '../state/auth';
import {
  createSessionSeed,
  exerciseTypeLabel,
  ExerciseView,
  Feedback,
  initialDraft,
  ProgressBar,
} from './CourseLesson';
import { CountUp, Reveal, Shake } from '../components/motion';

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

type Topic = TrainerTopic;

export function Trainer() {
  const { navigate } = useRouter();
  const query = useQuery();
  const topicId = query.topic ?? '';

  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
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
    void Promise.all([loadCourse(), loadTrainerCatalog()])
      .then(([course, catalog]) => {
        if (!active) return;
        setBundle(course);
        setTopics(buildTrainerTopics(course, catalog));
      })
      .catch(() => {
        if (active) setError('Не удалось загрузить упражнения.');
      });
    return () => {
      active = false;
    };
  }, []);

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
  const allDomain = topicId.startsWith('all-')
    ? (topicId.slice(4) as TrainerDomain)
    : null;
  const topic =
    allDomain
      ? {
          id: `all-${allDomain}`,
          domain: allDomain,
          level: '',
          title: 'Всё вперемешку',
          summary: '',
          roadmapItemId: '',
          exercises: topics
            .filter((item) => item.domain === allDomain)
            .flatMap((item) => item.exercises),
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

export function TopicPicker({ topics }: { topics: Topic[] }) {
  const { account } = useAuth();
  const friend = Boolean(account?.supporterSince || account?.isAdmin);
  const reduced = useReducedMotion();
  const [domain, setDomain] = useState<TrainerDomain>('grammar');
  const byLevel = useMemo(() => {
    const groups = new Map<string, Topic[]>();
    for (const topic of topics.filter((item) => item.domain === domain)) {
      const group = groups.get(topic.level) ?? [];
      group.push(topic);
      groups.set(topic.level, group);
    }
    return [...groups.entries()];
  }, [domain, topics]);

  const activeTopics = topics.filter((topic) => topic.domain === domain);
  const total = activeTopics.reduce((sum, topic) => sum + topic.exercises.length, 0);

  return (
    <main className="pb-16">
      {/* Шапка без маскота: большой волк рядом с заголовком ничего не
          сообщал и съедал первый экран. Вместо него — буквы, которых нет в
          русском, и цифры, по которым видно, сколько тут работы. */}
      <section className="relative overflow-hidden border-b border-[var(--line)] bg-gradient-to-br from-[var(--bg-raised)] via-[var(--bg)] to-[var(--bg-sunken)] px-5 pb-10 pt-12 sm:pt-16">
        <FloatingLetters />
        <div className="relative mx-auto max-w-5xl">
          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-4xl sm:text-6xl"
          >
            Тренажёрка
          </motion.h1>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-3 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]"
          >
            Выбери тему или играй вперемешку.
          </motion.p>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mt-6 flex flex-wrap gap-2"
          >
            <Stat icon={LuDumbbell}>
              <b><CountUp value={total} /></b> <span>упражнений</span>
            </Stat>
            <Stat icon={LuLayers}>
              <b><CountUp value={activeTopics.length} /></b> <span>тем</span>
            </Stat>
            <Stat icon={LuTarget}>
              <span>Уровни</span> <b>{byLevel.map(([level]) => level).filter(Boolean).join(', ') || 'A1–C2'}</b>
            </Stat>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 pt-8">
        <div className="relative mb-8 grid grid-cols-3 gap-1 rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] p-1.5">
          {DOMAIN_OPTIONS.map((item) => {
            const Icon = item.icon;
            const active = item.id === domain;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setDomain(item.id)}
                className={`relative flex min-h-12 items-center justify-center gap-1 rounded-xl px-1 text-xs font-bold transition-colors sm:gap-2 sm:px-2 sm:text-base ${active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
              >
                {active && (
                  <motion.span
                    layoutId="trainer-domain"
                    className="absolute inset-0 rounded-xl bg-[var(--bg-raised)] shadow-sm"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon className="relative size-4 shrink-0" />
                <span className="relative whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mb-10 grid gap-3 md:grid-cols-2">
          <Reveal>
            <Link to="/trainer/translation-duel" className="group block h-full">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--accent)] to-[#7a1f1a] p-6 text-parchment shadow-[var(--shadow-lift)] transition-transform duration-300 group-hover:-translate-y-1">
                <motion.span
                  aria-hidden="true"
                  className="absolute -right-6 -top-6 grid size-32 place-items-center rounded-full bg-white/10"
                  animate={reduced ? undefined : { rotate: [0, 8, -6, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <LuSwords className="size-14 opacity-60" />
                </motion.span>
                <h2 className="relative text-2xl text-parchment">Ты против переводчика</h2>
                <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-parchment/85">
                  Победи DeepL или Google Translate в трёх раундах. Судья — ты или ИИ.
                </p>
                <span className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-parchment px-4 py-2 text-sm font-bold text-[var(--accent)]">
                  Играть <LuArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </Reveal>
          <Reveal delay={0.06}>
            <Link to={`/trainer?topic=all-${domain}`} className="group block h-full">
              <div className="relative h-full overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--text)] p-6 text-[var(--bg)] shadow-[var(--shadow-lift)] transition-transform duration-300 group-hover:-translate-y-1">
                <motion.span
                  aria-hidden="true"
                  className="absolute -right-4 -top-4 grid size-28 place-items-center rounded-full bg-white/10"
                  animate={reduced ? undefined : { rotate: 360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                >
                  <LuShuffle className="size-12 opacity-60" />
                </motion.span>
                <h2 className="relative text-2xl text-[var(--bg)]">Всё вперемешку</h2>
                <p className="relative mt-2 max-w-sm text-sm leading-relaxed opacity-80">
                  Задания из всех тем в случайном порядке. Хорошо показывает, что
                  успело забыться.
                </p>
                <span className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink">
                  Начать <LuArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </Reveal>
          {friend && (
            <Reveal delay={0.1} className="md:col-span-2">
              <Link to={domain === 'grammar' ? '/padezi' : `/govori?mode=${domain === 'reading' ? 'speak' : 'write'}`} className="group block">
                <div className="flex items-center gap-4 rounded-3xl border border-gold/50 bg-gold/10 p-5 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[var(--accent)]">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/25 text-[var(--accent)]">
                    {domain === 'grammar' ? <LuKeyboard className="size-6" /> : domain === 'reading' ? <LuMic className="size-6" /> : <LuPencilLine className="size-6" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl">{domain === 'grammar' ? 'Падежи' : domain === 'reading' ? 'Говори!' : 'Пиши!'}</h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{domain === 'grammar' ? 'Склоняй слова на печатной машинке.' : domain === 'reading' ? 'Получи тему и ответь по-сербски.' : 'Получи тему и напиши короткий текст.'}</p>
                  </div>
                  <LuArrowRight className="size-5 shrink-0 text-[var(--accent)] transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            </Reveal>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={domain}
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {byLevel.map(([level, levelTopics]) => {
              const color = LEVEL_COLORS[level] ?? 'var(--accent)';
              return (
                <section key={level} className="mb-10">
                  <div className="mb-4 flex items-center gap-3">
                    <span
                      className="grid h-8 min-w-11 place-items-center rounded-full px-3 font-display text-sm font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {level || '—'}
                    </span>
                    <span className="h-px flex-1 bg-gradient-to-r from-[var(--line)] to-transparent" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {levelTopics.map((topic, index) => (
                      <Reveal key={topic.id} delay={Math.min(index, 8) * 0.04} className="h-full">
                        <Link to={`/trainer?topic=${topic.id}`} className="group block h-full">
                          <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-5 pl-6 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-lift)]">
                            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 transition-all duration-300 group-hover:w-2.5" style={{ backgroundColor: color }} />
                            <h3 className="text-lg leading-snug">{topic.title}</h3>
                            <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
                              {topic.summary}
                            </p>
                            <div className="mt-4 flex items-center justify-between">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-muted)]">
                                <LuDumbbell className="size-3.5" />
                                {topic.exercises.length}{' '}
                                {plural(topic.exercises.length, 'упражнение', 'упражнения', 'упражнений')}
                              </span>
                              <LuArrowRight className="size-4 -translate-x-1 text-[var(--accent)] opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                            </div>
                          </div>
                        </Link>
                      </Reveal>
                    ))}
                  </div>
                </section>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

const LEVEL_COLORS: Record<string, string> = {
  A1: '#2f7d58',
  A2: '#23867f',
  B1: '#3b6fb6',
  B2: '#5b4fb0',
  C1: '#8e44ad',
  C2: '#b03a2e',
};

function Stat({ icon: Icon, children }: { icon: typeof LuLayers; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg-raised)]/80 px-3.5 py-1.5 text-sm text-[var(--text-muted)] backdrop-blur">
      <Icon className="size-4 text-[var(--accent)]" />
      {children}
    </span>
  );
}

/** Буквы сербского алфавита, которых нет в русском, медленно плывут за заголовком. */
const LETTERS = ['Ђ', 'Ž', 'Ћ', 'Č', 'Џ', 'Š', 'Љ', 'Đ', 'Њ', 'Ć', 'Ј'];

function FloatingLetters() {
  const reduced = useReducedMotion();
  return (
    <div aria-hidden="true" translate="no" className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      {LETTERS.map((letter, index) => {
        const left = (index * 9.3 + 4) % 96;
        const top = ((index * 37) % 80) + 6;
        const size = 34 + ((index * 13) % 46);
        return (
          <motion.span
            key={letter}
            className="absolute font-display font-bold text-[var(--accent)]"
            style={{ left: `${left}%`, top: `${top}%`, fontSize: size, opacity: 0.07 + (index % 3) * 0.03 }}
            animate={reduced ? undefined : { y: [0, -14, 0], rotate: [0, index % 2 ? 6 : -6, 0] }}
            transition={{ duration: 6 + (index % 4), repeat: Infinity, ease: 'easeInOut', delay: index * 0.3 }}
          >
            {letter}
          </motion.span>
        );
      })}
    </div>
  );
}

const DOMAIN_OPTIONS: Array<{
  id: TrainerDomain;
  label: string;
  icon: typeof LuLanguages;
}> = [
  { id: 'grammar', label: 'Gramatika', icon: LuLanguages },
  { id: 'reading', label: 'Čitanje', icon: LuBookOpen },
  { id: 'writing', label: 'Pisanje', icon: LuPencilLine },
];

function Round({ topic, onExit }: { topic: Topic; onExit: () => void }) {
  const { account } = useAuth();
  const { refresh: refreshNotifications } = useAnnouncements();
  const reported = useRef(false);
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
    if (!done || reported.current || correctCount !== round.length) return;
    reported.current = true;
    if (!account || !topic.roadmapItemId) return;
    void markRoadmapDone('item', topic.roadmapItemId, true, 1, 'trainer')
      .then(() => refreshNotifications())
      .catch(() => undefined);
  }, [account, correctCount, done, refreshNotifications, round.length, topic]);

  useEffect(() => {
    if (!exercise) return;
    setDraft(initialDraft(exercise));
    setEvaluation(null);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [exercise]);

  const restart = () => {
    reported.current = false;
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
    if(result.correct)recordStudy('exercise',exercise.id);
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
          <ProgressBar value={((step + 1) / round.length) * 100} />
          <span className="w-14 text-right text-sm font-bold text-[var(--text-muted)]">
            {step + 1}/{round.length}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.section
          key={exercise.id}
          initial={{ opacity: 0, x: 36, filter: 'blur(4px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: -28, filter: 'blur(3px)' }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          className="mx-auto flex min-h-[calc(100dvh-8.5rem)] max-w-3xl flex-col px-5"
        >
          <div className="flex-1 py-8">
            <p className="text-sm font-bold uppercase text-[var(--accent)]">
              {topic.title}, {exerciseTypeLabel(exercise.type)}
            </p>
            <h1 className="mt-1 mb-7 text-2xl sm:text-3xl">{exercise.prompt}</h1>

            <Shake trigger={evaluation && !evaluation.correct ? exercise.id : ''} className="stagger-in">
              <ExerciseView
                exercise={exercise}
                draft={draft}
                disabled={evaluation !== null}
                shuffleSeed={seed}
                onChange={setDraft}
              />
            </Shake>

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
