import { useEffect, useState } from 'react';
import {
  LuArrowRight,
  LuBookOpen,
  LuCheck,
  LuExternalLink,
  LuGraduationCap,
  LuLandmark,
  LuPenLine,
} from 'react-icons/lu';

import { listMaterialQuizzes, type MaterialQuiz } from '../api/quizzes';
import {
  EXAM_CENTERS,
  EXAM_SOURCE,
  OFFICIAL_EXAMS,
  findOfficialExam,
} from '../exams/catalog';
import { Link, useQuery, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';

export function Exams() {
  const query = useQuery();
  const { navigate } = useRouter();
  const selected = findOfficialExam(query.level?.toUpperCase());
  const [nativeQuizzes, setNativeQuizzes] = useState<Map<string, MaterialQuiz>>(new Map());

  useEffect(() => {
    const controller = new AbortController();
    void listMaterialQuizzes(controller.signal)
      .then(setNativeQuizzes)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const nativeQuiz = nativeQuizzes.get(selected.nativeQuizKey);

  useSeo({
    title: 'Пробные экзамены по сербскому A1–C1 — Читавук',
    description:
      'Официальные онлайн-тесты по сербскому как иностранному A1, A2, B1, B2 и C1 от Университета Ниша.',
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-12">
      <header className="max-w-3xl">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--accent)]">
          <LuGraduationCap className="size-5" />
          Тесты сербского как иностранного
        </p>
        <h1 className="mt-3 font-display text-3xl sm:text-5xl">Проверьте свой уровень</h1>
        <p className="mt-4 text-base leading-7 text-[var(--text-muted)] sm:text-lg">
          Настоящие тесты A1–C1, подготовленные преподавателями Философского факультета
          Университета Ниша. Выберите уровень и решайте задания на сайте университета.
        </p>
      </header>

      <nav aria-label="Уровень экзамена" className="mt-8 flex max-w-xl gap-1 rounded-lg border border-[var(--line)] bg-[var(--bg-sunken)] p-1">
        {OFFICIAL_EXAMS.map((exam) => {
          const active = selected.level === exam.level;
          return (
            <button
              key={exam.level}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(`/exams?level=${exam.level}`, { replace: true })}
              className={`min-h-11 min-w-0 flex-1 rounded-md px-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                active
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-raised)] hover:text-[var(--text)]'
              }`}
            >
              {exam.level}
            </button>
          );
        })}
      </nav>

      <section className="mt-5 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-raised)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-display text-5xl text-[var(--accent)]">{selected.level}</span>
              <h2 className="text-lg font-bold">{selected.name}</h2>
            </div>
            <p className="mt-4 max-w-2xl text-base leading-7">{selected.can}</p>

            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <ExamSkill icon={LuBookOpen} title="Чтение и понимание">
                {selected.reading}
              </ExamSkill>
              <ExamSkill icon={LuPenLine} title="Язык и письмо">
                {selected.writing}
              </ExamSkill>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to={`/tests/${nativeQuiz?.quizId ?? selected.nativeQuizId}`}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:w-auto"
              >
                Пройти в Читавуке
                <LuArrowRight className="size-4" />
              </Link>
              <a
                href={selected.testUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-5 py-3 font-bold transition-colors hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:w-auto"
              >
                Оригинал университета
                <LuExternalLink className="size-4" />
              </a>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              {nativeQuiz && nativeQuiz.attempts > 0
                ? `Попыток: ${nativeQuiz.attempts} · лучший результат: ${nativeQuiz.bestScore}%`
                : 'Внутренний тест сохраняет результат и разбор ошибок в вашем профиле.'}
            </p>
          </div>

          <aside className="border-t border-[var(--line)] bg-[var(--bg-sunken)] p-6 lg:border-l lg:border-t-0">
            <LuLandmark className="size-6 text-[var(--accent)]" />
            <p className="mt-4 text-xs font-bold uppercase text-[var(--text-muted)]">Источник</p>
            <p className="mt-2 font-semibold" lang="sr">{EXAM_SOURCE.name}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]" lang="sr">
              {EXAM_SOURCE.institution}
            </p>
            <a
              href={EXAM_SOURCE.testPage}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline"
            >
              Страница теста
              <LuExternalLink className="size-4" />
            </a>
            <a
              href={EXAM_SOURCE.methodologyPage}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline"
            >
              Разбор тестов A1–A2 (PDF)
              <LuExternalLink className="size-4" />
            </a>
          </aside>
        </div>
      </section>

      <section className="mt-12 border-t border-[var(--line)] pt-9">
        <h2 className="font-display text-2xl">Важно перед началом</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Note>Проходите без переводчика и словаря, иначе результат не покажет реальный уровень.</Note>
          <Note>Начните со своего предполагаемого уровня. Если тест слишком лёгкий или сложный, смените вкладку.</Note>
          <Note>Версия Читавука повторяет структуру открытых образцов, но не выдаётся за экзаменационный билет.</Note>
        </div>
      </section>

      <section className="mt-12 border-t border-[var(--line)] pt-9">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Где получить сертификат</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              Условия и даты смотрите у самого университета.
            </p>
          </div>
          <Link to="/trainer" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
            Потренировать слабые темы
            <LuArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {EXAM_CENTERS.map((center) => (
            <a
              key={center.id}
              href={center.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] p-4 transition-colors hover:border-[var(--accent)]"
            >
              <LuLandmark className="size-5 shrink-0 text-[var(--accent)]" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-5" lang="sr">{center.name}</span>
                <span className="mt-1 block text-sm text-[var(--text-muted)]">{center.city}</span>
              </span>
              <LuExternalLink className="size-4 shrink-0 text-[var(--text-muted)]" />
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

function ExamSkill({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof LuBookOpen;
  title: string;
  children: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{children}</p>
      </div>
    </div>
  );
}

function Note({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-3 text-sm leading-6">
      <LuCheck className="mt-0.5 size-5 shrink-0 text-[var(--success)]" />
      <span>{children}</span>
    </p>
  );
}
