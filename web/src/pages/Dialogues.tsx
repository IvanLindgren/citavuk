import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { HiSpeakerWave } from 'react-icons/hi2';

import { listDialogues, type PublicDialogue } from '../api/dialogues';
import { loadCourse, loadProgress, syncCourseProgress } from '../course/data';
import type { DialogueProgress } from '../course/types';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

export function Dialogues() {
  const { account } = useAuth();
  const reduceMotion = useReducedMotion();
  const [progress, setProgress] = useState<DialogueProgress | null>(null);
  const [lessons, setLessons] = useState<PublicDialogue[]>([]);

  useSeo({
    title: 'Игровые диалоги на сербском — Читавук',
    description:
      'Озвученные игровые диалоги на сербском с выбором реплик, переводом слов и синхронизацией прогресса.',
  });

  useEffect(() => {
    let active = true;
    void loadCourse().then(async (course) => {
      let stored = loadProgress(course);
      if (account) {
        try {
          stored = await syncCourseProgress(course);
        } catch {
          // Локальный прогресс остаётся доступен без сети.
        }
      }
      if (active) setProgress(stored.dialogues?.drinkit ?? null);
    });
    return () => {
      active = false;
    };
  }, [account]);

  // Диалоги преподавателей — часть того же раздела, а не отдельного мира.
  // Отбор делает сервер: сюда попадают только опубликованные уроки.
  useEffect(() => {
    const controller = new AbortController();
    void listDialogues(controller.signal)
      .then(setLessons)
      // Молча: без сети раздел остаётся с встроенным диалогом, и это лучше,
      // чем красное сообщение об ошибке над работающей страницей.
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const action = progress?.status === 'completed'
    ? 'Пройти снова'
    : progress
      ? 'Продолжить'
      : 'Начать';

  return (
    <main className="paper-grain relative min-h-[calc(100dvh-4rem)] px-4 py-10 sm:px-5 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="max-w-3xl">
          <p className="text-sm font-bold uppercase text-[var(--accent)]">Бета</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">Игровые диалоги</h1>
          <p className="mt-4 text-lg leading-relaxed text-[var(--text-muted)]">
            Слушайте живую сербскую речь, выбирайте ответ Читавука и нажимайте
            на незнакомые слова, чтобы перевести и сохранить их.
          </p>
        </header>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-9 max-w-3xl"
        >
          <Link
            to="/dialogues/drinkit"
            className="group grid overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-lift)] transition-transform hover:-translate-y-1 sm:grid-cols-[15rem_1fr]"
          >
            <div className="relative min-h-56 overflow-hidden bg-[var(--bg-sunken)]">
              <img
                src="/img/marja-spilberic.png"
                alt="Марья Спилберич"
                className="absolute inset-0 size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <span className="absolute left-3 top-3 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold uppercase text-white">
                Доступен всем
              </span>
            </div>
            <div className="flex min-w-0 flex-col justify-center p-6 sm:p-8">
              <div className="flex items-center gap-2 text-sm font-bold uppercase text-[var(--accent)]">
                <HiSpeakerWave aria-hidden="true" />
                Озвученный диалог
              </div>
              <h2 className="mt-3 text-3xl">Дорога к Дринкиту</h2>
              <p className="mt-1 font-display text-xl text-[var(--text-muted)]">
                Put do Drinkita
              </p>
              <p className="mt-4 leading-relaxed text-[var(--text-muted)]">
                Помогите Марье найти кофейню, которой в Сербии не существует.
                У каждого решения есть последствия.
              </p>
              <span className="mt-6 font-bold text-[var(--accent)]">{action} →</span>
            </div>
          </Link>
        </motion.div>

        {!account && (
          <p className="mt-6 max-w-3xl rounded-2xl bg-[var(--bg-sunken)] p-4 text-sm text-[var(--text-muted)]">
            Играть можно без регистрации. Войдите в аккаунт, чтобы продолжать
            диалог с того же места на другом устройстве.
          </p>
        )}

        {lessons.length > 0 && (
          <section className="mt-14">
            <h2 className="text-2xl sm:text-3xl">Диалоги преподавателей</h2>
            <p className="mt-2 max-w-3xl text-[var(--text-muted)]">
              Сценарии из уроков, которые ведут преподаватели Читавука.
              Открывается сразу разговор, а из него — весь урок на эту тему.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {lessons.map((dialogue) => (
                <LessonDialogueCard key={dialogue.slug} dialogue={dialogue} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function LessonDialogueCard({ dialogue }: { dialogue: PublicDialogue }) {
  return (
    // Диалог, а не урок: нажавшему на карточку разговора теория и десяток
    // заданий перед ним — не то, на что он нажимал.
    <Link
      to={`/lessons/${dialogue.slug}?stage=dialogue`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] transition-transform hover:-translate-y-1"
    >
      {dialogue.coverUrl && (
        <img
          src={dialogue.coverUrl}
          alt=""
          loading="lazy"
          className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-[var(--accent)]">
          <HiSpeakerWave aria-hidden="true" />
          {dialogue.level}
          <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
          <span className="text-[var(--text-muted)]">{linesLabel(dialogue.lines)}</span>
        </div>
        <h3 className="mt-2 text-lg leading-snug">{dialogue.title}</h3>
        {dialogue.summary && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--text-muted)]">
            {dialogue.summary}
          </p>
        )}
        <p className="mt-auto pt-4 text-sm text-[var(--text-muted)]">{dialogue.authorName}</p>
      </div>
    </Link>
  );
}

/** «1 реплика», «2 реплики», «5 реплик» — три формы, иначе читается небрежно. */
function linesLabel(lines: number): string {
  const word =
    lines % 100 >= 11 && lines % 100 <= 14
      ? 'реплик'
      : lines % 10 === 1
        ? 'реплика'
        : lines % 10 >= 2 && lines % 10 <= 4
          ? 'реплики'
          : 'реплик';
  return `${lines} ${word}`;
}
