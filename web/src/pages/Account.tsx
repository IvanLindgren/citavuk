import { useEffect, useState } from "react";
import {
  LuBookOpen,
  LuBookmark,
  LuChartNoAxesColumnIncreasing,
  LuClipboardCheck,
  LuFlame,
  LuLibrary,
  LuMedal,
  LuRefreshCw,
  LuRoute,
  LuSparkles,
  LuTrophy,
} from 'react-icons/lu';

import { getProfileStats, type ProfileStats } from '../api/profile';
import { listMaterialQuizzes, type MaterialQuiz } from '../api/quizzes';
import { Mascot } from "../components/Mascot";
import { Button, Card, ErrorNote, Reveal, Spinner } from "../components/ui";
import { plural } from "../lib/books";
import { useRouter } from "../lib/router";
import { useAuth } from "../state/auth";
import { useAnnouncements } from '../state/announcements';
import { useSync } from "../state/sync";
import { useSeo } from '../lib/seo';

export function Account() {
  useSeo({
    title: 'Аккаунт — Читавук',
    noindex: true,
  });

  const { account, loading, logout } = useAuth();
  const { refresh: refreshNotifications } = useAnnouncements();
  const { navigate } = useRouter();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [examQuizzes, setExamQuizzes] = useState<MaterialQuiz[]>([]);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    // Ждём восстановления сессии: иначе при перезагрузке страницы вошедшего
    // пользователя на мгновение выкинуло бы на форму входа.
    if (!loading && !account) navigate("/login", { replace: true });
  }, [loading, account, navigate]);

  useEffect(() => {
    if (!account) return;
    let active = true;
    void getProfileStats()
      .then((value) => {
        if (!active) return;
        setStats(value);
        setStatsError('');
        void refreshNotifications().catch(() => undefined);
      })
      .catch((error: unknown) => {
        if (active) setStatsError(error instanceof Error ? error.message : 'Статистика не загрузилась.');
      });
    void listMaterialQuizzes()
      .then((items) => {
        if (!active) return;
        setExamQuizzes(
          [...items.values()]
            .filter((item) => item.materialKey.startsWith('exam:serbian:'))
            .sort((left, right) => left.materialKey.localeCompare(right.materialKey)),
        );
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [account, refreshNotifications]);

  if (!account) return <div className="min-h-[60vh]" />;

  return (
    <main className="px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <Card className="p-7 sm:p-9">
            <div className="flex items-center gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/12 font-display text-2xl font-bold text-[var(--accent)]">
                {(account.displayName || account.email)
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl">
                  {account.displayName || account.email}
                </h1>
                <p className="truncate text-sm text-[var(--text-muted)]">
                  {account.email}
                </p>
              </div>
            </div>
          </Card>
        </Reveal>

        {statsError && <div className="mt-5"><ErrorNote>{statsError}</ErrorNote></div>}
        {!stats && !statsError && (
          <div className="grid min-h-32 place-items-center"><Spinner /></div>
        )}
        {stats && (
          <>
            <Reveal delay={0.04} className="mt-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile icon={LuBookmark} value={stats.words.added} label="слов добавлено" />
                <StatTile icon={LuSparkles} value={stats.words.learned} label="слов выучено" />
                <StatTile icon={LuRefreshCw} value={stats.words.due} label="ждут повторения" />
                <StatTile icon={LuFlame} value={stats.streakDays} label="дней в серии" />
              </div>
            </Reveal>

            <Reveal delay={0.07} className="mt-5">
              <GoalPanel stats={stats} onOpen={() => navigate('/roadmap')} />
            </Reveal>

            <Reveal delay={0.1} className="mt-5">
              <ActivityChart stats={stats} />
            </Reveal>

            {examQuizzes.length > 0 && (
              <Reveal delay={0.12} className="mt-5">
                <ExamProgress quizzes={examQuizzes} onOpen={() => navigate('/exams')} />
              </Reveal>
            )}

            <Reveal delay={0.13} className="mt-5">
              <section>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-2xl">Достижения</h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Открытые достижения приходят в центр уведомлений.
                    </p>
                  </div>
                  <strong className="text-sm text-[var(--accent)]">
                    {stats.achievements.filter((item) => item.unlockedAt).length}/{stats.achievements.length}
                  </strong>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.achievements.map((achievement) => (
                    <AchievementTile key={achievement.key} achievement={achievement} />
                  ))}
                </div>
              </section>
            </Reveal>
          </>
        )}

        <Reveal delay={0.16} className="mt-5">
          <Card className="p-7">
            <h2 className="text-xl">Синхронизация</h2>
            <p className="mt-2 leading-relaxed text-[var(--text-muted)]">
              Книги, сохранённые слова и карточки повторения синхронизируются
              между приложением и браузером. Текст книги загружается по
              требованию — при первом открытии на новом устройстве.
            </p>
            <SyncPanel />
          </Card>
        </Reveal>

        <Reveal delay={0.19} className="mt-5">
          <Card className="flex flex-col items-center gap-5 p-7 text-center sm:flex-row sm:text-left">
            <div className="w-28 shrink-0">
              <Mascot pose="citavuk_povtor" alt="" width={224} />
            </div>
            <div>
              <h2 className="text-xl">Приложение</h2>
              <p className="mt-2 leading-relaxed text-[var(--text-muted)]">
                В приложении работают импорт PDF, DOCX, FB2, EPUB и DjVu, аудирование
                и офлайн-словарь на 9 тысяч слов.
              </p>
            </div>
          </Card>
        </Reveal>

        <div className="mt-8 flex justify-center">
          <Button
            variant="secondary"
            onClick={async () => {
              await logout();
              navigate("/", { replace: true });
            }}
          >
            Выйти из аккаунта
          </Button>
        </div>

        <Reveal delay={0.22} className="mt-10">
          <DeleteAccountPanel />
        </Reveal>
      </div>
    </main>
  );
}

function ExamProgress({ quizzes, onOpen }: { quizzes: MaterialQuiz[]; onOpen: () => void }) {
  const attempts = quizzes.reduce((sum, quiz) => sum + quiz.attempts, 0);
  const completed = quizzes.filter((quiz) => quiz.bestScore >= 60).length;
  const best = Math.max(0, ...quizzes.map((quiz) => quiz.bestScore));

  return (
    <Card className="p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--accent)]">
            <LuClipboardCheck className="size-4" /> Экзаменационные тесты
          </p>
          <h2 className="mt-2 text-2xl">{completed} из {quizzes.length} уровней пройдено</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {attempts > 0
              ? `${attempts} попыток · лучший результат ${best}%`
              : 'Результаты появятся после первого теста.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onOpen}>К тестам</Button>
      </div>
      <div className="mt-5 grid grid-cols-5 gap-2">
        {quizzes.map((quiz) => {
          const level = quiz.materialKey.split(':')[2]?.toUpperCase() ?? '?';
          const passed = quiz.bestScore >= 60;
          return (
            <div
              key={quiz.quizId}
              className={`min-w-0 rounded-lg border px-2 py-3 text-center ${passed ? 'border-emerald-500 bg-emerald-500/10' : 'border-[var(--line)] bg-[var(--bg-sunken)]'}`}
              title={`${quiz.title}: ${quiz.bestScore}%`}
            >
              <strong className="block text-sm sm:text-base">{level}</strong>
              <span className="mt-1 block truncate text-xs text-[var(--text-muted)]">
                {quiz.attempts > 0 ? `${quiz.bestScore}%` : '—'}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">Уровень засчитывается при результате от 60%.</p>
    </Card>
  );
}

function StatTile({ icon: Icon, value, label }: {
  icon: typeof LuBookmark;
  value: number;
  label: string;
}) {
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <Icon className="size-5 text-[var(--accent)]" />
      <strong className="mt-3 block text-2xl tabular-nums sm:text-3xl">{value}</strong>
      <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)] sm:text-sm">{label}</span>
    </Card>
  );
}

function GoalPanel({ stats, onOpen }: { stats: ProfileStats; onOpen: () => void }) {
  const { goal } = stats;
  const percent = Math.round(Math.max(0, Math.min(1, goal.ratio)) * 100);
  return (
    <Card className="p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--accent)]">
            <LuRoute className="size-4" /> Цель языка
          </p>
          <h2 className="mt-2 text-2xl">
            {goal.target ? `Путь к ${goal.target}` : 'Цель ещё не выбрана'}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {goal.target && goal.total > 0
              ? `${goal.done} из ${goal.total} доступных шагов`
              : 'Выберите ступень на дорожной карте, чтобы видеть общий прогресс.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onOpen}>
          Открыть карту
        </Button>
      </div>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--bg-sunken)]" aria-label={`Прогресс ${percent}%`}>
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-right text-sm font-bold tabular-nums">{percent}%</p>
    </Card>
  );
}

function ActivityChart({ stats }: { stats: ProfileStats }) {
  const max = Math.max(1, ...stats.activity.flatMap((item) => [item.added, item.reviewed]));
  return (
    <Card className="overflow-hidden p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <LuChartNoAxesColumnIncreasing className="size-5 text-[var(--accent)]" />
            Последние 14 дней
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Слова и повторения по дням</p>
        </div>
        <div className="flex gap-4 text-xs text-[var(--text-muted)]">
          <span><i className="mr-1 inline-block size-2 rounded-full bg-[var(--accent)]" />добавлено</span>
          <span><i className="mr-1 inline-block size-2 rounded-full bg-emerald-600" />повторено</span>
        </div>
      </div>
      <div className="mt-6 grid h-44 grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1.5 border-b border-[var(--line)] sm:gap-2">
        {stats.activity.map((point) => (
          <div key={point.day} className="flex h-full min-w-0 items-end justify-center gap-px" title={`${point.day}: +${point.added}, повторено ${point.reviewed}`}>
            <div className="w-[42%] min-w-1 rounded-t bg-[var(--accent)]" style={{ height: `${Math.max(point.added ? 5 : 0, point.added / max * 100)}%` }} />
            <div className="w-[42%] min-w-1 rounded-t bg-emerald-600" style={{ height: `${Math.max(point.reviewed ? 5 : 0, point.reviewed / max * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-[var(--text-muted)]">
        <span>{formatDay(stats.activity[0]?.day)}</span>
        <span>сегодня</span>
      </div>
    </Card>
  );
}

const achievementIcons = {
  bookmark: LuBookmark,
  library: LuLibrary,
  books: LuBookOpen,
  repeat: LuRefreshCw,
  sparkles: LuSparkles,
  medal: LuMedal,
  book: LuBookOpen,
  route: LuRoute,
  trophy: LuTrophy,
} as const;

function AchievementTile({ achievement }: { achievement: ProfileStats['achievements'][number] }) {
  const Icon = achievementIcons[achievement.icon as keyof typeof achievementIcons] ?? LuTrophy;
  const unlocked = Boolean(achievement.unlockedAt);
  return (
    <Card className={`flex min-h-32 items-start gap-4 p-5 ${unlocked ? '' : 'opacity-55 grayscale'}`}>
      <div className={`grid size-11 shrink-0 place-items-center rounded-lg ${unlocked ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-sunken)] text-[var(--text-muted)]'}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <h3 className="text-base">{achievement.title}</h3>
        <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{achievement.description}</p>
        {achievement.unlockedAt && (
          <time className="mt-2 block text-xs font-semibold text-emerald-700">
            Получено {new Date(achievement.unlockedAt).toLocaleDateString('ru-RU')}
          </time>
        )}
      </div>
    </Card>
  );
}

function formatDay(day?: string) {
  if (!day) return '';
  return new Date(`${day}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Удаление аккаунта.
 *
 * Отдельная панель внизу, а не пункт меню: это необратимое действие, и оно
 * должно требовать явного намерения. Ссылку на неё спрашивает Google Play.
 */
function DeleteAccountPanel() {
  const { deleteAccount } = useAuth();
  const { navigate } = useRouter();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await deleteAccount(password);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить аккаунт");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="rounded-2xl border border-[var(--line)] p-5 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          Аккаунт можно удалить вместе со всеми данными: книгами, словами,
          карточками и прогрессом курса. Что хранится и как удаляется —{" "}
          <a className="underline" href="/privacy">
            в политике конфиденциальности
          </a>
          .
        </p>
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-[var(--danger,#a3271f)] underline"
          onClick={() => setOpen(true)}
        >
          Удалить аккаунт
        </button>
      </div>
    );
  }

  return (
    <Card className="border-[var(--danger,#a3271f)] p-6">
      <h2 className="text-xl">Удалить аккаунт</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        Будут удалены книги, сохранённые слова, карточки, прогресс курса и
        дворцы памяти на сервере. Отменить это нельзя. Данные в приложении на
        устройстве останутся.
      </p>

      <label className="mt-4 block text-sm font-semibold">
        Пароль (если вход по паролю)
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
          autoComplete="current-password"
        />
      </label>

      <label className="mt-3 block text-sm font-semibold">
        Введите УДАЛИТЬ для подтверждения
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
        />
      </label>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          onClick={() => void submit()}
          disabled={busy || confirm.trim().toUpperCase() !== "УДАЛИТЬ"}
        >
          {busy ? <Spinner /> : "Удалить навсегда"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </Card>
  );
}

function SyncPanel() {
  const { status, message, pending, lastSync, sync } = useSync();

  return (
    <div className="mt-5 rounded-2xl bg-[var(--bg-sunken)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {message ||
              (lastSync > 0
                ? "Всё синхронизировано"
                : "Готово к синхронизации")}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {pending > 0
              ? `${pending} ${plural(pending, "запись ждёт", "записи ждут", "записей ждут")} отправки`
              : lastSync > 0
                ? `Последний раз: ${new Date(lastSync).toLocaleString("ru")}`
                : "Ещё не синхронизировали"}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void sync()}
          disabled={status === "running"}
        >
          {status === "running" ? <Spinner /> : "Синхронизировать"}
        </Button>
      </div>
    </div>
  );
}
