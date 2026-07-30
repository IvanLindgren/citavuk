import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { CourseSprite } from '../course/CourseSprite';
import {
  lessonUnlocked,
  loadCourse,
  loadProgress,
  syncCourseProgress,
} from '../course/data';
import {
  courseSoundsMuted,
  playCourseSound,
  preloadCourseSounds,
  setCourseSoundsMuted,
} from '../course/sounds';
import type { CourseBundle, CourseProgress } from '../course/types';
import { Button, Spinner } from '../components/ui';
import { Link } from '../lib/router';
import { useAuth } from '../state/auth';
import { useSeo } from '../lib/seo';

export function Course() {
  useSeo({
    title: 'Курс сербской грамматики с нуля — Читавук',
    description:
      'Уровни от письменности до падежей и времён: коротко теория, дальше упражнения. Сербская кириллица и латиница, склонение, спряжение, порядок слов.',
  });

  const { account } = useAuth();
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(courseSoundsMuted);

  useEffect(() => {
    preloadCourseSounds();
  }, []);

  useEffect(() => {
    let active = true;
    void loadCourse()
      .then((course) => {
        if (!active) return;
        setBundle(course);
        setProgress(loadProgress(course));
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Не удалось загрузить курс.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!bundle) return;
    const refresh = () => setProgress(loadProgress(bundle));
    window.addEventListener('citavuk-course-progress', refresh);
    return () => window.removeEventListener('citavuk-course-progress', refresh);
  }, [bundle]);

  useEffect(() => {
    if (!bundle || !account) return;
    void syncCourseProgress(bundle)
      .then(setProgress)
      .catch(() => {
        // Офлайн открываем локальный прогресс без блокировки курса.
      });
  }, [account, bundle]);

  if (!account) return <CourseSignIn />;
  if (error) return <CourseError message={error} />;
  if (!bundle || !progress) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--text-muted)]">
        <Spinner className="size-6" />
      </div>
    );
  }

  const lessons = bundle.units.flatMap((unit) =>
    unit.skills.flatMap((skill) => skill.lessons),
  );
  const completed = lessons.filter((lesson) =>
    isDone(progress.lessons[lesson.id]?.status),
  ).length;
  const percent = lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100);

  return (
    <main className="course-page pb-20">
      <section className="border-b border-[var(--line)] bg-[var(--bg-raised)] px-5 py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-center">
          <CourseSprite state="idle" size={128} className="mx-auto sm:mx-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-sm font-bold uppercase text-[var(--accent)]">
                  Игровой курс
                </p>
                <h1 className="text-3xl sm:text-4xl">{bundle.title}</h1>
                <p className="mt-2 text-[var(--text-muted)]">Пройдено {percent}%</p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-[var(--line)] p-2.5 text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                aria-label={muted ? 'Включить звуки курса' : 'Выключить звуки курса'}
                title={muted ? 'Включить звуки' : 'Выключить звуки'}
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  setCourseSoundsMuted(next);
                  if (!next) playCourseSound('correct');
                }}
              >
                <SoundIcon muted={muted} />
              </button>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
              <motion.div
                className="h-full bg-[var(--accent)]"
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.55 }}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <Stat label="Серия" value={`${progress.streak.currentDays} дн.`} />
              <Stat label="Опыт" value={`${progress.xp}`} />
              <Stat label="Уроки" value={`${completed}/${lessons.length}`} />
            </div>
            {/* Тренажёрка стоит рядом с прогрессом, а не в конце карты: к ней
                обращаются, когда конкретная тема не даётся, и искать её внизу
                после сорока уроков было бы странно. */}
            <Link
              to="/trainer"
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 font-semibold transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Тренажёрка по темам
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-9">
        <DialoguePromo status={progress.dialogues?.drinkit?.status} />
        {bundle.units.map((unit, unitIndex) => (
          <CourseUnitPath
            key={unit.id}
            unit={unit}
            unitIndex={unitIndex}
            progress={progress}
          />
        ))}
      </div>
    </main>
  );
}

