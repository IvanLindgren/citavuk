import { useEffect, useState } from "react";

import { Mascot } from "../components/Mascot";
import { Button, Card, ErrorNote, Reveal, Spinner } from "../components/ui";
import { plural } from "../lib/books";
import { useRouter } from "../lib/router";
import { useAuth } from "../state/auth";
import { useSync } from "../state/sync";
import { useSeo } from '../lib/seo';

export function Account() {
  useSeo({
    title: 'Аккаунт — Читавук',
    noindex: true,
  });

  const { account, loading, logout } = useAuth();
  const { navigate } = useRouter();

  useEffect(() => {
    // Ждём восстановления сессии: иначе при перезагрузке страницы вошедшего
    // пользователя на мгновение выкинуло бы на форму входа.
    if (!loading && !account) navigate("/login", { replace: true });
  }, [loading, account, navigate]);

  if (!account) return <div className="min-h-[60vh]" />;

  return (
    <main className="px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
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

        <Reveal delay={0.08} className="mt-5">
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

        <Reveal delay={0.14} className="mt-5">
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

        <Reveal delay={0.2} className="mt-10">
          <DeleteAccountPanel />
        </Reveal>
      </div>
    </main>
  );
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
