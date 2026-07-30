import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { HiSpeakerWave } from 'react-icons/hi2';

import { loadCourse, loadProgress, syncCourseProgress } from '../course/data';
import type { DialogueProgress } from '../course/types';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

export function Dialogues() {
  const { account } = useAuth();
  const reduceMotion = useReducedMotion();
  const [progress, setProgress] = useState<DialogueProgress | null>(null);

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

  const action = progress?.status === 'completed'
    ? 'Пройти снова'
    : progress
      ? 'Продолжить'
      : 'Начать';

  return (
    <main className="paper-grain min-h-[calc(100dvh-4rem)] px-4 py-10 sm:px-5 sm:py-14">
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
      </div>
    </main>
  );
}
