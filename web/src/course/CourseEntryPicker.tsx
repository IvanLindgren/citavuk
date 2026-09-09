import { useState } from "react";
import { Button } from "../components/ui";
import { useRouter } from "../lib/router";
import { startCourseFrom, uploadCourseProgress } from "./data";
import type { CourseBundle, CourseProgress } from "./types";

export function CourseEntryPicker({
  bundle,
  progress,
}: {
  bundle: CourseBundle;
  progress: CourseProgress;
}) {
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { navigate } = useRouter();
  const lessons = bundle.units.flatMap((u) =>
    u.skills.flatMap((s) =>
      s.lessons.map((l) => ({ ...l, group: `${u.title} · ${s.title}` })),
    ),
  );
  const matches = lessons.filter((l) =>
    `${l.group} ${l.title}`
      .toLocaleLowerCase("ru")
      .includes(query.trim().toLocaleLowerCase("ru")),
  );
  const index = lessons.findIndex((l) => l.id === selected);
  const skipped = lessons
    .slice(0, Math.max(0, index))
    .filter(
      (l) =>
        (progress.lessons[l.id]?.bestScore ?? 0) < bundle.config.passThreshold,
    ).length;
  async function start() {
    if (busy || index < 0) return;
    setBusy(true);
    setError("");
    try {
      const next = startCourseFrom(bundle, selected);
      // Локальное сохранение уже выполнено: сеть не должна блокировать вход.
      void uploadCourseProgress(bundle, next).catch(() => undefined);
      navigate(`/course/lesson/${encodeURIComponent(selected)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выбрать урок.");
      setBusy(false);
    }
  }
  return (
    <details className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-4">
      <summary className="cursor-pointer font-bold text-[var(--accent)]">
        Начать с любого урока
      </summary>
      <div className="mt-4 grid gap-4">
        <label>
          Найти тему или урок
          <input
            className="mt-2 block min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] p-3"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
          />
        </label>
        <label>
          Урок
          <select
            className="mt-2 block min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] p-3"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Выбери урок</option>
            {matches.map((l) => (
              <option key={l.id} value={l.id}>
                {l.group} — {l.title}
              </option>
            ))}
          </select>
        </label>
        {matches.length === 0 && (
          <p>Ничего не найдено. Попробуй другое название.</p>
        )}
        {index >= 0 && (
          <p className="text-sm text-[var(--text-muted)]">
            Предыдущих тем будет отмечено как пропущенные: {skipped}. Результаты
            пройденных уроков сохранятся. За пропуск не начисляются опыт, серия
            и награды. Незавершённая попытка будет сброшена.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <Button disabled={index < 0 || busy} onClick={() => void start()}>
          Начать отсюда
        </Button>
      </div>
    </details>
  );
}