function CourseUnitPath({
  unit,
  unitIndex,
  progress,
}: {
  unit: CourseBundle['units'][number];
  unitIndex: number;
  progress: CourseProgress;
}) {
  const reduceMotion = useReducedMotion();
  let lessonNumber = 0;

  return (
    <section className="mb-12">
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        className="course-unit-band relative overflow-hidden rounded-2xl bg-[var(--accent)] px-6 py-6 text-parchment shadow-[var(--shadow-lift)] sm:px-8"
      >
        <p className="text-sm font-bold uppercase opacity-75">Раздел {unitIndex + 1}</p>
        <h2 className="mt-1 text-3xl text-inherit">{unit.title}</h2>
        <p className="mt-2 max-w-3xl leading-relaxed text-parchment/85">
          {unit.description}
        </p>
      </motion.header>

      <div className="relative mx-auto mt-7 max-w-2xl">
        <div
          className="absolute bottom-8 left-1/2 top-8 w-1 -translate-x-1/2 rounded-full bg-[var(--line)]"
          aria-hidden="true"
        />
        {unit.skills.map((skill) => (
          <div key={skill.id} className="relative">
            <h3 className="mx-auto my-6 w-fit rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-center text-sm font-bold text-[var(--text-muted)]">
              {skill.title}
            </h3>
            {skill.lessons.map((lesson) => {
              const index = lessonNumber++;
              const unlocked = lessonUnlocked(lesson, progress);
              const result = progress.lessons[lesson.id];
              return (
                <LessonNode
                  key={lesson.id}
                  lesson={lesson}
                  side={index % 2 === 0 ? 'left' : 'right'}
                  unlocked={unlocked}
                  completed={isDone(result?.status)}
                  score={result?.bestScore ?? 0}
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function LessonNode({
  lesson,
  side,
  unlocked,
  completed,
  score,
}: {
  lesson: CourseBundle['units'][number]['skills'][number]['lessons'][number];
  side: 'left' | 'right';
  unlocked: boolean;
  completed: boolean;
  score: number;
}) {
  const reduceMotion = useReducedMotion();
  const node = (
    <motion.div
      whileHover={reduceMotion || !unlocked ? undefined : { y: -4, scale: 1.025 }}
      whileTap={unlocked ? { y: 3 } : undefined}
      className={[
        'course-lesson-node relative z-10 flex size-20 items-center justify-center rounded-full border-4',
        'shadow-[0_7px_0_0_color-mix(in_srgb,var(--accent)_55%,black)] transition-colors',
        completed
          ? 'border-[#f3cf6a] bg-[#2f7d58] text-white'
          : unlocked
            ? 'border-[var(--accent-hover)] bg-[var(--accent)] text-white'
            : 'border-[var(--line)] bg-[var(--bg-sunken)] text-[var(--text-muted)] shadow-[0_7px_0_0_var(--line)]',
      ].join(' ')}
      aria-hidden="true"
    >
      {completed ? <CheckIcon /> : unlocked ? <StarIcon /> : <LockIcon />}
    </motion.div>
  );

  return (
    <div
      className={[
        'relative mb-8 flex min-h-28 items-center gap-4',
        side === 'left' ? 'flex-row justify-start' : 'flex-row-reverse justify-start',
      ].join(' ')}
    >
      {unlocked ? (
        <Link
          to={`/course/lesson/${lesson.id}`}
          className="group flex max-w-[calc(50%+2.5rem)] items-center gap-4"
          aria-label={`${completed ? 'Повторить' : 'Начать'} урок ${lesson.title}`}
        >
          {node}
          <LessonLabel lesson={lesson} completed={completed} score={score} />
        </Link>
      ) : (
        <div className="flex max-w-[calc(50%+2.5rem)] items-center gap-4 opacity-70">
          {node}
          <LessonLabel lesson={lesson} completed={false} score={0} />
        </div>
      )}
    </div>
  );
}

function LessonLabel({
  lesson,
  completed,
  score,
}: {
  lesson: CourseBundle['units'][number]['skills'][number]['lessons'][number];
  completed: boolean;
  score: number;
}) {
  return (
    <div className="min-w-0">
      <p className="font-display text-base font-bold leading-snug">{lesson.title}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {completed
          ? `Лучший результат ${Math.round(score * 100)}%`
          : lesson.isCheckpoint
            ? 'Контрольная'
            : `${lesson.exercises.length} упражнений`}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2">
      <span className="text-[var(--text-muted)]">{label}: </span>
      <b>{value}</b>
    </span>
  );
}

function CourseSignIn() {
  return (
    <main className="flex min-h-[70vh] items-center px-5 py-12">
      <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-[1fr_1.25fr]">
        <CourseSprite state="idle" size={260} className="mx-auto" />
        <div>
          <p className="text-sm font-bold uppercase text-[var(--accent)]">Курс грамматики</p>
          <h1 className="mt-2 text-4xl">Прогресс должен быть вашим</h1>
          <p className="mt-4 text-lg leading-relaxed text-[var(--text-muted)]">
            Для занятий нужен аккаунт: он сохранит результаты уроков. Чтение и
            перевод по-прежнему доступны без регистрации.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/login?mode=register">
              <Button size="lg">Создать аккаунт</Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="secondary">Войти</Button>
            </Link>
          </div>
          <Link
            to="/dialogues"
            className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/8 px-4 py-3 font-semibold text-[var(--accent)]"
          >
            <img
              src="/img/marja-spilberic.png"
              alt=""
              className="size-9 rounded-xl object-cover object-top"
            />
            Открыть игровые диалоги
          </Link>
        </div>
      </div>
    </main>
  );
}

function DialoguePromo({ status }: { status?: string }) {
  return (
    <div className="mb-9">
      <Link
        to="/dialogues"
        className="inline-flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--accent)]/35 bg-[var(--bg-raised)] px-4 py-2.5 font-semibold shadow-[var(--shadow-soft)] transition-colors hover:border-[var(--accent)]"
      >
        <img
          src="/img/marja-spilberic.png"
          alt=""
          className="size-10 rounded-xl border border-[var(--line)] object-cover object-top"
        />
        <span>
          Игровые диалоги
          <span className="ml-2 text-sm text-[var(--accent)]">
            {status === 'completed' ? 'Открыть' : status ? 'Продолжить' : 'Смотреть'} →
          </span>
        </span>
      </Link>
    </div>
  );
}

function CourseError({ message }: { message: string }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
      <CourseSprite state="incorrect" size={150} />
      <h1 className="mt-5 text-2xl">Курс пока не открылся</h1>
      <p className="mt-3 text-[var(--text-muted)]">{message}</p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        Повторить
      </Button>
    </main>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4zm11.5.2v5.6a4 4 0 000-5.6z" />
      {muted && <path d="M17.4 8L16 9.4l2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4-2.1-2.1L23 9.4 21.6 8l-2.1 2.1z" />}
    </svg>
  );
}

function isDone(status?: string): boolean {
  return status === 'completed' || status === 'mastered' || status === 'needsReview';
}

function StarIcon() {
  return <svg viewBox="0 0 24 24" className="size-9 fill-current"><path d="M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" className="size-9 fill-current"><path d="M9.2 17.4L4.8 13l2-2 2.4 2.4 7.9-7.9 2 2z" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" className="size-8 fill-current"><path d="M7 10V7a5 5 0 0110 0v3h2v11H5V10zm2 0h6V7a3 3 0 00-6 0z" /></svg>;
}
